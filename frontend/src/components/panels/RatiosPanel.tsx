import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { RatiosData, RatioRow } from '../../types'

function fmtRatio(v: number | null, type: RatioRow['type']): string {
  if (v === null || v === undefined) return '—'
  switch (type) {
    case 'pct':    return `${(v * 100).toFixed(1)}%`
    case 'x2':     return `${v.toFixed(2)}x`
    case 'x3':     return `${v.toFixed(3)}x`
    case 'usd': {
      const m = v / 1e6
      if (Math.abs(m) >= 1000) return `$${(m/1000).toFixed(2)}B`
      return `$${m.toFixed(1)}M`
    }
    case 'eps':    return `$${v.toFixed(2)}`
    case 'days':   return `${v.toFixed(1)}d`
    case 'z':      return v.toFixed(2)
    case 'plain2': return v.toFixed(2)
    case 'plain3': return v.toFixed(3)
    default: return `${v}`
  }
}

function colorClass(v: number | null, type: RatioRow['type'], label: string): string {
  if (v === null) return 'dim'
  // Some ratios are better when lower (debt ratios, DIO, DSO, etc.)
  const lowerBetter = [
    'Debt', 'DPO', 'DIO', 'DSO', 'Accruals', 'CapEx / D&A',
    'CapEx / Revenue', 'Reinvestment'
  ].some(s => label.includes(s))

  if (type === 'pct' || type === 'x2' || type === 'x3') {
    if (lowerBetter) return v <= 0 ? 'pos' : 'neg'
    return v >= 0 ? 'pos' : 'neg'
  }
  if (type === 'z') {
    return v > 2.6 ? 'pos' : v > 1.8 ? 'orange' : 'neg'
  }
  if (type === 'usd' || type === 'eps') return v >= 0 ? '' : 'neg'
  return ''
}

function RatioSection({ rows }: { rows: RatioRow[] }) {
  return (
    <div className="ratio-block">
      {rows.map((row, i) => {
        if (row.type === 'header') {
          return <div key={i} className="section-title">{row.label}</div>
        }
        if (row.type === 'divider') {
          return <div key={i} style={{ height: 4, borderBottom: '1px solid #1e1e1e' }} />
        }
        const formatted = fmtRatio(row.value, row.type)
        const cls = colorClass(row.value, row.type, row.label)
        return (
          <div key={i} className="ratio-row" title={row.note}>
            <span className="ratio-row__label">{row.label}</span>
            <span className={`ratio-row__val ${cls}`}>{formatted}</span>
            {row.note && <span className="ratio-row__note">{row.note}</span>}
          </div>
        )
      })}
    </div>
  )
}

export default function RatiosPanel({ ticker }: { ticker: string }) {
  const [data, setData]       = useState<RatiosData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setData(null); setError(null)
    api.ratios(ticker).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [ticker])

  if (loading) return <div className="loading">Computing ratios from EDGAR XBRL data…</div>
  if (error)   return <div className="error">Error: {error}</div>
  if (!data)   return null

  const sections = [
    { key: 'profitability', rows: data.profitability, title: '1  PROFITABILITY' },
    { key: 'liquidity',     rows: data.liquidity,     title: '2  LIQUIDITY' },
    { key: 'leverage',      rows: data.leverage,      title: '3  LEVERAGE / SOLVENCY' },
    { key: 'efficiency',    rows: data.efficiency,    title: '4  EFFICIENCY / ACTIVITY' },
    { key: 'cashFlow',      rows: data.cashFlow,      title: '5  CASH FLOW' },
    { key: 'perShare',      rows: data.perShare,      title: '6  PER-SHARE' },
    { key: 'dupont',        rows: data.dupont,        title: '7  DUPONT' },
    { key: 'quality',       rows: data.quality,       title: '8  QUALITY & COVERAGE' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13 }}>
          FINANCIAL RATIOS — {data.fiscalYear}
        </span>
        <span style={{ color: 'var(--dim)', fontSize: 10 }}>
          All ratios computed from SEC EDGAR XBRL  ■  Hover rows for formula
        </span>
      </div>
      <div className="ratios-grid">
        {sections.map(s => (
          <RatioSection
            key={s.key}
            rows={[{ label: s.title, type: 'header', value: null }, ...s.rows]}
          />
        ))}
      </div>
    </div>
  )
}
