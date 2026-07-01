"""SEC EDGAR XBRL client.

Resolves CIK from ticker (official company_tickers.json), fetches companyfacts,
and extracts a small set of annual financials in USD. Supports both the us-gaap
and ifrs-full taxonomies (foreign private issuers filing 20-F tag under ifrs-full).

Design choices:
- USD-only: a concept value is used only if tagged in USD units. This avoids mixing
  COP/BRL/ARS with USD (a key data-integrity risk). Filers reporting in their
  functional currency (e.g. Petrobras BRL, Ecopetrol COP) yield null financials here
  and are meant to be filled via the curated layer.
- A descriptive User-Agent is mandatory (SEC returns 403 without it). Override via the
  SEC_USER_AGENT env var.
- Single-threaded with a small delay to stay under SEC's 10 req/s limit.
"""
import os
import time
from datetime import date

import requests

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"

# SEC's WAF requires the User-Agent to contain an email address, else it returns 403.
# Override with your real contact via the SEC_USER_AGENT env var (SEC uses it to reach
# you before rate-limiting).
USER_AGENT = os.environ.get(
    "SEC_USER_AGENT",
    "ep-americas-screener contacto@example.com",
)

ANNUAL_FORMS = ("10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A")

# Concept tag candidates per taxonomy (first hit wins).
TAGS = {
    "us-gaap": {
        "revenue": [
            "Revenues",
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "RevenueFromContractWithCustomerIncludingAssessedTax",
            "OilAndGasRevenue",
        ],
        "operating_income": ["OperatingIncomeLoss"],
        "dda": [
            "DepreciationDepletionAndAmortization",
            "DepreciationAmortizationAndAccretionNet",
            "DepreciationDepletionAndAmortizationExcludingNuclearFuel",
        ],
        "cfo": ["NetCashProvidedByUsedInOperatingActivities"],
        "capex": [
            "PaymentsToAcquirePropertyPlantAndEquipment",
            "PaymentsToAcquireOilAndGasPropertyAndEquipment",
            "PaymentsToAcquireProductiveAssets",
        ],
        "long_term_debt": ["LongTermDebtNoncurrent", "LongTermDebt"],
        "cash": [
            "CashAndCashEquivalentsAtCarryingValue",
            "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
        ],
    },
    "ifrs-full": {
        "revenue": ["Revenue", "RevenueFromContractsWithCustomers"],
        "operating_income": ["ProfitLossFromOperatingActivities"],
        "dda": [
            "DepreciationAndAmortisationExpense",
            "DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss",
        ],
        "cfo": ["CashFlowsFromUsedInOperatingActivities"],
        "capex": [
            "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
        ],
        "long_term_debt": [
            "NoncurrentPortionOfNoncurrentBorrowings",
            "NoncurrentBorrowings",
            "LongtermBorrowings",
            "Borrowings",
        ],
        "cash": ["CashAndCashEquivalents"],
    },
}


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"})
    return s


def _get(session: requests.Session, url: str, tries: int = 3):
    for attempt in range(tries):
        try:
            r = session.get(url, timeout=30)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (403, 429):
                time.sleep(2 ** attempt)
                continue
            return None
        except requests.RequestException:
            time.sleep(2 ** attempt)
    return None


def load_ticker_cik_map(session: requests.Session) -> dict:
    """ticker (upper) -> CIK int, from the official SEC file."""
    data = _get(session, TICKERS_URL)
    if not data:
        return {}
    out = {}
    for row in data.values():
        out[str(row["ticker"]).upper()] = int(row["cik_str"])
    return out


def _days_between(start: str, end: str) -> int:
    y0, m0, d0 = (int(x) for x in start.split("-"))
    y1, m1, d1 = (int(x) for x in end.split("-"))
    return (date(y1, m1, d1) - date(y0, m0, d0)).days


def _pick_annual_usd(fact: dict):
    """Latest full-year USD value for a concept fact. Returns dict or None."""
    units = (fact or {}).get("units", {})
    rows = units.get("USD")
    if not rows:
        return None
    best = None
    for r in rows:
        if r.get("form") not in ANNUAL_FORMS:
            continue
        end = r.get("end")
        if not end:
            continue
        start = r.get("start")
        if start:  # flow: require ~annual span (skip quarters / cumulative stubs)
            span = _days_between(start, end)
            if span < 300 or span > 400:
                continue
        if best is None or end > best["end"]:
            best = r
    if best is None:
        return None
    return {"val": best["val"], "end": best["end"], "fy": best.get("fy")}


def _first_concept(facts_tax: dict, candidates):
    for tag in candidates:
        if tag in facts_tax:
            picked = _pick_annual_usd(facts_tax[tag])
            if picked is not None:
                return picked
    return None


def fetch_financials(session: requests.Session, cik: int, taxonomy: str) -> dict | None:
    """Return annual USD financials for a filer, or None if unavailable.

    Keys: revenue_usd, ebitda_usd, net_debt_usd, cfo_usd, capex_usd, as_of, fy, taxonomy.
    Missing individual concepts are set to None.
    """
    facts = _get(session, FACTS_URL.format(cik=cik))
    if not facts:
        return None
    tax_facts = facts.get("facts", {}).get(taxonomy)
    if not tax_facts:
        return None

    tagmap = TAGS[taxonomy]
    picks = {k: _first_concept(tax_facts, cands) for k, cands in tagmap.items()}

    def val(k):
        return picks[k]["val"] if picks.get(k) else None

    revenue = val("revenue")
    op_income = val("operating_income")
    dda = val("dda")
    cfo = val("cfo")
    capex = val("capex")
    ltd = val("long_term_debt")
    cash = val("cash")

    ebitda = (op_income + dda) if (op_income is not None and dda is not None) else None
    net_debt = (ltd - cash) if (ltd is not None and cash is not None) else None

    # provenance: latest period end across the concepts we actually used
    ends = [p["end"] for p in picks.values() if p]
    fys = [p["fy"] for p in picks.values() if p and p.get("fy") is not None]
    if not ends:
        return None
    as_of = max(ends)
    fy = max(fys) if fys else None

    return {
        "revenue_usd": revenue,
        "ebitda_usd": ebitda,
        "net_debt_usd": net_debt,
        "cfo_usd": cfo,
        "capex_usd": abs(capex) if capex is not None else None,
        "as_of": as_of,
        "fy": fy,
        "taxonomy": taxonomy,
    }


def polite_sleep():
    """Stay well under SEC's 10 req/s limit."""
    time.sleep(0.15)
