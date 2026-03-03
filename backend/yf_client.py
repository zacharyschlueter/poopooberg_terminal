"""
Yahoo Finance wrapper — provides live prices, OHLCV, analyst data, news, options.
Uses a simple TTL dict cache (60s) to avoid hammering Yahoo.
"""

import time
import math
import pandas as pd
import yfinance as yf
from typing import Optional

_cache: dict = {}
_TTL = 60  # seconds


def _cached(key: str, fn, ttl: int = _TTL):
    now = time.time()
    if key in _cache and now - _cache[key][0] < ttl:
        return _cache[key][1]
    result = fn()
    _cache[key] = (now, result)
    return result


def _safe_float(v) -> Optional[float]:
    try:
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


def _safe_int(v) -> Optional[int]:
    try:
        f = float(v)
        return None if math.isnan(f) else int(f)
    except (TypeError, ValueError):
        return None


def get_quote(symbol: str) -> dict:
    def fetch():
        t = yf.Ticker(symbol)
        info = t.info or {}

        price = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice") or info.get("navPrice"))
        prev  = _safe_float(info.get("previousClose") or info.get("regularMarketPreviousClose"))
        change     = (price - prev) if price is not None and prev is not None else None
        change_pct = (change / prev) if change is not None and prev else None

        ex_div = info.get("exDividendDate")
        if isinstance(ex_div, (int, float)) and not math.isnan(float(ex_div)):
            import datetime
            ex_div = datetime.datetime.fromtimestamp(ex_div).strftime("%Y-%m-%d")
        else:
            ex_div = None

        return {
            "symbol": symbol.upper(),
            "name": info.get("longName") or info.get("shortName", symbol),
            "price": price,
            "change": change,
            "changePct": change_pct,
            "open": _safe_float(info.get("open") or info.get("regularMarketOpen")),
            "dayHigh": _safe_float(info.get("dayHigh") or info.get("regularMarketDayHigh")),
            "dayLow": _safe_float(info.get("dayLow") or info.get("regularMarketDayLow")),
            "prevClose": prev,
            "volume": _safe_int(info.get("volume") or info.get("regularMarketVolume")),
            "avgVolume": _safe_int(info.get("averageVolume")),
            "marketCap": _safe_float(info.get("marketCap")),
            "pe": _safe_float(info.get("trailingPE")),
            "forwardPe": _safe_float(info.get("forwardPE")),
            "eps": _safe_float(info.get("trailingEps")),
            "forwardEps": _safe_float(info.get("forwardEps")),
            "dividend": _safe_float(info.get("dividendRate")),
            "dividendYield": _safe_float(info.get("dividendYield")),
            "exDivDate": ex_div,
            "beta": _safe_float(info.get("beta")),
            "week52High": _safe_float(info.get("fiftyTwoWeekHigh")),
            "week52Low": _safe_float(info.get("fiftyTwoWeekLow")),
            "priceToBook": _safe_float(info.get("priceToBook")),
            "shortRatio": _safe_float(info.get("shortRatio")),
            "shortPct": _safe_float(info.get("shortPercentOfFloat")),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "employees": _safe_int(info.get("fullTimeEmployees")),
            "country": info.get("country"),
            "website": info.get("website"),
            "currency": info.get("currency", "USD"),
            "exchange": info.get("exchange"),
            "recKey": info.get("recommendationKey"),
            "recMean": _safe_float(info.get("recommendationMean")),
            "numAnalysts": _safe_int(info.get("numberOfAnalystOpinions")),
            "targetMean": _safe_float(info.get("targetMeanPrice")),
            "targetHigh": _safe_float(info.get("targetHighPrice")),
            "targetLow": _safe_float(info.get("targetLowPrice")),
            "pctInstitutions": _safe_float(info.get("institutionPercentHeld")),
            "pctInsiders": _safe_float(info.get("heldPercentInsiders")),
            "returnOnEquity": _safe_float(info.get("returnOnEquity")),
            "returnOnAssets": _safe_float(info.get("returnOnAssets")),
            "profitMargins": _safe_float(info.get("profitMargins")),
            "operatingMargins": _safe_float(info.get("operatingMargins")),
            "revenueGrowth": _safe_float(info.get("revenueGrowth")),
            "earningsGrowth": _safe_float(info.get("earningsGrowth")),
            "debtToEquity": _safe_float(info.get("debtToEquity")),
            "payoutRatio": _safe_float(info.get("payoutRatio")),
            "totalDebt": _safe_float(info.get("totalDebt")),
            "totalCash": _safe_float(info.get("totalCash")),
            "freeCashflow": _safe_float(info.get("freeCashflow")),
        }
    return _cached(f"quote:{symbol.upper()}", fetch)


