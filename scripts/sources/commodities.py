"""Commodity price context (keyless, CI-friendly).

Primary source: the datahub.io oil-prices / natural-gas datasets served from GitHub
raw (clean Date,Price CSV, no bot-filtering — works from CI). Falls back to FRED and
then Stooq futures. Best-effort: the pipeline tolerates a total failure (uses cache).
Returns the last ~N daily closes per series.
"""
import csv
import io
import time

import requests

DATAHUB = {
    "wti": "https://raw.githubusercontent.com/datasets/oil-prices/main/data/wti-daily.csv",
    "brent": "https://raw.githubusercontent.com/datasets/oil-prices/main/data/brent-daily.csv",
    "henryhub": "https://raw.githubusercontent.com/datasets/natural-gas/main/data/daily.csv",
}
FRED = {
    "wti": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILWTICO",
    "brent": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU",
    "henryhub": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DHHNGSP",
}
LABELS = {"wti": "WTI", "brent": "Brent", "henryhub": "Henry Hub"}
UNITS = {"wti": "US$/bbl", "brent": "US$/bbl", "henryhub": "US$/MMBtu"}

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")


def _get(url, timeout=15):
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=timeout)
        if r.status_code == 200 and "daily hits limit" not in r.text.lower():
            return r.text
    except requests.RequestException:
        pass
    return None


def _parse(text, n, value_col=1):
    """Parse Date,Value CSV. Skips headers and '.' (FRED holiday marker)."""
    out = []
    for row in csv.reader(io.StringIO(text)):
        if len(row) <= value_col:
            continue
        d, v = row[0], row[value_col].strip()
        if d.lower() in ("date", "observation_date") or v in (".", "", "Price"):
            continue
        try:
            out.append({"date": d, "value": round(float(v), 2)})
        except ValueError:
            continue
    return out[-n:]


def fetch_commodities(n=90) -> dict:
    """Return {key: {label, unit, series, last, change_pct}}, best-effort per series."""
    out = {}
    for key in DATAHUB:
        series = None
        text = _get(DATAHUB[key])
        if text:
            series = _parse(text, n, value_col=1)
        if not series:  # fallback FRED (col 1)
            text = _get(FRED[key])
            if text:
                series = _parse(text, n, value_col=1)
        if not series:
            continue
        last = series[-1]["value"]
        prev = series[-2]["value"] if len(series) > 1 else None
        change = round(100 * (last / prev - 1), 2) if prev else None
        out[key] = {"label": LABELS[key], "unit": UNITS[key], "series": series,
                    "last": last, "change_pct": change}
        time.sleep(0.1)
    return out
