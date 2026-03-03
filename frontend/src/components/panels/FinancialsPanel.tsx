import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { FinancialData, FinRow } from '../../types'

interface Props { ticker: string; stmt: 'income' | 'balance' | 'cashflow' | 'fa' }

function fmtVal(v: number | null, type: FinRow['type']): string {
  if (v === null || v === undefined) return '—'
  switch (type) {
    case 'usd':
      if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}B`
      if (Math.abs(v) >= 0.1)  return `$${v.toFixed(1)}M`
      return `$${v.toFixed(2)}M`
    case 'pct':
      return `${(v * 100).toFixed(1)}%`
    case 'eps':
      return `$${v.toFixed(2)}`
    case 'plain1':
      return v.toFixed(1)
    case 'plain2':
      return v.toFixed(2)
    case 'plain3':
      return v.toFixed(3)
    default:
      return `${v.toFixed(1)}`
  }
}

function cellClass(v: number | null, type: FinRow['type']): string {
  if (v === null) return ''
  if (type === 'pct') return v >= 0 ? 'pos' : 'neg'
  if (type === 'usd') return v < 0 ? 'neg' : ''
  if (type === 'eps') return v >= 0 ? '' : 'neg'
  return ''
}

const STMT_TITLES: Record<string, string> = {
  income: 'INCOME STATEMENT', balance: 'BALANCE SHEET',
  cashflow: 'CASH FLOW STATEMENT', fa: 'FINANCIAL ANALYSIS',
}

export default function FinancialsPanel({ ticker, stmt }: Props) {
  const [data, setData]       = useState<FinancialData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setData(null); setError(null)
    const fn = stmt === 'income' ? api.income
             : stmt === 'balance' ? api.balance
             : stmt === 'cashflow' ? api.cashflow
             : api.fa
    fn(ticker).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [ticker, stmt])

  if (loading) return <div className="loading">Fetching {STMT_TITLES[stmt]} from EDGAR…</div>
  if (error)   return <div className="error">Error: {error}</div>
  if (!data)   return null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13 }}>
          {STMT_TITLES[stmt]}
        </span>
        <span style={{ color: 'var(--dim)', fontSize: 10 }}>{data.note}  ■  Source: SEC EDGAR XBRL</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="bb-table" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}></th>
              {data.periods.map(p => <th key={p}>{p}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => {
              if (row.type === 'header') {
                return (
                  <tr key={i} className="header-row">
                    <td colSpan={data.periods.length + 1}>{row.label}</td>
                  </tr>
                )
              }
              if (row.type === 'divider') {
                return <tr key={i} className="divider-row"><td colSpan={data.periods.length + 1} /></tr>
              }
              return (
                <tr key={i}>
                  <td className={`${row.indent === 1 ? 'indent1' : row.indent === 2 ? 'indent2' : ''} ${row.bold ? 'bold' : ''}`}>
                    {row.label}
                  </td>
                  {(row.values ?? []).map((v, j) => {
                    const formatted = fmtVal(v, row.type)
                    const cls = cellClass(v, row.type)
                    return (
                      <td key={j} className={`${cls} ${row.bold ? 'bold' : ''}`}>
                        {formatted}
                      </td>
                    )
                  })}
                  {/* Fill empty columns if fewer values than periods */}
                  {Array.from({ length: Math.max(0, data.periods.length - (row.values?.length ?? 0)) }).map((_, j) => (
                    <td key={`empty-${j}`}>—</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
