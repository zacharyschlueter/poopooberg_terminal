import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { CagrData } from '../../types'

function fmtCagr(v: number | null, isEps: boolean): string {
  if (v === null) return '—'
  const pct = (v * 100).toFixed(1)
  return `${v >= 0 ? '+' : ''}${pct}%`
}

function fmtLatest(v: number | null, isEps: boolean): string {
  if (v === null) return '—'
  if (isEps) return `$${v.toFixed(2)}`
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  return `$${v.toFixed(2)}`
}

function CagrCell({ v, isEps }: { v: number | null; isEps: boolean }) {
  if (v === null) return <td className="dim">—</td>
  const cls = v >= 0.10 ? 'pos' : v >= 0 ? '' : 'neg'
  return (
    <td className={cls} style={{ fontWeight: v >= 0.15 ? 'bold' : undefined }}>
      {fmtCagr(v, isEps)}
    </td>
  )
}

export default function CagrPanel({ ticker }: { ticker: string }) {
  const [data, setData]       = useState<CagrData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setData(null); setError(null)
    api.cagr(ticker).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [ticker])

  if (loading) return <div className="loading">Computing growth rates from SEC EDGAR XBRL…</div>
  if (error)   return <div className="error">Error: {error}</div>
  if (!data)   return null

  const { rows, dataRange } = data

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13 }}>
          GROWTH RATES (CAGR) — {ticker}
        </span>
        <span style={{ color: 'var(--dim)', fontSize: 10 }}>
          {dataRange.from && dataRange.to
            ? `Data: ${dataRange.from} – ${dataRange.to}  ■  ${dataRange.count} annual periods`
            : 'Source: SEC EDGAR XBRL'}
          &nbsp;■&nbsp; CAGR = (End/Start)^(1/N) − 1
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="bb-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', minWidth: 180 }}>Metric</th>
              <th style={{ minWidth: 100 }}>Latest Value</th>
              <th style={{ minWidth: 80 }}>3-Year CAGR</th>
              <th style={{ minWidth: 80 }}>5-Year CAGR</th>
              <th style={{ minWidth: 80 }}>10-Year CAGR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'left', color: 'var(--white)' }}>{r.label}</td>
                <td style={{ color: 'var(--yellow)', textAlign: 'right' }}>
                  {fmtLatest(r.latest, r.isEps)}
                </td>
                <CagrCell v={r.cagr3}  isEps={r.isEps} />
                <CagrCell v={r.cagr5}  isEps={r.isEps} />
                <CagrCell v={r.cagr10} isEps={r.isEps} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, color: 'var(--dim)', fontSize: 10, lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--orange)' }}>How to read:</strong>
        &nbsp;
        Bold green = CAGR ≥ 15%  ■  Green = CAGR ≥ 0%  ■  Red = negative growth
        &nbsp;■&nbsp;
        CAGR requires at least N+1 years of data; "—" means insufficient history.
        <br />
        Negative starting values invalidate compound growth math and are shown as "—".
      </div>
    </div>
  )
}
