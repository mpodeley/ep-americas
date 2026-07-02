"""Pipeline orchestrator for the Americas E&P screener.

Flow:
  1. load curated/seed.csv (universe = identity source of truth)
  2. load curated operational.json / overrides.json / hq_coords.json + cache/*.json
  3. enrich market (yfinance, native -> USD via FX) with committed cache fallback
  4. enrich financials (SEC EDGAR XBRL, us-gaap|ifrs-full, USD only) with cache fallback
  5. merge precedence: sec < yfinance < cache < operational-curado < overrides
  6. derive rp_years, ev_ebitda cross-check
  7. validate (hard-fail on schema/range breaks; warn on gaps)
  8. write public/data/companies.json + meta.json; update cache/*.json

Run:  python scripts/build_data.py
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _meta import REPO_ROOT, envelope, write_json, read_json, today_iso  # noqa: E402
from sources import sec_edgar, market_yf  # noqa: E402

CURATED = REPO_ROOT / "curated"
CACHE = REPO_ROOT / "cache"
OUT = REPO_ROOT / "public" / "data"

MARKET_KEYS = [
    "market_cap_usd", "enterprise_value_usd", "ev_ebitda", "pe_ttm",
    "price", "price_currency", "dividend_yield_pct", "beta",
]
FINANCIAL_KEYS = ["revenue_usd", "ebitda_usd", "net_debt_usd", "cfo_usd", "capex_usd"]
OPERATIONAL_KEYS = [
    "production_kboed", "pct_gas", "pct_liquids", "reserves_1p_mmboe",
    "reserves_2p_mmboe", "rp_years", "net_acreage_k", "corp_breakeven_usd_bbl",
]
# Computed in derive() from the fetched/curated fields above (no network).
DERIVED_KEYS = [
    "ev_per_boed_usd", "ev_per_1p_boe_usd", "net_debt_to_ebitda",
    "fcf_usd", "fcf_yield_pct", "capex_to_cfo_pct", "roace_pct",
]


def _s(v):
    v = (v or "").strip()
    return v or None


def load_seed():
    rows = []
    with open(CURATED / "seed.csv", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            rows.append({
                "id": _s(r["id"]),
                "name": _s(r["name"]),
                "category": _s(r["category"]),
                "country": _s(r["country"]),
                "hq_city": _s(r["hq_city"]),
                "canonical_ticker": _s(r["canonical_ticker"]),
                "exchange": _s(r["exchange"]),
                "yf_ticker": _s(r["yf_ticker"]),
                "sec_ticker": _s(r["sec_ticker"]),
                "cik": _s(r.get("cik")),
                "sec_taxonomy": _s(r["sec_taxonomy"]),
                "is_private": (_s(r["is_private"]) or "false").lower() == "true",
            })
    return rows


def enrich_market(seed_row, market_cache, new_market_cache, warnings):
    """Return (market_dict_in_USD | None, source, as_of)."""
    if seed_row["is_private"] or not seed_row["yf_ticker"]:
        return None, None, None
    cid, sym = seed_row["id"], seed_row["yf_ticker"]

    raw = market_yf.fetch_market(sym)
    if raw:
        cur = raw.get("currency") or "USD"
        fx = market_yf.fetch_fx(cur)
        if fx is None:
            warnings.append(f"{cid}: sin FX para {cur}; market cap/EV en USD quedan null")
        cap = raw.get("market_cap")
        ev = raw.get("enterprise_value")
        out = {
            "market_cap_usd": round(cap * fx) if (cap is not None and fx) else None,
            "enterprise_value_usd": round(ev * fx) if (ev is not None and fx) else None,
            "ev_ebitda": raw.get("ev_ebitda"),
            "pe_ttm": raw.get("pe_ttm"),
            "price": raw.get("price"),
            "price_currency": cur,
            "dividend_yield_pct": raw.get("dividend_yield_pct"),
            "beta": raw.get("beta"),
        }
        new_market_cache[cid] = {**out, "as_of": today_iso()}
        return out, "yfinance", today_iso()

    cached = market_cache.get(cid)
    if cached:
        out = {k: cached.get(k) for k in MARKET_KEYS}
        return out, "cache", cached.get("as_of")

    warnings.append(f"{cid}: yfinance falló y no hay caché de mercado")
    return None, None, None


def enrich_financials(seed_row, session, cik_map, sec_cache, new_sec_cache, warnings):
    """Return (financials_dict | None, source)."""
    tax = seed_row["sec_taxonomy"]
    sec_ticker = seed_row["sec_ticker"]
    if not tax or not sec_ticker:
        return None, None
    cid = seed_row["id"]
    # explicit seed CIK wins (covers active tickers missing from SEC's company_tickers.json)
    cik = int(seed_row["cik"]) if seed_row.get("cik") else cik_map.get(sec_ticker.upper())
    if not cik:
        warnings.append(f"{cid}: sin CIK para ticker SEC '{sec_ticker}'")
        cached = sec_cache.get(cid)
        return (cached, "cache") if cached else (None, None)

    fin = sec_edgar.fetch_financials(session, cik, tax)
    sec_edgar.polite_sleep()
    if fin:
        new_sec_cache[cid] = fin
        return fin, f"sec-{tax}"

    cached = sec_cache.get(cid)
    if cached:
        return cached, "cache"
    warnings.append(f"{cid}: SEC sin datos USD (posible reporte en moneda funcional) o fetch falló")
    return None, None


def build_row(seed_row, market, market_src, market_asof, fin, fin_src,
              operational, overrides, hq_coords):
    cid = seed_row["id"]
    row = {k: seed_row[k] for k in
           ["id", "name", "category", "country", "hq_city",
            "canonical_ticker", "exchange", "is_private"]}
    for k in MARKET_KEYS + FINANCIAL_KEYS + OPERATIONAL_KEYS + DERIVED_KEYS:
        row[k] = None
    row["hq_coord"] = hq_coords.get(cid)
    row["src"] = {
        "market": {"source": market_src, "as_of": market_asof},
        "financials": {"source": fin_src, "as_of": None, "fy": None},
        "operational": {"source": None, "as_of": None, "ref": None},
    }

    if market:
        for k in MARKET_KEYS:
            row[k] = market.get(k)
    if fin:
        row["revenue_usd"] = fin.get("revenue_usd")
        row["ebitda_usd"] = fin.get("ebitda_usd")
        row["net_debt_usd"] = fin.get("net_debt_usd")
        row["cfo_usd"] = fin.get("cfo_usd")
        row["capex_usd"] = fin.get("capex_usd")
        row["src"]["financials"]["as_of"] = fin.get("as_of")
        row["src"]["financials"]["fy"] = fin.get("fy")

    op = operational.get(cid) or {}
    for k in OPERATIONAL_KEYS:
        if k in op and op[k] is not None:
            row[k] = op[k]
    if op.get("src"):
        row["src"]["operational"] = op["src"]

    # overrides: highest precedence
    ov = overrides.get(cid) or {}
    for k, v in ov.items():
        if k == "src" and isinstance(v, dict):
            for grp, meta in v.items():
                row["src"][grp] = meta
        elif k in row and not k.startswith("_"):
            row[k] = v

    return row


def derive(row):
    # Reconcile enterprise value: prefer market_cap + net_debt (both USD, consistent) over
    # yfinance's enterpriseValue, which mixes currencies for foreign ADRs (price in USD but
    # debt/cash in the local reporting currency → garbage EV like YPF's ARS-scaled value).
    mc = row.get("market_cap_usd")
    nd = row.get("net_debt_usd")
    if mc is not None and nd is not None:
        row["enterprise_value_usd"] = round(mc + nd)
    elif row.get("price_currency") == "USD" and row.get("country") != "US":
        # foreign ADR (USD price) without SEC net debt → can't trust yfinance EV
        row["enterprise_value_usd"] = None

    prod = row.get("production_kboed")
    r1p = row.get("reserves_1p_mmboe")
    if row.get("rp_years") is None and prod and r1p:
        annual_mmboe = prod * 365 / 1000.0
        if annual_mmboe > 0:
            row["rp_years"] = round(r1p / annual_mmboe, 1)

    ev = row.get("enterprise_value_usd")
    ebitda = row.get("ebitda_usd")
    if row.get("ev_ebitda") is None and ev and ebitda and ebitda > 0:
        row["ev_ebitda"] = round(ev / ebitda, 1)

    # --- E&P valuation & cash/leverage ratios (null unless inputs present) ---
    mc = row.get("market_cap_usd")
    nd = row.get("net_debt_usd")
    cfo = row.get("cfo_usd")
    capex = row.get("capex_usd")

    # EV per flowing barrel (US$ per boe/d)
    if ev and prod:
        row["ev_per_boed_usd"] = round(ev / (prod * 1000))
    # EV per 1P reserve barrel (US$/boe)
    if ev and r1p:
        row["ev_per_1p_boe_usd"] = round(ev / (r1p * 1e6), 2)
    # Leverage (net debt can be negative = net cash; UI renders that specially)
    if nd is not None and ebitda and ebitda > 0:
        row["net_debt_to_ebitda"] = round(nd / ebitda, 2)
    # Free cash flow = CFO - capex (capex normalized to positive outflow)
    if cfo is not None and capex is not None:
        fcf = cfo - abs(capex)
        row["fcf_usd"] = round(fcf)
        if mc and mc > 0:
            row["fcf_yield_pct"] = round(100 * fcf / mc, 1)
    # Reinvestment rate (>100% = outspending operating cash flow)
    if cfo and cfo > 0 and capex is not None:
        row["capex_to_cfo_pct"] = round(100 * abs(capex) / cfo)


def validate(row, errors, warnings):
    cid = row["id"]
    for k in ("pct_gas", "pct_liquids"):
        v = row.get(k)
        if v is not None and not (0 <= v <= 100):
            errors.append(f"{cid}: {k}={v} fuera de rango [0,100]")
    cap = row.get("market_cap_usd")
    if cap is not None and cap <= 0:
        errors.append(f"{cid}: market_cap_usd={cap} <= 0")
    if cap is not None and cap > 2e12:
        warnings.append(f"{cid}: market_cap_usd={cap:.0f} sospechosamente alto (¿moneda?)")
    if not row["is_private"] and row.get("market_cap_usd") is None:
        warnings.append(f"{cid}: sin market cap")
    if row["src"]["financials"]["source"] and str(row["src"]["financials"]["source"]).startswith("sec") \
            and row.get("revenue_usd") is None:
        warnings.append(f"{cid}: filer SEC sin ingresos extraídos")


def build_meta(rows, warnings, market_breakdown):
    ops = [{"id": r["id"], "as_of": r["src"]["operational"]["as_of"]}
           for r in rows if r["src"]["operational"]["as_of"]]
    ops.sort(key=lambda x: x["as_of"])
    return {
        "source_date": today_iso(),
        "counts": {
            "companies": len(rows),
            "with_market": sum(1 for r in rows if r.get("market_cap_usd") is not None),
            "with_financials": sum(1 for r in rows if r.get("revenue_usd") is not None),
            "with_operational": sum(1 for r in rows if r.get("production_kboed") is not None),
        },
        "market_source_breakdown": market_breakdown,
        "operational_oldest": ops[:10],
        "warnings": warnings,
    }


def main():
    seed = load_seed()
    operational = read_json(CURATED / "operational.json", {}) or {}
    overrides = read_json(CURATED / "overrides.json", {}) or {}
    hq_coords = {k: v for k, v in (read_json(CURATED / "hq_coords.json", {}) or {}).items()
                 if not k.startswith("_")}
    market_cache = read_json(CACHE / "market.json", {}) or {}
    sec_cache = read_json(CACHE / "sec.json", {}) or {}

    new_market_cache = dict(market_cache)
    new_sec_cache = dict(sec_cache)
    warnings, errors = [], []
    market_breakdown = {"yfinance": 0, "cache": 0, "none": 0}

    session = sec_edgar._session()
    cik_map = sec_edgar.load_ticker_cik_map(session)
    if not cik_map:
        warnings.append("No se pudo cargar company_tickers.json de SEC; financieras usarán solo caché")

    rows = []
    for sr in seed:
        market, m_src, m_asof = enrich_market(sr, market_cache, new_market_cache, warnings)
        market_breakdown[m_src or "none"] = market_breakdown.get(m_src or "none", 0) + 1
        fin, f_src = enrich_financials(sr, session, cik_map, sec_cache, new_sec_cache, warnings)
        row = build_row(sr, market, m_src, m_asof, fin, f_src,
                        operational, overrides, hq_coords)
        derive(row)
        validate(row, errors, warnings)
        rows.append(row)
        print(f"  {sr['id']:<12} market={m_src or '-':<8} financials={f_src or '-'}")

    if warnings:
        print(f"\n{len(warnings)} advertencias:")
        for w in warnings:
            print(f"  ! {w}")

    # Hard-fail BEFORE writing so bad data never gets published.
    if errors:
        print(f"\n{len(errors)} ERRORES (schema/rango) — no se escribe nada:", file=sys.stderr)
        for e in errors:
            print(f"  x {e}", file=sys.stderr)
        sys.exit(1)

    rows.sort(key=lambda r: r["id"])
    write_json(OUT / "companies.json", envelope(rows, "pipeline", today_iso()))
    write_json(OUT / "meta.json", build_meta(rows, warnings, market_breakdown))
    write_json(CACHE / "market.json", new_market_cache)
    write_json(CACHE / "sec.json", new_sec_cache)

    print(f"\nEscritas {len(rows)} empresas -> public/data/companies.json")
    print(f"  mercado: {market_breakdown}")


if __name__ == "__main__":
    main()
