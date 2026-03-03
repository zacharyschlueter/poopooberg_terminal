"""SEC EDGAR API Client — rate-limited, LRU-cached."""

import time
import requests
from functools import lru_cache
from typing import Optional

HEADERS = {
    "User-Agent": "EDGARTerminalWeb/1.0 research@terminal.local",
    "Accept-Encoding": "gzip, deflate",
}
_last_req = 0.0


def _get(url: str, timeout: int = 30) -> requests.Response:
    global _last_req
    wait = 0.11 - (time.time() - _last_req)
    if wait > 0:
        time.sleep(wait)
    resp = requests.get(url, headers=HEADERS, timeout=timeout)
    _last_req = time.time()
    return resp


@lru_cache(maxsize=1)
def _load_tickers() -> dict:
    resp = _get("https://www.sec.gov/files/company_tickers.json")
    resp.raise_for_status()
    return resp.json()


def get_cik(ticker: str) -> Optional[str]:
    t = ticker.upper().strip()
    for entry in _load_tickers().values():
        if entry["ticker"].upper() == t:
            return str(entry["cik_str"]).zfill(10)
    return None


def get_ticker_info(ticker: str) -> Optional[dict]:
    t = ticker.upper().strip()
    for entry in _load_tickers().values():
        if entry["ticker"].upper() == t:
            return {
                "cik": str(entry["cik_str"]).zfill(10),
                "ticker": entry["ticker"],
                "name": entry["title"],
            }
    return None


def get_submissions(cik: str) -> dict:
    resp = _get(f"https://data.sec.gov/submissions/CIK{cik}.json")
    resp.raise_for_status()
    return resp.json()


def get_company_facts(cik: str) -> dict:
    resp = _get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json")
    resp.raise_for_status()
    return resp.json()


def search_companies(query: str, max_results: int = 25) -> list:
    q = query.lower().strip()
    results = []
    for entry in _load_tickers().values():
        if q in entry["title"].lower() or q in entry["ticker"].lower():
            results.append({
                "cik": str(entry["cik_str"]).zfill(10),
                "ticker": entry["ticker"],
                "name": entry["title"],
            })
        if len(results) >= max_results:
            break
    return results
