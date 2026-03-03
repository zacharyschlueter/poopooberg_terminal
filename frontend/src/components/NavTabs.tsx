import type { Tab } from '../types'

const TABS: { id: Tab; label: string; title: string }[] = [
  { id: 'CHART',   label: 'GP',   title: 'Graph Price' },
  { id: 'DES',     label: 'DES',  title: 'Description' },
  { id: 'FA',      label: 'FA',   title: 'Financial Analysis' },
  { id: 'IS',      label: 'IS',   title: 'Income Statement' },
  { id: 'BS',      label: 'BS',   title: 'Balance Sheet' },
  { id: 'CF',      label: 'CF',   title: 'Cash Flow' },
  { id: 'RATIOS',  label: 'RV',   title: 'Relative Value / Ratios' },
  { id: 'ERN',     label: 'ERN',  title: 'Earnings' },
  { id: 'DVD',     label: 'DVD',  title: 'Dividends' },
  { id: 'CAGR',    label: 'CAGR', title: 'Growth Rates' },
  { id: 'OWN',     label: 'OWN',  title: 'Ownership' },
  { id: 'SFIL',    label: 'SFIL', title: 'SEC Filings' },
  { id: 'ANALYST', label: 'ANR',  title: 'Analyst Recommendations' },
  { id: 'NEWS',    label: 'N',    title: 'News' },
  { id: 'OPTIONS', label: 'OMON', title: 'Options Monitor' },
  { id: 'DCF',     label: 'DCF',  title: 'DCF Calculator' },
  { id: 'MAP',     label: 'MAP',  title: 'Sector Heatmap' },
  { id: 'WL',      label: '💩WL', title: 'Watchlist' },
]

interface Props { active: Tab; onChange: (t: Tab) => void }

export default function NavTabs({ active, onChange }: Props) {
  return (
    <div className="nav-tabs">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`nav-tab ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
          title={t.title}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
