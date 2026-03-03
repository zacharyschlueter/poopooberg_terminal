"""
EDGAR Terminal Web — FastAPI Backend
Serves all financial data from SEC EDGAR + Yahoo Finance.
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

import edgar_client as ec
import extractor as ex
import yf_client as yf
import ratios_calc as rc

app = FastAPI(title="EDGAR Terminal API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Utility ──────────────────────────────────────────────────────────────────

def _require_cik(symbol: str) -> tuple[str, str]:
    info = ec.get_ticker_info(symbol)
    if not info:
        raise HTTPException(404, f"Ticker '{symbol}' not found in SEC EDGAR")
    return info["cik"], info["name"]


def _periods_and_vals(facts, anchor_key: str, n: int = 5):
    """
    Return (period_labels, series) for the n most recent annual fiscal years.

    Design:
    • Uses ex.annual() — ALL entries — instead of latest_n(n+10).
      Balance-sheet concepts (instant values, no 'start') are included even
      when the 10-K contains quarterly snapshots at non-year-end dates; those
      extra entries would exhaust a fixed-size buffer and produce the wrong
      year range.
    • Deduplicates by the calendar year of the end date (end[:4]) rather than
      the fy field.  fy can be null, 0, or absent in some EDGAR filings; the
      end date is always present.  For each year we keep the entry with the
      latest end date so that a December 31 annual snapshot beats a mid-year
      entry from the same 10-K.
    """
    all_series = ex.annual(facts, anchor_key)
    if not all_series:
        return [], []

    by_year: dict[str, dict] = {}
    for s in all_series:
        year = s["end"][:4]
        if year not in by_year or s["end"] > by_year[year]["end"]:
            by_year[year] = s

    series = sorted(by_year.values(), key=lambda x: x["end"])[-n:]

    # Always derive the label from end[:4] — never from the fy field.
    # In EDGAR, comparative entries included in a recent 10-K filing can have
    # fy set to the *filing's* fiscal year rather than the *period's* year,
    # causing three separate years (e.g. 2022, 2023, 2024) to all display as
    # "FY2025".  end[:4] is always the calendar year of the period end date,
    # which is exactly what we want for display.
    periods = [f"FY{s['end'][:4]}" for s in series]

    return periods, series


def _aligned_vals(facts, key: str, anchor_series: list):
    """
    Extract values for 'key' aligned to the anchor period series.

    Joins on end-date year (end[:4]) — the same key used in _periods_and_vals.
    all_vals is sorted ascending by end date, so iteration overwrites earlier
    same-year entries with later ones (keeps the most recent snapshot per year).
    """
    all_vals = ex.annual(facts, key)
    by_year: dict[str, float] = {}
    for s in all_vals:
        by_year[s["end"][:4]] = s["val"]
    return [by_year.get(ref["end"][:4]) for ref in anchor_series]


def _fin_row(label: str, values: list, typ: str = "usd",
             indent: int = 0, bold: bool = False) -> dict:
    return {"label": label, "values": values, "type": typ,
            "indent": indent, "bold": bold}


def _scale(vals: list, divisor: float = 1e6) -> list:
    return [v / divisor if v is not None else None for v in vals]


# ── Search ───────────────────────────────────────────────────────────────────

@app.get("/api/search")
def search(q: str = Query(..., min_length=1)):
    results = ec.search_companies(q, max_results=20)
    return results


# ── Quote (yfinance) ──────────────────────────────────────────────────────────

@app.get("/api/ticker/{symbol}/quote")
def get_quote(symbol: str):
    try:
        return yf.get_quote(symbol.upper())
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Price History (yfinance) ──────────────────────────────────────────────────

@app.get("/api/ticker/{symbol}/history")
def get_history(symbol: str, period: str = "1y", interval: str = "auto"):
    valid_periods   = {"1d","5d","1mo","3mo","6mo","1y","2y","5y","10y","max"}
    valid_intervals = {"auto","1m","2m","5m","15m","30m","60m","1h","1d","1wk","1mo"}
    if period not in valid_periods:
        raise HTTPException(400, f"period must be one of {valid_periods}")
    if interval not in valid_intervals:
        raise HTTPException(400, f"interval must be one of {valid_intervals}")
    try:
        return yf.get_history(symbol.upper(), period, interval)
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Overview (EDGAR + yfinance) ──────────────────────────────────────────────

@app.get("/api/ticker/{symbol}/overview")
def get_overview(symbol: str):
    cik, name = _require_cik(symbol.upper())
    subs = ec.get_submissions(cik)

    addr_bus  = subs.get("addresses", {}).get("business", {})
    addr_mail = subs.get("addresses", {}).get("mailing", {})

    def fmt_addr(a):
        return ", ".join(p for p in [
            a.get("street1",""), a.get("street2",""),
            a.get("city",""), a.get("stateOrCountry",""), a.get("zipCode",""),
        ] if p)

    recent = subs.get("filings", {}).get("recent", {})
    forms  = recent.get("form", [])
    dates  = recent.get("filingDate", [])

    def last_filed(form_type):
        for f, d in zip(forms, dates):
            if f == form_type:
                return d
        return None

    # Live yfinance info for extra fields
    try:
        quote = yf.get_quote(symbol.upper())
        yf_sector   = quote.get("sector")
        yf_industry = quote.get("industry")
        yf_website  = quote.get("website")
        yf_employees= quote.get("employees")
        yf_summary  = None
        import yfinance as _yf
        _info = _yf.Ticker(symbol).info
        yf_summary = _info.get("longBusinessSummary", "")
    except Exception:
        yf_sector = yf_industry = yf_website = yf_summary = None
        yf_employees = None

    # XBRL snapshot
    try:
        facts = ec.get_company_facts(cik)
        snap = {
            "revenue":     ex.latest_val(facts, "revenue"),
            "netIncome":   ex.latest_val(facts, "net_income"),
            "totalAssets": ex.latest_val(facts, "total_assets"),
            "equity":      ex.latest_val(facts, "equity"),
            "epsDiluted":  ex.latest_val(facts, "eps_diluted"),
            "sharesOut":   ex.latest_val(facts, "shares_outstanding"),
            "employees":   ex.latest_val(facts, "employees", "10-K"),
        }
    except Exception:
        snap = {}

    fye = subs.get("fiscalYearEnd", "")
    months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    try:
        fye_str = f"{months[int(fye[:2])-1]} {fye[2:]}" if len(fye) == 4 else fye
    except Exception:
        fye_str = fye

    return {
        "name":            name,
        "ticker":          symbol.upper(),
        "cik":             cik.lstrip("0"),
        "ein":             subs.get("ein"),
        "sic":             subs.get("sic"),
        "sicDescription":  subs.get("sicDescription"),
        "stateOfInc":      subs.get("stateOfIncorporation"),
        "fiscalYearEnd":   fye_str,
        "entityType":      subs.get("entityType"),
        "businessAddress": fmt_addr(addr_bus) or None,
        "mailingAddress":  fmt_addr(addr_mail) or None,
        "phone":           addr_bus.get("phone"),
        "sector":          yf_sector,
        "industry":        yf_industry,
        "website":         yf_website,
        "employees":       yf_employees or (int(snap["employees"]) if snap.get("employees") else None),
        "description":     yf_summary,
        "lastFiled": {
            "10-K":    last_filed("10-K"),
            "10-Q":    last_filed("10-Q"),
            "8-K":     last_filed("8-K"),
            "DEF 14A": last_filed("DEF 14A"),
        },
        "snapshot": snap,
    }


# ── Financial Statements (EDGAR XBRL) ────────────────────────────────────────

@app.get("/api/ticker/{symbol}/financials/{stmt}")
def get_financials(symbol: str, stmt: str):
    if stmt not in ("income", "balance", "cashflow", "fa"):
        raise HTTPException(400, "stmt must be income|balance|cashflow|fa")

    cik, _ = _require_cik(symbol.upper())
    facts   = ec.get_company_facts(cik)

    if stmt in ("income", "fa"):
        anchor_key = "revenue"
        periods, anchor = _periods_and_vals(facts, anchor_key)
        if not periods:
            raise HTTPException(404, "No annual income data found")

        def g(k): return _aligned_vals(facts, k, anchor)
        M = 1e6

        rev   = [s["val"] for s in anchor]
        cogs  = g("cogs");  gp = g("gross_profit")
        rd    = g("rd_expense"); sga_ = g("sga"); da = g("depreciation")
        oi    = g("operating_income"); int_e = g("interest_expense")
        int_i = g("interest_income"); tax = g("income_tax"); ni = g("net_income")
        eps_b = g("eps_basic"); eps_d = g("eps_diluted")
        sh_d  = g("shares_diluted")
        ocf   = g("operating_cf"); cap = g("capex")
        fcf   = [(o - abs(c)) / M if o and c else None for o, c in zip(ocf, cap)]

        def pct_row(label, num_list, den_list, indent=1):
            vals = [ex.safe_div(n, d) for n, d in zip(num_list, den_list)]
            return _fin_row(label, vals, "pct", indent)

        rows = [
            {"label": "INCOME STATEMENT", "type": "header"},
            _fin_row("Revenue",              _scale(rev),  "usd", 0, True),
            _fin_row("Cost of Revenue",      _scale(cogs), "usd", 1),
            {"label": "---", "type": "divider"},
            _fin_row("Gross Profit",         _scale(gp),   "usd", 0, True),
            pct_row("Gross Margin",          gp, rev),
            {"label": "---", "type": "divider"},
            _fin_row("R&D Expense",          _scale(rd),   "usd", 1),
            _fin_row("SG&A Expense",         _scale(sga_), "usd", 1),
            _fin_row("Depreciation & Amort", _scale(da),   "usd", 1),
            {"label": "---", "type": "divider"},
            _fin_row("Operating Income",     _scale(oi),   "usd", 0, True),
            pct_row("Operating Margin",      oi, rev),
            {"label": "---", "type": "divider"},
            _fin_row("Interest Expense",     _scale(int_e),"usd", 1),
            _fin_row("Interest Income",      _scale(int_i),"usd", 1),
            _fin_row("Income Tax",           _scale(tax),  "usd", 1),
            {"label": "---", "type": "divider"},
            _fin_row("Net Income",           _scale(ni),   "usd", 0, True),
            pct_row("Net Margin",            ni, rev),
            {"label": "---", "type": "divider"},
            _fin_row("EPS (Basic)",          eps_b, "eps"),
            _fin_row("EPS (Diluted)",        eps_d, "eps"),
            _fin_row("Diluted Shares (M)",   [v/1e6 if v else None for v in sh_d], "plain1"),
        ]

        if stmt == "fa":
            rows += [
                {"label": "CASH FLOW SUMMARY", "type": "header"},
                _fin_row("Operating CF", _scale(ocf), "usd", 0),
                _fin_row("CapEx",        [abs(v)/M if v else None for v in cap], "usd", 1),
                _fin_row("Free Cash Flow", fcf, "usd", 0, True),
            ]

        return {"periods": periods, "rows": rows, "note": "USD in Millions"}

    if stmt == "balance":
        anchor_key = "total_assets"
        periods, anchor = _periods_and_vals(facts, anchor_key)
        if not periods:
            raise HTTPException(404, "No annual balance sheet data found")

        def g(k): return _aligned_vals(facts, k, anchor)

        rows = [
            {"label": "ASSETS", "type": "header"},
            _fin_row("Cash & Equivalents",      _scale(g("cash")),                 "usd"),
            _fin_row("Short-term Investments",   _scale(g("short_term_investments")),"usd", 1),
            _fin_row("Accounts Receivable",      _scale(g("accounts_receivable")),  "usd", 1),
            _fin_row("Inventory",                _scale(g("inventory")),            "usd", 1),
            _fin_row("Total Current Assets",     _scale(g("current_assets")),       "usd", 0, True),
            {"label": "---", "type": "divider"},
            _fin_row("Property Plant & Equip.",  _scale(g("ppe")),                  "usd", 1),
            _fin_row("Goodwill",                 _scale(g("goodwill")),             "usd", 1),
            _fin_row("Intangible Assets",        _scale(g("intangibles")),          "usd", 1),
            _fin_row("Total Non-current Assets", _scale(g("non_current_assets")),   "usd", 0, True),
            {"label": "---", "type": "divider"},
            _fin_row("TOTAL ASSETS",             _scale([s["val"] for s in anchor]),"usd", 0, True),
            {"label": "---", "type": "divider"},
            {"label": "LIABILITIES", "type": "header"},
            _fin_row("Accounts Payable",         _scale(g("accounts_payable")),     "usd", 1),
            _fin_row("Short-term Debt",          _scale(g("short_term_debt")),      "usd", 1),
            _fin_row("Total Current Liab.",      _scale(g("current_liabilities")),  "usd", 0, True),
            {"label": "---", "type": "divider"},
            _fin_row("Long-term Debt",           _scale(g("long_term_debt")),       "usd", 1),
            _fin_row("Total Liabilities",        _scale(g("total_liabilities")),    "usd", 0, True),
            {"label": "---", "type": "divider"},
            {"label": "EQUITY", "type": "header"},
            _fin_row("Retained Earnings",        _scale(g("retained_earnings")),    "usd", 1),
            _fin_row("Total Equity",             _scale(g("equity")),               "usd", 0, True),
        ]
        return {"periods": periods, "rows": rows, "note": "USD in Millions"}

    if stmt == "cashflow":
        anchor_key = "operating_cf"
        periods, anchor = _periods_and_vals(facts, anchor_key)
        if not periods:
            raise HTTPException(404, "No annual cash flow data found")

        def g(k): return _aligned_vals(facts, k, anchor)
        ocf_vals = [s["val"] for s in anchor]
        cap_vals = g("capex")
        M = 1e6

        rows = [
            {"label": "OPERATING ACTIVITIES", "type": "header"},
            _fin_row("Operating Cash Flow",    _scale(ocf_vals),     "usd", 0, True),
            _fin_row("Depreciation & Amort",   _scale(g("depreciation")), "usd", 1),
            {"label": "---", "type": "divider"},
            {"label": "INVESTING ACTIVITIES", "type": "header"},
            _fin_row("Capital Expenditures",   [abs(v)/M if v else None for v in cap_vals], "usd", 1),
            _fin_row("Investing CF",           _scale(g("investing_cf")),  "usd", 0, True),
            {"label": "---", "type": "divider"},
            {"label": "FINANCING ACTIVITIES", "type": "header"},
            _fin_row("Dividends Paid",         [abs(v)/M if v else None for v in g("dividends_paid")], "usd", 1),
            _fin_row("Share Buybacks",         [abs(v)/M if v else None for v in g("buybacks")], "usd", 1),
            _fin_row("Financing CF",           _scale(g("financing_cf")),  "usd", 0, True),
            {"label": "---", "type": "divider"},
            {"label": "FREE CASH FLOW", "type": "header"},
            _fin_row("Free Cash Flow", [(o-abs(c))/M if o and c else None
                                       for o, c in zip(ocf_vals, cap_vals)], "usd", 0, True),
        ]
        return {"periods": periods, "rows": rows, "note": "USD in Millions"}


# ── Ratios (EDGAR XBRL) ───────────────────────────────────────────────────────

@app.get("/api/ticker/{symbol}/ratios")
def get_ratios(symbol: str):
    cik, _ = _require_cik(symbol.upper())
    facts   = ec.get_company_facts(cik)
    return rc.calculate(facts)


# ── Earnings (EDGAR XBRL) ─────────────────────────────────────────────────────

@app.get("/api/ticker/{symbol}/earnings")
def get_earnings(symbol: str):
    cik, _ = _require_cik(symbol.upper())
    facts   = ec.get_company_facts(cik)

    annual_b = ex.latest_n(facts, "eps_basic",   8, "10-K")
    annual_d = ex.latest_n(facts, "eps_diluted", 8, "10-K")
    q_d      = ex.latest_n(facts, "eps_diluted", 12, "10-Q")
    q_b      = ex.latest_n(facts, "eps_basic",   12, "10-Q")

    def merge_eps(basic_list, diluted_list):
        d_map = {str(s.get("fy") or s["end"][:4]): s["val"] for s in diluted_list}
        b_map = {str(s.get("fy") or s["end"][:4]): s["val"] for s in basic_list}
        fys = sorted(set(list(d_map) + list(b_map)))
        return [{"fy": fy, "basic": b_map.get(fy), "diluted": d_map.get(fy)} for fy in fys]

    quarterly = []
    d_q_map = {s["end"]: s["val"] for s in q_d}
    b_q_map = {s["end"]: s["val"] for s in q_b}
    all_ends = sorted(set(list(d_q_map) + list(b_q_map)))[-12:]
    for end in all_ends:
        quarterly.append({"period": end, "basic": b_q_map.get(end), "diluted": d_q_map.get(end)})

    return {
        "annual":    merge_eps(annual_b, annual_d),
        "quarterly": quarterly,
    }


# ── Dividends (EDGAR XBRL) ────────────────────────────────────────────────────

@app.get("/api/ticker/{symbol}/dividends")
def get_dividends(symbol: str):
    cik, _ = _require_cik(symbol.upper())
    facts   = ec.get_company_facts(cik)

    annual_dps  = ex.latest_n(facts, "dividends_per_share", 10, "10-K")
    total_dvd   = ex.latest_n(facts, "dividends_paid",       10, "10-K")
    q_dps       = ex.latest_n(facts, "dividends_per_share",  16, "10-Q")

    def series_to_list(series, scale=1.0):
        return [{"period": s.get("fy") or s["end"][:4], "value": s["val"] * scale,
                 "end": s["end"]} for s in series]

    return {
        "annualDPS":   series_to_list(annual_dps),
        "totalPaid":   series_to_list(total_dvd, 1/1e6),  # in millions
        "quarterlyDPS":series_to_list(q_dps),
    }


# ── Analyst Coverage (yfinance) ───────────────────────────────────────────────

@app.get("/api/ticker/{symbol}/analyst")
def get_analyst(symbol: str):
    try:
        return yf.get_analyst(symbol.upper())
    except Exception as e:
        raise HTTPException(500, str(e))


# ── News (yfinance) ───────────────────────────────────────────────────────────

@app.get("/api/ticker/{symbol}/news")
def get_news(symbol: str):
    try:
        return yf.get_news(symbol.upper())
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Filings (EDGAR) ───────────────────────────────────────────────────────────

@app.get("/api/ticker/{symbol}/filings")
def get_filings(symbol: str, form: Optional[str] = None):
    cik, _ = _require_cik(symbol.upper())
    subs = ec.get_submissions(cik)
    recent = subs.get("filings", {}).get("recent", {})

    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accns = recent.get("accessionNumber", [])
    docs  = recent.get("primaryDocument", [])

    cik_int = int(cik)
    DESCRIPTIONS = {
        "10-K": "Annual Report", "10-Q": "Quarterly Report",
        "8-K":  "Current Report", "DEF 14A": "Proxy Statement",
        "S-1":  "IPO Registration", "SC 13G": "Passive Ownership >5%",
        "SC 13D":"Active Ownership >5%", "4": "Insider Transaction",
        "20-F": "Annual (Foreign)", "6-K": "Current (Foreign)",
    }

    result = []
    for i, (f, d, a) in enumerate(zip(forms, dates, accns)):
        if form and f != form and f != form.replace("8K","8-K").replace("10K","10-K"):
            continue
        doc = docs[i] if i < len(docs) else ""
        accn_clean = a.replace("-", "")
        url = (f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accn_clean}/{doc}"
               if doc else f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accn_clean}/")
        result.append({
            "form": f, "date": d, "accession": a,
            "description": DESCRIPTIONS.get(f, ""),
            "url": url,
        })
        if len(result) >= 100:
            break

    return result


# ── Ownership (EDGAR + yfinance) ──────────────────────────────────────────────

@app.get("/api/ticker/{symbol}/ownership")
def get_ownership(symbol: str):
    cik, _ = _require_cik(symbol.upper())
    subs = ec.get_submissions(cik)
    recent = subs.get("filings", {}).get("recent", {})

    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accns = recent.get("accessionNumber", [])
    docs  = recent.get("primaryDocument", [])
    cik_int = int(cik)

    insider_forms, major_forms = [], []
    for i, (f, d, a) in enumerate(zip(forms, dates, accns)):
        doc = docs[i] if i < len(docs) else ""
        accn_clean = a.replace("-", "")
        url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accn_clean}/{doc}"
        entry = {"form": f, "date": d, "accession": a, "url": url}
        if f in ("4", "4/A") and len(insider_forms) < 30:
            insider_forms.append(entry)
        elif f in ("SC 13G","SC 13G/A","SC 13D","SC 13D/A") and len(major_forms) < 20:
            major_forms.append(entry)

    inst_holders = yf.get_institutional_holders(symbol.upper())

    return {
        "institutional": inst_holders,
        "insiderTransactions": insider_forms,
        "majorHolders13DG":   major_forms,
    }


# ── Options (yfinance) ────────────────────────────────────────────────────────

@app.get("/api/ticker/{symbol}/options")
def get_options(symbol: str, expiration: Optional[str] = None):
    try:
        return yf.get_options(symbol.upper(), expiration)
    except Exception as e:
        raise HTTPException(500, str(e))


# ── CAGR (EDGAR XBRL) ─────────────────────────────────────────────────────────

@app.get("/api/ticker/{symbol}/cagr")
def get_cagr(symbol: str):
    cik, _ = _require_cik(symbol.upper())
    facts   = ec.get_company_facts(cik)

    METRICS = {
        "Revenue": "revenue", "Gross Profit": "gross_profit",
        "Operating Income": "operating_income", "Net Income": "net_income",
        "EPS (Diluted)": "eps_diluted", "Operating CF": "operating_cf",
        "Total Assets": "total_assets", "Equity": "equity",
    }

    rows = []
    for label, key in METRICS.items():
        series = ex.annual(facts, key)
        latest = series[-1]["val"] if series else None
        cagrs = {}
        for yrs in (3, 5, 10):
            if len(series) > yrs:
                start = series[-(yrs + 1)]["val"]
                end   = series[-1]["val"]
                if start and end and start > 0 and end > 0:
                    cagrs[f"{yrs}yr"] = (end / start) ** (1 / yrs) - 1
                else:
                    cagrs[f"{yrs}yr"] = None
            else:
                cagrs[f"{yrs}yr"] = None

        rows.append({
            "label":  label,
            "latest": latest,
            "cagr3":  cagrs.get("3yr"),
            "cagr5":  cagrs.get("5yr"),
            "cagr10": cagrs.get("10yr"),
            "isEps":  key == "eps_diluted",
        })

    rev_series = ex.annual(facts, "revenue")
    return {
        "rows": rows,
        "dataRange": {
            "from": rev_series[0].get("fy") or rev_series[0]["end"][:4] if rev_series else None,
            "to":   rev_series[-1].get("fy") or rev_series[-1]["end"][:4] if rev_series else None,
            "count": len(rev_series),
        }
    }


# ── DCF Pre-fill (EDGAR + yfinance) ──────────────────────────────────────────

@app.get("/api/ticker/{symbol}/dcf")
def get_dcf_prefill(symbol: str):
    cik, name = _require_cik(symbol.upper())
    facts = ec.get_company_facts(cik)

    rev_series  = ex.annual(facts, "revenue")
    ocf_series  = ex.annual(facts, "operating_cf")
    cap_series  = ex.annual(facts, "capex")
    da_series   = ex.annual(facts, "depreciation")
    oi_series   = ex.annual(facts, "operating_income")
    tax_series  = ex.annual(facts, "income_tax")
    ebit_series = ex.annual(facts, "ebit")
    debt_series = ex.annual(facts, "long_term_debt")
    cash_series = ex.annual(facts, "cash")
    sh_series   = ex.annual(facts, "shares_diluted")
    int_series  = ex.annual(facts, "interest_expense")

    def _by_year(series): return {s["end"][:4]: s["val"] for s in series}

    oi_by   = _by_year(oi_series)
    ebit_by = _by_year(ebit_series)
    cap_by  = _by_year(cap_series)
    da_by   = _by_year(da_series)
    ocf_by  = _by_year(ocf_series)
    tax_by  = _by_year(tax_series)

    # Historical revenue table (last 5 years)
    hist_rev = []
    last5 = rev_series[-5:]
    for i, s in enumerate(last5):
        prev = last5[i - 1]["val"] if i > 0 else None
        growth = (s["val"] - prev) / abs(prev) if prev and prev != 0 else None
        hist_rev.append({"year": s["end"][:4], "revenue": round(s["val"] / 1e6, 1), "growth": growth})

    # Averages from last 5 years
    ebit_margins, capex_pcts, da_pcts, tax_rates, growth_rates = [], [], [], [], []
    for i, s in enumerate(last5):
        yr  = s["end"][:4]
        rev = s["val"]
        ebit = ebit_by.get(yr) or oi_by.get(yr)
        cap  = cap_by.get(yr)
        da   = da_by.get(yr)
        tax  = tax_by.get(yr)
        if ebit and rev:         ebit_margins.append(ebit / rev)
        if cap  and rev:         capex_pcts.append(abs(cap) / rev)
        if da   and rev:         da_pcts.append(da / rev)
        if tax  and ebit and ebit > 0: tax_rates.append(min(tax / ebit, 0.5))
        if i > 0:
            prev_rev = last5[i - 1]["val"]
            if prev_rev and prev_rev != 0:
                growth_rates.append((rev - prev_rev) / abs(prev_rev))

    def _avg(lst): return sum(lst) / len(lst) if lst else None

    # Net debt
    latest_debt = (debt_series[-1]["val"] if debt_series else 0) or 0
    latest_cash = (cash_series[-1]["val"] if cash_series else 0) or 0
    net_debt_m  = (latest_debt - latest_cash) / 1e6
    shares_raw  = sh_series[-1]["val"] if sh_series else None

    # yfinance
    try:
        q            = yf.get_quote(symbol.upper())
        current_price = q.get("price")
        beta          = q.get("beta") or 1.0
        market_cap    = q.get("marketCap")
        total_debt_yf = q.get("totalDebt") or latest_debt
        int_e = int_series[-1]["val"] if int_series else None
        cost_of_debt = (int_e / total_debt_yf) if int_e and total_debt_yf and total_debt_yf > 0 else 0.04
        cost_of_debt = min(max(cost_of_debt, 0.01), 0.15)
        debt_weight  = total_debt_yf / (market_cap + total_debt_yf) if market_cap and total_debt_yf else 0.0
    except Exception:
        current_price = None; beta = 1.0; market_cap = None
        cost_of_debt = 0.04; debt_weight = 0.0

    # 10-Year Treasury yield as risk-free rate
    try:
        tnx = yf.get_quote("^TNX")
        rfr = (tnx.get("price") or 4.3) / 100
    except Exception:
        rfr = 0.043

    return {
        "ticker":            symbol.upper(),
        "name":              name,
        "currentPrice":      current_price,
        "marketCap":         market_cap,
        "beta":              beta,
        "sharesOutstanding": shares_raw,
        "netDebt":           round(net_debt_m, 1),
        "historicalRevenue": hist_rev,
        "avgRevenueGrowth":  _avg(growth_rates),
        "avgEbitMargin":     _avg(ebit_margins),
        "avgCapexPct":       _avg(capex_pcts),
        "avgDaPct":          _avg(da_pcts),
        "avgTaxRate":        _avg(tax_rates),
        "riskFreeRate":      rfr,
        "costOfDebt":        cost_of_debt,
        "debtWeight":        round(debt_weight, 4),
    }


# ── Market Sector Heatmap (yfinance) ─────────────────────────────────────────

@app.get("/api/market/heatmap")
def get_heatmap():
    SECTORS = [
        {"name": "S&P 500",            "etf": "SPY"},
        {"name": "Technology",         "etf": "XLK"},
        {"name": "Financials",         "etf": "XLF"},
        {"name": "Healthcare",         "etf": "XLV"},
        {"name": "Consumer Disc.",     "etf": "XLY"},
        {"name": "Comm. Services",     "etf": "XLC"},
        {"name": "Industrials",        "etf": "XLI"},
        {"name": "Consumer Staples",   "etf": "XLP"},
        {"name": "Energy",             "etf": "XLE"},
        {"name": "Real Estate",        "etf": "XLRE"},
        {"name": "Materials",          "etf": "XLB"},
        {"name": "Utilities",          "etf": "XLU"},
    ]
    result = []
    for s in SECTORS:
        try:
            q = yf.get_quote(s["etf"])
            result.append({
                "sector":     s["name"],
                "etf":        s["etf"],
                "price":      q.get("price"),
                "change":     q.get("change"),
                "changePct":  q.get("changePct"),
                "week52High": q.get("week52High"),
                "week52Low":  q.get("week52Low"),
                "marketCap":  q.get("marketCap"),
            })
        except Exception:
            result.append({"sector": s["name"], "etf": s["etf"],
                           "price": None, "change": None, "changePct": None,
                           "week52High": None, "week52Low": None, "marketCap": None})
    return result


# ── 13F Institutional Tracker (yfinance + EDGAR) ─────────────────────────────

@app.get("/api/ticker/{symbol}/thirteen_f")
def get_thirteen_f(symbol: str):
    cik, _ = _require_cik(symbol.upper())
    try:
        q = yf.get_quote(symbol.upper())
        pct_inst    = q.get("pctInstitutions")
        pct_ins     = q.get("pctInsiders")
        market_cap  = q.get("marketCap")
    except Exception:
        pct_inst = pct_ins = market_cap = None

    inst_holders = yf.get_institutional_holders(symbol.upper())
    mf_holders   = yf.get_mutual_fund_holders(symbol.upper())

    return {
        "institutionalHolders": inst_holders,
        "mutualFundHolders":    mf_holders,
        "pctInstitutions":      pct_inst,
        "pctInsiders":          pct_ins,
        "marketCap":            market_cap,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
