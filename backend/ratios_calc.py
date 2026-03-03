"""
Pure ratio calculation functions — all math from EDGAR XBRL facts.
Returns structured dicts ready for JSON serialization.
"""

from typing import Optional
import extractor as ex


def _sd(a, b) -> Optional[float]:
    if a is None or b is None or b == 0:
        return None
    return a / b


def _avg(a, b) -> Optional[float]:
    if a is None:
        return None
    return (a + b) / 2 if b is not None else a


def _row(label: str, value: Optional[float], typ: str, note: str = "") -> dict:
    return {"label": label, "value": value, "type": typ, "note": note}


def _header(label: str) -> dict:
    return {"label": label, "type": "header"}


def _divider() -> dict:
    return {"label": "---", "type": "divider"}


def calculate(facts: dict) -> dict:
    def lv(k): return ex.latest_val(facts, k, "10-K")
    def pv(k): return ex.prev_val(facts, k)

    rev      = lv("revenue");      rev_p   = pv("revenue")
    cogs     = lv("cogs")
    gp       = lv("gross_profit")
    oi       = lv("operating_income")
    ebit_raw = lv("ebit");         ebit    = ebit_raw if ebit_raw is not None else oi
    ni       = lv("net_income")
    tax      = lv("income_tax");   pretax  = lv("pretax_income")
    da       = lv("depreciation")
    rd       = lv("rd_expense");   sga     = lv("sga")
    int_e    = lv("interest_expense")
    ta       = lv("total_assets"); ta_p    = pv("total_assets")
    ca       = lv("current_assets")
    cash     = lv("cash");         st_inv  = lv("short_term_investments")
    inv      = lv("inventory");    inv_p   = pv("inventory")
    ar       = lv("accounts_receivable"); ar_p = pv("accounts_receivable")
    ppe      = lv("ppe");          gw      = lv("goodwill")
    intang   = lv("intangibles")
    tl       = lv("total_liabilities"); cl  = lv("current_liabilities")
    ap       = lv("accounts_payable");  ap_p= pv("accounts_payable")
    std      = lv("short_term_debt");   ltd  = lv("long_term_debt")
    eq       = lv("equity");            eq_p = pv("equity")
    re       = lv("retained_earnings")
    ocf      = lv("operating_cf");  cap    = lv("capex")
    dvd_paid = lv("dividends_paid")
    eps_b    = lv("eps_basic");     eps_d   = lv("eps_diluted")
    sh_out   = lv("shares_outstanding"); sh_dil = lv("shares_diluted")
    dps      = lv("dividends_per_share")

    # Derived
    total_debt   = (ltd or 0) + (std or 0)
    net_debt     = total_debt - (cash or 0)
    ebitda       = (oi + da) if oi is not None and da is not None else None
    tax_rate     = _sd(tax, pretax) if pretax else None
    nopat        = (oi * (1 - tax_rate)) if oi is not None and tax_rate is not None else ni
    invested_cap = ((eq or 0) + total_debt - (cash or 0)) if eq is not None else None
    cap_employed = ((ta or 0) - (cl or 0)) if ta is not None and cl is not None else None
    fcf          = (ocf - abs(cap)) if ocf is not None and cap is not None else None
    wc           = (ca - cl) if ca is not None and cl is not None else None
    cash_total   = (cash or 0) + (st_inv or 0)
    avg_ta   = _avg(ta, ta_p);    avg_eq  = _avg(eq, eq_p)
    avg_inv  = _avg(inv, inv_p);  avg_ar  = _avg(ar, ar_p)
    avg_ap   = _avg(ap, ap_p)
    quick_num = (ca - (inv or 0)) if ca is not None else None
    sh = sh_dil or sh_out

    # ── Profitability ─────────────────────────────────────────────────────
    profitability = [
        _header("PROFITABILITY"),
        _row("Gross Margin",      _sd(gp, rev),             "pct",  "Gross Profit / Revenue"),
        _row("Operating Margin",  _sd(oi, rev),             "pct",  "Op. Income / Revenue"),
        _row("EBITDA Margin",     _sd(ebitda, rev),         "pct",  "(Op. Inc + D&A) / Revenue"),
        _row("Pretax Margin",     _sd(ebit, rev),           "pct",  "EBIT / Revenue"),
        _row("Net Profit Margin", _sd(ni, rev),             "pct",  "Net Income / Revenue"),
        _divider(),
        _row("ROA",               _sd(ni, avg_ta),          "pct",  "Net Income / Avg Total Assets"),
        _row("ROE",               _sd(ni, avg_eq),          "pct",  "Net Income / Avg Equity"),
        _row("ROIC",              _sd(nopat, invested_cap), "pct",  "NOPAT / (Equity+Debt−Cash)"),
        _row("ROCE",              _sd(ebit, cap_employed),  "pct",  "EBIT / (Assets−Cur. Liab)"),
        _divider(),
        _row("R&D / Revenue",     _sd(rd, rev),             "pct",  "R&D Expense / Revenue"),
        _row("SG&A / Revenue",    _sd(sga, rev),            "pct",  "SG&A Expense / Revenue"),
        _row("Effective Tax Rate",tax_rate,                 "pct",  "Tax Expense / Pretax Income"),
    ]

    # ── Liquidity ─────────────────────────────────────────────────────────
    liquidity = [
        _header("LIQUIDITY"),
        _row("Current Ratio",     _sd(ca, cl),              "x2",  "(Current Assets) / (Current Liab)"),
        _row("Quick Ratio",       _sd(quick_num, cl),       "x2",  "(CA − Inventory) / Current Liab"),
        _row("Cash Ratio",        _sd(cash_total, cl),      "x2",  "(Cash + ST Inv) / Current Liab"),
        _row("Op. CF Ratio",      _sd(ocf, cl),             "x2",  "Operating CF / Current Liab"),
        _row("NWC / Total Assets",_sd(wc, ta),              "pct", "Working Capital / Total Assets"),
        _divider(),
        _row("Working Capital",   wc,                       "usd", "Current Assets − Current Liab"),
        _row("Cash & Equiv.",     cash,                     "usd", ""),
    ]

    # ── Leverage ──────────────────────────────────────────────────────────
    d_e      = _sd(total_debt, eq)
    d_a      = _sd(total_debt, ta)
    int_cov  = _sd(ebit, int_e) if int_e and int_e != 0 else None
    d_ebitda = _sd(total_debt, ebitda)
    nd_ebitda= _sd(net_debt, ebitda)
    eq_mult  = _sd(ta, eq)
    debt_cap = _sd(total_debt, (total_debt + (eq or 0))) if eq else None
    ocf_debt = _sd(ocf, total_debt) if total_debt else None

    leverage = [
        _header("LEVERAGE / SOLVENCY"),
        _row("Debt / Equity",        d_e,       "x2",  "(LT + ST Debt) / Equity"),
        _row("LT Debt / Equity",     _sd(ltd, eq),"x2","Long-Term Debt / Equity"),
        _row("Debt / Assets",        d_a,       "x2",  "Total Debt / Total Assets"),
        _row("Debt / Capital",       debt_cap,  "pct", "Debt / (Debt + Equity)"),
        _row("Equity Multiplier",    eq_mult,   "x2",  "Total Assets / Equity"),
        _divider(),
        _row("Interest Coverage",    int_cov,   "x2",  "EBIT / Interest Expense"),
        _row("Debt / EBITDA",        d_ebitda,  "x2",  "Total Debt / EBITDA"),
        _row("Net Debt / EBITDA",    nd_ebitda, "x2",  "(Debt − Cash) / EBITDA"),
        _row("Op. CF / Debt",        ocf_debt,  "pct", "Operating CF / Total Debt"),
        _divider(),
        _row("Total Debt",           total_debt if total_debt else None, "usd", "LT Debt + ST Debt"),
        _row("Net Debt",             net_debt,  "usd", "Debt − Cash"),
    ]

    # ── Efficiency ────────────────────────────────────────────────────────
    asset_turn = _sd(rev, avg_ta)
    inv_turn   = _sd(cogs, avg_inv) if avg_inv and avg_inv != 0 else _sd(rev, avg_inv)
    rec_turn   = _sd(rev, avg_ar)
    pay_turn   = _sd(cogs, avg_ap) if cogs and avg_ap and avg_ap != 0 else _sd(rev, avg_ap)
    fix_turn   = _sd(rev, ppe)
    wc_turn    = _sd(rev, wc) if wc and wc != 0 else None

    dio = 365 / inv_turn  if inv_turn and inv_turn != 0 else None
    dso = 365 / rec_turn  if rec_turn and rec_turn != 0 else None
    dpo = 365 / pay_turn  if pay_turn and pay_turn != 0 else None
    ccc = ((dio or 0) + (dso or 0) - (dpo or 0)
           if any(v is not None for v in [dio, dso, dpo]) else None)
    intang_ta  = _sd((gw or 0) + (intang or 0), ta)

    efficiency = [
        _header("EFFICIENCY / ACTIVITY"),
        _row("Asset Turnover",        asset_turn, "x2",   "Revenue / Avg Total Assets"),
        _row("Fixed Asset Turnover",  fix_turn,   "x2",   "Revenue / PP&E"),
        _row("Working Capital Turn.", wc_turn,    "x2",   "Revenue / Working Capital"),
        _divider(),
        _row("Inventory Turnover",    inv_turn,   "x2",   "COGS / Avg Inventory"),
        _row("Days Inventory (DIO)",  dio,        "days", "365 / Inventory Turnover"),
        _divider(),
        _row("Receivables Turnover",  rec_turn,   "x2",   "Revenue / Avg AR"),
        _row("Days Sales Out. (DSO)", dso,        "days", "365 / Receivables Turnover"),
        _divider(),
        _row("Payables Turnover",     pay_turn,   "x2",   "COGS / Avg AP"),
        _row("Days Payable (DPO)",    dpo,        "days", "365 / Payables Turnover"),
        _divider(),
        _row("Cash Conversion Cycle", ccc,        "days", "DIO + DSO − DPO"),
        _row("Goodwill+Intang./Assets",intang_ta, "pct",  "(GW+Intang) / Total Assets"),
    ]

    # ── Cash Flow ─────────────────────────────────────────────────────────
    fcf_margin   = _sd(fcf, rev)
    fcf_ni       = _sd(fcf, ni)
    ocf_rev      = _sd(ocf, rev)
    capex_rev    = _sd(abs(cap) if cap else None, rev)
    capex_da     = _sd(abs(cap) if cap else None, da)
    ocf_assets   = _sd(ocf, avg_ta)
    ocf_ni       = _sd(ocf, ni)
    fcf_per_sh   = _sd(fcf, sh)
    ocf_per_sh   = _sd(ocf, sh)
    div_payout_cf= _sd(abs(dvd_paid) if dvd_paid else None, ocf)
    reinvest     = _sd(abs(cap) if cap else None, ocf)

    cash_flow = [
        _header("CASH FLOW"),
        _row("FCF Margin",          fcf_margin,    "pct", "Free Cash Flow / Revenue"),
        _row("Op. CF / Revenue",    ocf_rev,       "pct", "Operating CF / Revenue"),
        _row("FCF / Net Income",    fcf_ni,        "x2",  "FCF quality (>1 = great)"),
        _row("Op. CF / Net Income", ocf_ni,        "x2",  "Accruals quality"),
        _row("Op. CF / Assets",     ocf_assets,    "pct", "Cash Return on Assets"),
        _divider(),
        _row("CapEx / Revenue",     capex_rev,     "pct", "Capital intensity"),
        _row("CapEx / D&A",         capex_da,      "x2",  ">1=expanding, <1=shrinking"),
        _row("Reinvestment Rate",   reinvest,      "pct", "CapEx / Operating CF"),
        _divider(),
        _row("Free Cash Flow",      fcf,           "usd", "Op CF − CapEx"),
        _row("FCF / Share",         fcf_per_sh,    "eps", "FCF per diluted share"),
        _row("Op. CF / Share",      ocf_per_sh,    "eps", "OCF per diluted share"),
        _row("Div. Payout (CF)",    div_payout_cf, "pct", "Dividends Paid / Op. CF"),
    ]

    # ── Per-Share ─────────────────────────────────────────────────────────
    bvps  = _sd(eq, sh)
    revps = _sd(rev, sh)

    per_share = [
        _header("PER-SHARE METRICS"),
        _row("EPS (Basic)",        eps_b,             "eps", "Net Income / Basic Shares"),
        _row("EPS (Diluted)",      eps_d,             "eps", "Net Income / Diluted Shares"),
        _row("Book Value / Share", bvps,              "eps", "Equity / Diluted Shares"),
        _row("Revenue / Share",    revps,             "eps", "Revenue / Diluted Shares"),
        _row("FCF / Share",        fcf_per_sh,        "eps", "FCF / Diluted Shares"),
        _row("Dividends / Share",  dps,               "eps", "From EDGAR XBRL"),
        _divider(),
        _row("Diluted Shares (M)", (sh / 1e6) if sh else None,     "plain2", ""),
        _row("Basic Shares (M)",   (sh_out / 1e6) if sh_out else None, "plain2", ""),
    ]

    # ── DuPont ────────────────────────────────────────────────────────────
    net_margin  = _sd(ni, rev)
    roe_check   = None
    if net_margin and asset_turn and eq_mult:
        roe_check = net_margin * asset_turn * eq_mult
    tax_burden  = _sd(ni, pretax) if pretax and pretax != 0 else None
    int_burden  = _sd(pretax, ebit) if ebit and ebit != 0 else None
    ebit_margin = _sd(ebit, rev)
    roe_5       = None
    if all(v is not None for v in [tax_burden, int_burden, ebit_margin, asset_turn, eq_mult]):
        roe_5 = tax_burden * int_burden * ebit_margin * asset_turn * eq_mult

    dupont = [
        _header("DUPONT DECOMPOSITION"),
        _row("─── 3-Factor ───",        None,         "header", ""),
        _row("(1) Net Profit Margin",  net_margin,   "pct",    "Net Income / Revenue"),
        _row("(2) Asset Turnover",     asset_turn,   "x3",     "Revenue / Avg Assets"),
        _row("(3) Equity Multiplier",  eq_mult,      "x3",     "Total Assets / Equity"),
        _row("= ROE (3-Factor)",       roe_check,    "pct",    "(1) × (2) × (3)"),
        _divider(),
        _row("─── 5-Factor ───",        None,         "header", ""),
        _row("(1) Tax Burden",         tax_burden,   "x3",     "Net Income / Pretax Inc"),
        _row("(2) Interest Burden",    int_burden,   "x3",     "Pretax Income / EBIT"),
        _row("(3) EBIT Margin",        ebit_margin,  "pct",    "EBIT / Revenue"),
        _row("(4) Asset Turnover",     asset_turn,   "x3",     "Revenue / Avg Assets"),
        _row("(5) Equity Multiplier",  eq_mult,      "x3",     "Avg Assets / Avg Equity"),
        _row("= ROE (5-Factor)",       roe_5,        "pct",    "(1)×(2)×(3)×(4)×(5)"),
        _divider(),
        _row("Reported ROE",           _sd(ni, avg_eq), "pct", "Net Income / Avg Equity"),
    ]

    # ── Quality & Coverage ────────────────────────────────────────────────
    accruals_abs   = (ni - fcf) if ni is not None and fcf is not None else None
    accruals_ratio = _sd(accruals_abs, avg_ta)
    daily_exp      = ((rev - (gp or 0)) / 365) if rev and gp else None
    def_interval   = _sd(cash_total, daily_exp) if daily_exp and daily_exp != 0 else None
    div_payout_eps = _sd(dps, eps_b) if dps and eps_b and eps_b != 0 else None
    retention      = (1 - div_payout_eps) if div_payout_eps is not None else None
    sgr            = (_sd(ni, avg_eq) * retention) if _sd(ni, avg_eq) is not None and retention is not None else None

    z_x1 = _sd(wc, ta);   z_x2 = _sd(re, ta)
    z_x3 = _sd(ebit, ta); z_x5 = _sd(rev, ta)
    z_partial = None
    if all(v is not None for v in [z_x1, z_x2, z_x3, z_x5]):
        z_partial = 1.2*z_x1 + 1.4*z_x2 + 3.3*z_x3 + 1.0*z_x5

    quality = [
        _header("QUALITY & COVERAGE"),
        _row("Earnings Quality (OCF/NI)", ocf_ni,        "x2",   ">1 = high quality"),
        _row("Accruals Ratio",            accruals_ratio, "pct",  "(NI−FCF)/Avg Assets, lower=better"),
        _row("Defensive Interval",        def_interval,  "days", "Days cash covers expenses"),
        _divider(),
        _row("Dividend Payout (EPS)",  div_payout_eps, "pct",  "DPS / Basic EPS"),
        _row("Retention Ratio",        retention,       "pct",  "1 − Payout Ratio"),
        _row("Sustainable Growth Rate",sgr,             "pct",  "ROE × Retention Ratio"),
        _divider(),
        _row("Altman Z (partial)",     z_partial,       "z",    ">2.6=safe, <1.8=distress"),
        _row("  X1: WC/TA",           z_x1,            "plain3",""),
        _row("  X2: RE/TA",           z_x2,            "plain3",""),
        _row("  X3: EBIT/TA",         z_x3,            "plain3",""),
        _row("  X5: Rev/TA",          z_x5,            "plain3",""),
    ]

    # Get fiscal year label
    rev_s = ex.latest_n(facts, "revenue", 1)
    fy = f"FY{rev_s[-1].get('fy') or rev_s[-1]['end'][:4]}" if rev_s else "Latest Annual"

    return {
        "fiscalYear":    fy,
        "profitability": profitability,
        "liquidity":     liquidity,
        "leverage":      leverage,
        "efficiency":    efficiency,
        "cashFlow":      cash_flow,
        "perShare":      per_share,
        "dupont":        dupont,
        "quality":       quality,
    }
