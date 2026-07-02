"""Price-history derived metrics via yfinance (best-effort).

Computes YTD/1y return, 52-week range position and realized volatility from ~1y of
daily closes. yfinance is fragile in CI, so every call is guarded and the caller falls
back to the committed cache. Returns are currency-agnostic (ratios); the 52-week
high/low are in the listing currency.
"""
import math

try:
    import yfinance as yf
except ImportError:
    yf = None


def _closes(sym):
    """Return list of (date_str, close) for ~1y, or None."""
    if yf is None:
        return None
    try:
        h = yf.Ticker(sym).history(period="1y", auto_adjust=True)
        if h is None or h.empty or "Close" not in h:
            return None
        return [(str(idx.date()), float(v)) for idx, v in h["Close"].items() if v == v]
    except Exception:
        return None


def fetch_price_metrics(sym) -> dict | None:
    closes = _closes(sym)
    if not closes or len(closes) < 30:
        return None
    dates = [d for d, _ in closes]
    vals = [v for _, v in closes]
    last = vals[-1]
    year = dates[-1][:4]

    # YTD: first close of the current calendar year
    ytd_base = next((v for d, v in closes if d[:4] == year), vals[0])
    ytd = round(100 * (last / ytd_base - 1), 1) if ytd_base else None

    # 1y return: first close in the window
    r1y = round(100 * (last / vals[0] - 1), 1) if vals[0] else None

    hi, lo = max(vals), min(vals)
    off_high = round(100 * (last / hi - 1), 1) if hi else None
    above_low = round(100 * (last / lo - 1), 1) if lo else None

    # annualized realized volatility from daily log returns
    rets = [math.log(vals[i] / vals[i - 1]) for i in range(1, len(vals)) if vals[i - 1] > 0]
    vol = None
    if len(rets) > 5:
        mean = sum(rets) / len(rets)
        var = sum((x - mean) ** 2 for x in rets) / (len(rets) - 1)
        vol = round(math.sqrt(var) * math.sqrt(252) * 100, 1)

    return {
        "ytd_return_pct": ytd,
        "return_1y_pct": r1y,
        "high_52w": round(hi, 2),
        "low_52w": round(lo, 2),
        "pct_off_52w_high": off_high,
        "pct_above_52w_low": above_low,
        "realized_vol_1y_pct": vol,
    }