_INTRADAY_IVLS = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"}

# Default interval per period (used when interval == "auto")
_AUTO_INTERVAL = {
    "1d": "5m", "5d": "15m", "1mo": "1d", "3mo": "1d",
    "6mo": "1d", "1y": "1d", "2y": "1wk", "5y": "1wk",
    "10y": "1mo", "max": "1mo",
}


def get_history(symbol: str, period: str = "1y", interval: str = "auto") -> list:
    ivl = _AUTO_INTERVAL.get(period, "1d") if interval == "auto" else interval
    is_intraday = ivl in _INTRADAY_IVLS

    def fetch():
        t = yf.Ticker(symbol)
        hist = t.history(period=period, interval=ivl, auto_adjust=True)
        if hist.empty:
            return []

        # Always sort ascending — yfinance can return unsorted intraday data
        hist = hist.sort_index()

        data = []
        for ts, row in hist.iterrows():
            try:
                if is_intraday:
                    # Return a Unix timestamp (seconds) offset so that
                    # Lightweight Charts — which interprets it as UTC —
                    # displays the market's local wall-clock time.
                    raw = int(ts.timestamp())
                    if hasattr(ts, "utcoffset") and ts.utcoffset() is not None:
                        raw -= int(ts.utcoffset().total_seconds())
                    time_val: object = raw
                else:
                    time_val = ts.date().isoformat() if hasattr(ts, "date") else str(ts)[:10]
            except Exception:
                time_val = str(ts)[:10]

            try:
                data.append({
                    "time":   time_val,
                    "open":   round(float(row["Open"]),  4),
                    "high":   round(float(row["High"]),  4),
                    "low":    round(float(row["Low"]),   4),
                    "close":  round(float(row["Close"]), 4),
                    "volume": int(row["Volume"]),
                })
            except Exception:
                continue

        return data

    # Use a 30s TTL for intraday so the frontend's 30s poll always gets fresh data
    ttl = 30 if is_intraday else 60
    return _cached(f"hist:{symbol.upper()}:{period}:{ivl}", fetch, ttl=ttl)


def get_analyst(symbol: str) -> dict:
    def fetch():
        t = yf.Ticker(symbol)
        info = t.info or {}

        # Recommendations summary
        rec_sum = {"strongBuy": 0, "buy": 0, "hold": 0, "sell": 0, "strongSell": 0}
        try:
            rs = t.recommendations_summary
            if rs is not None and not rs.empty:
                latest = rs.iloc[0]
                rec_sum = {
                    "strongBuy":  int(latest.get("strongBuy", 0) or 0),
                    "buy":        int(latest.get("buy", 0) or 0),
                    "hold":       int(latest.get("hold", 0) or 0),
                    "sell":       int(latest.get("sell", 0) or 0),
                    "strongSell": int(latest.get("strongSell", 0) or 0),
                }
        except Exception:
            pass

        # Recent rating changes — try upgrades_downgrades first (newer yfinance)
        changes = []
        try:
            recs = None
            for attr in ("upgrades_downgrades", "recommendations"):
                try:
                    candidate = getattr(t, attr, None)
                    if candidate is not None and hasattr(candidate, "empty") and not candidate.empty:
                        recs = candidate
                        break
                except Exception:
                    pass

            if recs is not None and not recs.empty:
                def _gc(row, *names):
                    for n in names:
                        v = row.get(n)
                        if v is not None and str(v) not in ("", "nan", "None", "NaN"):
                            return str(v)
                    return ""

                for ts, row in recs.head(25).iterrows():
                    date_str = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
                    changes.append({
                        "date":      date_str,
                        "firm":      _gc(row, "Firm", "firm"),
                        "toGrade":   _gc(row, "ToGrade", "To Grade", "toGrade", "To_Grade"),
                        "fromGrade": _gc(row, "FromGrade", "From Grade", "fromGrade", "From_Grade"),
                        "action":    _gc(row, "Action", "action"),
                    })
        except Exception:
            pass

        price = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
        target_mean = _safe_float(info.get("targetMeanPrice"))
        upside = ((target_mean - price) / price) if target_mean and price and price != 0 else None

        return {
            "consensus": {
                "ratingKey":   info.get("recommendationKey"),
                "ratingMean":  _safe_float(info.get("recommendationMean")),
                "numAnalysts": _safe_int(info.get("numberOfAnalystOpinions")),
                **rec_sum,
            },
            "priceTargets": {
                "current": price,
                "mean":    target_mean,
                "median":  _safe_float(info.get("targetMedianPrice")),
                "high":    _safe_float(info.get("targetHighPrice")),
                "low":     _safe_float(info.get("targetLowPrice")),
                "upside":  upside,
            },
            "recentChanges": changes,
        }
    return _cached(f"analyst:{symbol.upper()}", fetch)


