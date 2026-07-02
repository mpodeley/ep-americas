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
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"

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
        "assets": ["Assets"],
        "current_liabilities": ["LiabilitiesCurrent"],
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
        "assets": ["Assets"],
        "current_liabilities": ["CurrentLiabilities"],
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


def _annual_series_usd(fact: dict) -> dict:
    """Return {fy: {"val","end"}} across all annual USD facts, keeping the latest-filed
    value per fiscal year (so restatements win)."""
    units = (fact or {}).get("units", {})
    rows = units.get("USD")
    if not rows:
        return {}
    best = {}  # fy -> row
    for r in rows:
        if r.get("form") not in ANNUAL_FORMS:
            continue
        end = r.get("end")
        fy = r.get("fy")
        if not end or fy is None:
            continue
        start = r.get("start")
        if start:  # flow: require ~annual span
            span = _days_between(start, end)
            if span < 300 or span > 400:
                continue
        prev = best.get(fy)
        if prev is None or (r.get("filed", "") > prev.get("filed", "")):
            best[fy] = r
    return {fy: {"val": r["val"], "end": r["end"]} for fy, r in best.items()}


def _concept_series(facts_tax: dict, candidates) -> dict:
    for tag in candidates:
        if tag in facts_tax:
            s = _annual_series_usd(facts_tax[tag])
            if s:
                return s
    return {}


def _cagr_pct(by_year: dict, metric: str, years: list) -> float | None:
    have = [y for y in years if by_year[str(y)].get(metric) is not None]
    if len(have) < 2:
        return None
    first, last = min(have), max(have)
    a, b, n = by_year[str(first)][metric], by_year[str(last)][metric], last - first
    if a is None or b is None or a <= 0 or n <= 0:
        return None
    return round(100 * ((b / a) ** (1 / n) - 1), 1)


def fetch_financials(session: requests.Session, cik: int, taxonomy: str) -> dict | None:
    """Return annual USD financials (latest FY flat fields + multi-year series + ROACE/CAGR).

    Flat keys: revenue_usd, ebitda_usd, net_debt_usd, cfo_usd, capex_usd, roace_pct,
    cagr_revenue_3y_pct, cagr_cfo_3y_pct, financials_by_year, as_of, fy, taxonomy.
    """
    facts = _get(session, FACTS_URL.format(cik=cik))
    if not facts:
        return None
    tax_facts = facts.get("facts", {}).get(taxonomy)
    if not tax_facts:
        return None

    series = {k: _concept_series(tax_facts, cands) for k, cands in TAGS[taxonomy].items()}
    years = sorted({y for s in series.values() for y in s})
    if not years:
        return None

    by_year = {}
    for y in years:
        def g(k):
            v = series[k].get(y)
            return v["val"] if v else None
        oi, dda = g("operating_income"), g("dda")
        ltd, cash = g("long_term_debt"), g("cash")
        assets, curl = g("assets"), g("current_liabilities")
        capex = g("capex")
        by_year[str(y)] = {
            "revenue_usd": g("revenue"),
            "ebitda_usd": (oi + dda) if (oi is not None and dda is not None) else None,
            "net_debt_usd": (ltd - cash) if (ltd is not None and cash is not None) else None,
            "cfo_usd": g("cfo"),
            "capex_usd": abs(capex) if capex is not None else None,
            "ebit_usd": oi,
            "capital_employed_usd": (assets - curl) if (assets is not None and curl is not None) else None,
        }

    latest = max(years)
    flat = by_year[str(latest)]

    # ROACE = EBIT / average capital employed (latest & prior year)
    roace = None
    ebit_now = flat["ebit_usd"]
    ce_now = flat["capital_employed_usd"]
    ce_prev = by_year.get(str(latest - 1), {}).get("capital_employed_usd")
    if ebit_now is not None and ce_now:
        denom = (ce_now + ce_prev) / 2 if ce_prev else ce_now
        if denom and denom > 0:
            roace = round(100 * ebit_now / denom, 1)

    ends = [series[k][latest]["end"] for k in series if latest in series[k]]
    as_of = max(ends) if ends else f"{latest}-12-31"

    return {
        "revenue_usd": flat["revenue_usd"],
        "ebitda_usd": flat["ebitda_usd"],
        "net_debt_usd": flat["net_debt_usd"],
        "cfo_usd": flat["cfo_usd"],
        "capex_usd": flat["capex_usd"],
        "roace_pct": roace,
        "cagr_revenue_3y_pct": _cagr_pct(by_year, "revenue_usd", years),
        "cagr_cfo_3y_pct": _cagr_pct(by_year, "cfo_usd", years),
        "financials_by_year": {k: by_year[k] for k in sorted(by_year)[-5:]},
        "as_of": as_of,
        "fy": latest,
        "taxonomy": taxonomy,
    }


def fetch_latest_filing(session: requests.Session, cik: int) -> dict | None:
    """Latest annual filing (10-K/20-F/40-F) URL + date from the submissions endpoint."""
    data = _get(session, SUBMISSIONS_URL.format(cik=cik))
    if not data:
        return None
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accns = recent.get("accessionNumber", [])
    docs = recent.get("primaryDocument", [])
    dates = recent.get("filingDate", [])
    for i, form in enumerate(forms):
        if form in ("10-K", "20-F", "40-F"):
            accn = accns[i].replace("-", "")
            return {
                "form": form,
                "date": dates[i],
                "url": f"https://www.sec.gov/Archives/edgar/data/{cik}/{accn}/{docs[i]}",
            }
    return None


def polite_sleep():
    """Stay well under SEC's 10 req/s limit."""
    time.sleep(0.15)
