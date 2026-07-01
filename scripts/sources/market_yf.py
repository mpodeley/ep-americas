"""Market data via yfinance (Yahoo).

yfinance is an unofficial scraper: fragile, rate-limited, and hostile to CI IPs.
Every call is wrapped in retry/backoff and returns None on failure so the caller can
fall back to the committed cache. Values are returned in the listing's native currency;
the caller converts to USD using fetch_fx().
"""
import time

try:
    import yfinance as yf
except ImportError:  # allow importing the module without the dep for tooling
    yf = None


def _retry(fn, tries: int = 3):
    for attempt in range(tries):
        try:
            out = fn()
            if out is not None:
                return out
        except Exception:
            pass
        time.sleep(2 ** attempt)
    return None


def _norm_div_yield(v):
    """yfinance returns dividendYield as a fraction (0.03) or percent (3.0) depending
    on version. E&P yields are < ~15%, so treat values < 1 as fractions."""
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return round(v * 100, 2) if v < 1 else round(v, 2)


def fetch_market(sym: str) -> dict | None:
    """Market snapshot in NATIVE currency. Keys: market_cap, enterprise_value, price,
    currency, ev_ebitda, pe_ttm, dividend_yield_pct, beta. None on total failure."""
    if yf is None:
        return None

    def pull():
        t = yf.Ticker(sym)
        out = {}
        # fast_info: reliable for price / market cap / currency
        try:
            fi = t.fast_info
            out["price"] = _f(getattr(fi, "last_price", None))
            out["market_cap"] = _f(getattr(fi, "market_cap", None))
            out["currency"] = getattr(fi, "currency", None)
        except Exception:
            pass
        # info: richer but flaky — ratios only, tolerate failure
        try:
            info = t.info or {}
            out.setdefault("price", _f(info.get("currentPrice")))
            out.setdefault("market_cap", _f(info.get("marketCap")))
            out.setdefault("currency", info.get("currency"))
            out["enterprise_value"] = _f(info.get("enterpriseValue"))
            out["ev_ebitda"] = _round(info.get("enterpriseToEbitda"), 2)
            out["pe_ttm"] = _round(info.get("trailingPE"), 2)
            out["dividend_yield_pct"] = _norm_div_yield(info.get("dividendYield"))
            out["beta"] = _round(info.get("beta"), 2)
        except Exception:
            pass
        # consider it a success only if we got at least a price or market cap
        if out.get("price") is None and out.get("market_cap") is None:
            return None
        return out

    return _retry(pull)


_FX_CACHE: dict = {}


def fetch_fx(currency: str) -> float | None:
    """Rate to convert `currency` -> USD (USD -> 1.0). Uses Yahoo FX pairs, cached."""
    if not currency:
        return None
    currency = currency.upper()
    if currency == "USD":
        return 1.0
    if currency in _FX_CACHE:
        return _FX_CACHE[currency]
    if yf is None:
        return None

    def pull():
        t = yf.Ticker(f"{currency}USD=X")
        try:
            rate = _f(getattr(t.fast_info, "last_price", None))
        except Exception:
            rate = None
        return rate

    rate = _retry(pull)
    if rate:
        _FX_CACHE[currency] = rate
    return rate


def _f(v):
    try:
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _round(v, ndigits):
    v = _f(v)
    return round(v, ndigits) if v is not None else None