def get_news(symbol: str) -> list:
    def fetch():
        t = yf.Ticker(symbol)
        news = t.news or []
        result = []
        for item in news[:30]:
            content = item.get("content") or {}
            title = item.get("title") or content.get("title", "")
            publisher = (item.get("publisher") or
                         (content.get("provider") or {}).get("displayName", ""))
            link = (item.get("link") or
                    (content.get("canonicalUrl") or {}).get("url", ""))
            result.append({
                "title":       title,
                "publisher":   publisher,
                "link":        link,
                "publishedAt": item.get("providerPublishTime"),
            })
        return result
    return _cached(f"news:{symbol.upper()}", fetch)


def _holder_row(row) -> dict:
    """
    Parse one row from yfinance institutional_holders / mutualfund_holders.
    Column names have changed across yfinance versions, so we try multiple
    known names and fall back to scanning the row index for anything that
    looks like a percentage column.
    """
    def _first(*keys):
        for k in keys:
            v = row.get(k)
            if v is not None and str(v) not in ("nan", "NaN", "None", ""):
                return v
        return None

    def _pct_scan():
        """Fallback: look for any column whose name contains '%' or 'pct'."""
        try:
            for idx in row.index:
                if "%" in str(idx) or "pct" in str(idx).lower():
                    v = row.get(idx)
                    if v is not None and str(v) not in ("nan", "NaN", "None", ""):
                        return v
        except Exception:
            pass
        return None

    name    = str(_first("Holder", "Name", "Institution") or "")
    shares  = _safe_int(_first("Shares", "sharesHeld", "Shares Held"))
    # % Out is a decimal fraction (0.07 = 7%) in all known yfinance versions
    pct_raw = _first("% Out", "% Held", "pctHeld", "Pct Held") or _pct_scan()
    pct     = _safe_float(pct_raw)
    value   = _safe_float(_first("Value", "value"))
    date    = str(_first("Date Reported", "dateReported") or "")[:10]

    return {"name": name, "shares": shares, "pctHeld": pct, "value": value, "date": date}


def get_institutional_holders(symbol: str) -> list:
    def fetch():
        t = yf.Ticker(symbol)
        try:
            ih = t.institutional_holders
            if ih is None or ih.empty:
                return []
            return [_holder_row(row) for _, row in ih.head(25).iterrows()]
        except Exception:
            return []
    return _cached(f"inst:{symbol.upper()}", fetch)


def get_mutual_fund_holders(symbol: str) -> list:
    def fetch():
        t = yf.Ticker(symbol)
        try:
            mf = t.mutualfund_holders
            if mf is None or mf.empty:
                return []
            return [_holder_row(row) for _, row in mf.head(25).iterrows()]
        except Exception:
            return []
    return _cached(f"mf:{symbol.upper()}", fetch)


def get_options(symbol: str, expiration: Optional[str] = None) -> dict:
    def fetch():
        t = yf.Ticker(symbol)
        try:
            expirations = list(t.options)
        except Exception:
            return {"expirations": [], "selected": None, "calls": [], "puts": []}

        if not expirations:
            return {"expirations": [], "selected": None, "calls": [], "puts": []}

        exp = expiration if expiration in expirations else expirations[0]
        try:
            chain = t.option_chain(exp)

            def df_to_list(df: pd.DataFrame) -> list:
                rows = []
                for _, r in df.head(40).iterrows():
                    rows.append({
                        "strike":            _safe_float(r.get("strike")),
                        "lastPrice":         _safe_float(r.get("lastPrice")),
                        "bid":               _safe_float(r.get("bid")),
                        "ask":               _safe_float(r.get("ask")),
                        "volume":            _safe_int(r.get("volume")),
                        "openInterest":      _safe_int(r.get("openInterest")),
                        "impliedVolatility": _safe_float(r.get("impliedVolatility")),
                        "inTheMoney":        bool(r.get("inTheMoney", False)),
                    })
                return rows

            return {
                "expirations": expirations[:24],
                "selected":    exp,
                "calls":       df_to_list(chain.calls),
                "puts":        df_to_list(chain.puts),
            }
        except Exception:
            return {"expirations": expirations[:24], "selected": exp, "calls": [], "puts": []}

    key = f"options:{symbol.upper()}:{expiration or 'default'}"
    return _cached(key, fetch)
