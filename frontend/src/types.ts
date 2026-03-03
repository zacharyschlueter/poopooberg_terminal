// ── Quote ────────────────────────────────────────────────────────────────────
export interface Quote {
  symbol: string
  name: string
  price: number | null
  change: number | null
  changePct: number | null
  open: number | null
  dayHigh: number | null
  dayLow: number | null
  prevClose: number | null
  volume: number | null
  avgVolume: number | null
  marketCap: number | null
  pe: number | null
  forwardPe: number | null
  eps: number | null
  forwardEps: number | null
  dividend: number | null
  dividendYield: number | null
  exDivDate: string | null
  beta: number | null
  week52High: number | null
  week52Low: number | null
  priceToBook: number | null
  shortRatio: number | null
  shortPct: number | null
  sector: string | null
  industry: string | null
  employees: number | null
  country: string | null
  website: string | null
  currency: string
  exchange: string | null
  recKey: string | null
  recMean: number | null
  numAnalysts: number | null
  targetMean: number | null
  targetHigh: number | null
  targetLow: number | null
  pctInstitutions: number | null
  pctInsiders: number | null
  debtToEquity: number | null
  payoutRatio: number | null
  totalDebt: number | null
  totalCash: number | null
  freeCashflow: number | null
}

// ── Price History ─────────────────────────────────────────────────────────────
export interface OHLCVBar {
  time: string | number   // date string for daily+, Unix seconds for intraday
  open: number
  high: number
  low: number
  close: number
  volume: number
  ma20?: number
  ma50?: number
  ma200?: number
}

// ── Financials ────────────────────────────────────────────────────────────────
export interface FinRow {
  label: string
  values: (number | null)[]
  type: 'usd' | 'pct' | 'eps' | 'plain1' | 'plain2' | 'plain3' | 'divider' | 'header'
  indent?: number
  bold?: boolean
}

export interface FinancialData {
  periods: string[]
  rows: FinRow[]
  note: string
}

// ── Ratios ────────────────────────────────────────────────────────────────────
export interface RatioRow {
  label: string
  value: number | null
  type: 'pct' | 'x2' | 'x3' | 'usd' | 'eps' | 'days' | 'z' | 'plain2' | 'plain3' | 'header' | 'divider'
  note?: string
}

export interface RatiosData {
  fiscalYear: string
  profitability: RatioRow[]
  liquidity: RatioRow[]
  leverage: RatioRow[]
  efficiency: RatioRow[]
  cashFlow: RatioRow[]
  perShare: RatioRow[]
  dupont: RatioRow[]
  quality: RatioRow[]
}

// ── Analyst ───────────────────────────────────────────────────────────────────
export interface AnalystData {
  consensus: {
    ratingKey: string | null
    ratingMean: number | null
    numAnalysts: number | null
    strongBuy: number
    buy: number
    hold: number
    sell: number
    strongSell: number
  }
  priceTargets: {
    current: number | null
    mean: number | null
    median: number | null
    high: number | null
    low: number | null
    upside: number | null
  }
  recentChanges: {
    date: string
    firm: string
    toGrade: string
    fromGrade: string
    action: string
  }[]
}

// ── News ──────────────────────────────────────────────────────────────────────
export interface NewsItem {
  title: string
  publisher: string
  link: string
  publishedAt: number | null
}

// ── Filings ───────────────────────────────────────────────────────────────────
export interface Filing {
  form: string
  date: string
  accession: string
  description: string
  url: string
}

// ── Earnings ──────────────────────────────────────────────────────────────────
export interface EarningsData {
  annual: { fy: string; basic: number | null; diluted: number | null }[]
  quarterly: { period: string; basic: number | null; diluted: number | null }[]
}

// ── Dividends ─────────────────────────────────────────────────────────────────
export interface DividendData {
  annualDPS: { period: string | number; value: number; end: string }[]
  totalPaid: { period: string | number; value: number; end: string }[]
  quarterlyDPS: { period: string | number; value: number; end: string }[]
}

// ── Ownership ─────────────────────────────────────────────────────────────────
export interface InstitutionalHolder {
  name: string
  shares: number | null
  pctHeld: number | null
  value: number | null
  date: string
}

export interface OwnershipData {
  institutional: InstitutionalHolder[]
  insiderTransactions: { form: string; date: string; accession: string; url: string }[]
  majorHolders13DG: { form: string; date: string; accession: string; url: string }[]
}

// ── Options ───────────────────────────────────────────────────────────────────
export interface OptionContract {
  strike: number | null
  lastPrice: number | null
  bid: number | null
  ask: number | null
  volume: number | null
  openInterest: number | null
  impliedVolatility: number | null
  inTheMoney: boolean
}

export interface OptionsData {
  expirations: string[]
  selected: string | null
  calls: OptionContract[]
  puts: OptionContract[]
}

// ── Overview ──────────────────────────────────────────────────────────────────
export interface OverviewData {
  name: string
  ticker: string
  cik: string
  ein: string | null
  sic: string | null
  sicDescription: string | null
  stateOfInc: string | null
  fiscalYearEnd: string
  entityType: string | null
  businessAddress: string | null
  mailingAddress: string | null
  phone: string | null
  sector: string | null
  industry: string | null
  website: string | null
  employees: number | null
  description: string | null
  lastFiled: Record<string, string | null>
  snapshot: Record<string, number | null>
}

// ── CAGR ─────────────────────────────────────────────────────────────────────
export interface CagrData {
  rows: {
    label: string
    latest: number | null
    cagr3: number | null
    cagr5: number | null
    cagr10: number | null
    isEps: boolean
  }[]
  dataRange: { from: string | null; to: string | null; count: number }
}

// ── Search ────────────────────────────────────────────────────────────────────
export interface SearchResult {
  cik: string
  ticker: string
  name: string
}

// ── DCF ───────────────────────────────────────────────────────────────────────
export interface DcfPrefill {
  ticker: string
  name: string
  currentPrice: number | null
  marketCap: number | null
  beta: number | null
  sharesOutstanding: number | null
  netDebt: number | null
  historicalRevenue: { year: string; revenue: number; growth: number | null }[]
  avgRevenueGrowth: number | null
  avgEbitMargin: number | null
  avgCapexPct: number | null
  avgDaPct: number | null
  avgTaxRate: number | null
  riskFreeRate: number | null
  costOfDebt: number | null
  debtWeight: number | null
}

// ── Sector Heatmap ────────────────────────────────────────────────────────────
export interface HeatmapSector {
  sector: string
  etf: string
  price: number | null
  change: number | null
  changePct: number | null
  week52High: number | null
  week52Low: number | null
  marketCap: number | null
}

// ── 13F Institutional Tracker ─────────────────────────────────────────────────
export interface InstitutionalHolder13F {
  name: string
  shares: number | null
  pctHeld: number | null
  value: number | null
  date: string
}

export interface ThirteenFData {
  institutionalHolders: InstitutionalHolder13F[]
  mutualFundHolders: InstitutionalHolder13F[]
  pctInstitutions: number | null
  pctInsiders: number | null
  marketCap: number | null
}

// ── Tab ───────────────────────────────────────────────────────────────────────
export type Tab =
  | 'CHART' | 'DES' | 'FA' | 'IS' | 'BS' | 'CF'
  | 'RATIOS' | 'ERN' | 'DVD' | 'OWN' | 'SFIL'
  | 'ANALYST' | 'NEWS' | 'OPTIONS' | 'CAGR'
  | 'DCF' | 'MAP' | 'WL'
