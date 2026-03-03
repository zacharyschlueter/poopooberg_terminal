"""
XBRL Data Extraction — returns raw floats (no formatting).
Tries multiple concept names per metric to handle company variation.
"""

from datetime import date as _date
from typing import Optional

CONCEPTS: dict[str, list[str]] = {
    "revenue": [
        "Revenues",
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "SalesRevenueNet", "SalesRevenueGoodsNet",
        "RevenuesNetOfInterestExpense", "SalesRevenueServicesNet",
        "InterestAndDividendIncomeOperating",
    ],
    "cogs": [
        "CostOfGoodsAndServicesSold", "CostOfRevenue",
        "CostOfGoodsSold", "CostOfServices",
    ],
    "gross_profit": ["GrossProfit"],
    "operating_income": ["OperatingIncomeLoss"],
    "net_income": [
        "NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic",
        "ProfitLoss",
    ],
    "ebit": [
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    ],
    "interest_expense": [
        "InterestExpense", "InterestAndDebtExpense", "InterestExpenseDebt",
    ],
    "interest_income": [
        "InterestIncomeOperating", "InvestmentIncomeInterest",
    ],
    "income_tax": ["IncomeTaxExpenseBenefit"],
    "pretax_income": [
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    ],
    "depreciation": [
        "DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation",
    ],
    "rd_expense": [
        "ResearchAndDevelopmentExpense",
        "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
    ],
    "sga": [
        "SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense",
    ],
    "total_assets": ["Assets"],
    "current_assets": ["AssetsCurrent"],
    "non_current_assets": ["AssetsNoncurrent"],
    "cash": [
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsAndShortTermInvestments",
        "Cash",
    ],
    "short_term_investments": ["ShortTermInvestments", "AvailableForSaleSecuritiesCurrent"],
    "inventory": ["InventoryNet", "Inventories"],
    "accounts_receivable": [
        "AccountsReceivableNetCurrent", "ReceivablesNetCurrent",
    ],
    "ppe": ["PropertyPlantAndEquipmentNet"],
    "goodwill": ["Goodwill"],
    "intangibles": ["IntangibleAssetsNetExcludingGoodwill", "FiniteLivedIntangibleAssetsNet"],
    "total_liabilities": ["Liabilities"],
    "current_liabilities": ["LiabilitiesCurrent"],
    "accounts_payable": ["AccountsPayableCurrent"],
    "short_term_debt": [
        "ShortTermBorrowings", "NotesPayableCurrent", "LongTermDebtCurrent", "CommercialPaper",
    ],
    "long_term_debt": [
        "LongTermDebt", "LongTermDebtNoncurrent", "LongTermNotesPayable",
    ],
    "equity": [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    "retained_earnings": ["RetainedEarningsAccumulatedDeficit"],
    "operating_cf": ["NetCashProvidedByUsedInOperatingActivities"],
    "investing_cf": ["NetCashProvidedByUsedInInvestingActivities"],
    "financing_cf": ["NetCashProvidedByUsedInFinancingActivities"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForCapitalImprovements"],
    "dividends_paid": ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"],
    "buybacks": ["PaymentsForRepurchaseOfCommonStock"],
    "eps_basic": ["EarningsPerShareBasic"],
    "eps_diluted": ["EarningsPerShareDiluted"],
    "shares_outstanding": [
        "CommonStockSharesOutstanding",
        "WeightedAverageNumberOfSharesOutstandingBasic",
    ],
    "shares_diluted": ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    "dividends_per_share": [
        "CommonStockDividendsPerShareDeclared",
        "CommonStockDividendsPerShareCashPaid",
    ],
    "employees": ["EntityNumberOfEmployees"],
}


def _ns(facts: dict) -> tuple[dict, dict]:
    f = facts.get("facts", {})
    return f.get("us-gaap", {}), f.get("dei", {})


def _is_full_year(v: dict) -> bool:
    """
    Return True if the XBRL entry represents a full fiscal year (~12 months).

    - Instant concepts (balance sheet) have no 'start' field → always True.
    - Duration concepts (IS / CF) have 'start' and 'end'; we accept entries
      whose period is between 330 and 400 days (covers 52- and 53-week years).

    This is more reliable than checking fp=='FY' because:
      • Some EDGAR entries have fp=null  (v.get("fp","FY") returns None, not "FY")
      • Some older filings omit fp entirely
      • The actual date span is an unambiguous signal that fp is not
    """
    if "start" not in v:
        return True  # instant concept — no duration to check
    try:
        days = (_date.fromisoformat(v["end"]) - _date.fromisoformat(v["start"])).days
        return 330 <= days <= 400
    except Exception:
        return True  # unparseable dates → include rather than silently drop


def extract_series(facts: dict, concept_key: str, form: str = "10-K") -> list[dict]:
    """
    Return annual (or quarterly) entries for concept_key, sorted by end date.

    Key design decisions:
    1. Merges across ALL concept-name aliases — companies often switch XBRL
       concept names between years (e.g. "Revenues" → ASC-606 concept after
       2018).  Collecting from every alias and filling gaps gives the full
       continuous history.
    2. Higher-priority aliases (earlier in CONCEPTS list) take precedence:
       once an end-date is claimed it cannot be overwritten by a lower-priority
       alias.  Within a single alias the most recently *filed* entry wins
       (handles restatements / amendments).
    3. For 10-K forms we require a full-year period via _is_full_year() rather
       than relying on the fp field, which can be null or absent in EDGAR data.
    """
    us_gaap, dei = _ns(facts)
    # merged: end-date → entry (highest-priority concept wins)
    merged: dict[str, dict] = {}

    for concept in CONCEPTS.get(concept_key, [concept_key]):
        data = us_gaap.get(concept) or dei.get(concept)
        if not data:
            continue
        units = data.get("units", {})
        for unit in ("USD", "USD/shares", "shares", "pure"):
            if unit not in units:
                continue
            raw = [
                v for v in units[unit]
                if v.get("form") == form
                and "end" in v and "val" in v
                and (form != "10-K" or _is_full_year(v))
            ]
            if not raw:
                continue
            # Within this concept, keep the most recently *filed* entry per end-date
            concept_best: dict[str, dict] = {}
            for v in raw:
                key = v["end"]
                if key not in concept_best or v.get("filed", "") > concept_best[key].get("filed", ""):
                    concept_best[key] = v
            # Merge into global result — higher-priority concepts take precedence
            for key, v in concept_best.items():
                if key not in merged:
                    merged[key] = v
            break  # use first unit-type with data for this concept

    return sorted(merged.values(), key=lambda x: x["end"])


def annual(facts: dict, concept_key: str) -> list[dict]:
    return extract_series(facts, concept_key, "10-K")


def quarterly(facts: dict, concept_key: str) -> list[dict]:
    return extract_series(facts, concept_key, "10-Q")


def latest_val(facts: dict, concept_key: str, form: str = "10-K") -> Optional[float]:
    s = extract_series(facts, concept_key, form)
    return s[-1]["val"] if s else None


def prev_val(facts: dict, concept_key: str) -> Optional[float]:
    s = annual(facts, concept_key)
    return s[-2]["val"] if len(s) >= 2 else None


def latest_n(facts: dict, concept_key: str, n: int = 5, form: str = "10-K") -> list[dict]:
    return extract_series(facts, concept_key, form)[-n:]


def safe_div(a, b) -> Optional[float]:
    if a is None or b is None or b == 0:
        return None
    return a / b
