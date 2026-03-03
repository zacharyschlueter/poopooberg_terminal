import type {
  Quote, OHLCVBar, FinancialData, RatiosData, AnalystData,
  NewsItem, Filing, EarningsData, DividendData, OwnershipData,
  OptionsData, OverviewData, CagrData, SearchResult,
  DcfPrefill, HeatmapSector, ThirteenFData,
} from './types'

const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  search:      (q: string)                              => get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`),
  quote:       (sym: string)                            => get<Quote>(`/ticker/${sym}/quote`),
  history:     (sym: string, period = '1y', interval = 'auto') => get<OHLCVBar[]>(`/ticker/${sym}/history?period=${period}&interval=${interval}`),
  overview:    (sym: string)                            => get<OverviewData>(`/ticker/${sym}/overview`),
  income:      (sym: string)                            => get<FinancialData>(`/ticker/${sym}/financials/income`),
  balance:     (sym: string)                            => get<FinancialData>(`/ticker/${sym}/financials/balance`),
  cashflow:    (sym: string)                            => get<FinancialData>(`/ticker/${sym}/financials/cashflow`),
  fa:          (sym: string)                            => get<FinancialData>(`/ticker/${sym}/financials/fa`),
  ratios:      (sym: string)                            => get<RatiosData>(`/ticker/${sym}/ratios`),
  earnings:    (sym: string)                            => get<EarningsData>(`/ticker/${sym}/earnings`),
  dividends:   (sym: string)                            => get<DividendData>(`/ticker/${sym}/dividends`),
  analyst:     (sym: string)                            => get<AnalystData>(`/ticker/${sym}/analyst`),
  news:        (sym: string)                            => get<NewsItem[]>(`/ticker/${sym}/news`),
  filings:     (sym: string, form?: string)             => get<Filing[]>(`/ticker/${sym}/filings${form ? `?form=${form}` : ''}`),
  ownership:   (sym: string)                            => get<OwnershipData>(`/ticker/${sym}/ownership`),
  options:     (sym: string, exp?: string)              => get<OptionsData>(`/ticker/${sym}/options${exp ? `?expiration=${exp}` : ''}`),
  cagr:        (sym: string)                            => get<CagrData>(`/ticker/${sym}/cagr`),
  dcf:         (sym: string)                            => get<DcfPrefill>(`/ticker/${sym}/dcf`),
  thirteenF:   (sym: string)                            => get<ThirteenFData>(`/ticker/${sym}/thirteen_f`),
  heatmap:     ()                                       => get<HeatmapSector[]>(`/market/heatmap`),
}
