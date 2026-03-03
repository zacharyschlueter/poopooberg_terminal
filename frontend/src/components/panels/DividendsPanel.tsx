import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { DividendData } from '../../types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ResponsiveContainer,
} from 'recharts'

function fmtUsd(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  return `$${v.toFixed(2)}`
}

const CustomTooltip = ({ active, payload, label, prefix = '$' }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #333', padding: '6px 10px', fontSize: 11 }}>
      <div style={{ color: 'var(--dim)' }}>{label}</div>
      <div style={{ color: 'var(--yellow)', fontWeight: 'bold' }}>
        {prefix}{payload[0].value != null ? payload[0].value.toFixed(prefix === '$' ? 2 : 0) : '—'}
      </div>
    </div>
  )
}

export default function DividendsPanel({ ticker }: { ticker: string }) {
  const [data, setData]       = useState<DividendData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setData(null); setError(null)
    api.dividends(ticker).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [ticker])

  if (loading) return <div className="loading">Loading dividends from SEC EDGAR XBRL…</div>
  if (error)   return <div className="error">Error: {error}</div>
  if (!data)   return null

  const hasDps   = data.annualDPS.length > 0
  const hasTotal = data.totalPaid.length > 0
  const hasQtr   = data.quarterlyDPS.length > 0

  if (!hasDps && !hasTotal && !hasQtr) {
    return (
      <div>
        <div style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13, marginBottom: 12 }}>
          DIVIDENDS — {ticker}
        </div>
        <div className="empty">No dividend data found for {ticker}</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13, marginBottom: 12 }}>
        DIVIDENDS — {ticker}
        <span style={{ color: 'var(--dim)', fontSize: 10, fontWeight: 'normal', marginLeft: 12 }}>
          Source: SEC EDGAR XBRL
        </span>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* Annual DPS */}
        {hasDps && (
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="section-title">ANNUAL DIVIDENDS PER SHARE</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.annualDPS} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                <XAxis dataKey="period" tick={{ fill: '#666', fontSize: 10 }} axisLine={{ stroke: '#333' }} tickLine={false} />
                <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `$${v.toFixed(2)}`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1a1a1a' }} />
                <Bar dataKey="value" fill="var(--yellow)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <table className="bb-table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Period</th>
                  <th>DPS</th>
                  <th>YoY Δ</th>
                </tr>
              </thead>
              <tbody>
                {data.annualDPS.slice().reverse().map((r, i, arr) => {
                  const prev = arr[i + 1]
                  const chg = prev && prev.value ? ((r.value - prev.value) / prev.value) : null
                  return (
                    <tr key={i}>
                      <td style={{ textAlign: 'left', color: 'var(--dim)' }}>{r.period}</td>
                      <td style={{ color: 'var(--yellow)' }}>${r.value.toFixed(4)}</td>
                      <td className={chg === null ? '' : chg >= 0 ? 'pos' : 'neg'}>
                        {chg === null ? '—' : `${chg >= 0 ? '+' : ''}${(chg * 100).toFixed(1)}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Total dividends paid */}
        {hasTotal && (
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="section-title">TOTAL DIVIDENDS PAID ($)</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.totalPaid} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                <XAxis dataKey="period" tick={{ fill: '#666', fontSize: 10 }} axisLine={{ stroke: '#333' }} tickLine={false} />
                <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div style={{ background: '#0a0a0a', border: '1px solid #333', padding: '6px 10px', fontSize: 11 }}>
                        <div style={{ color: 'var(--dim)' }}>{label}</div>
                        <div style={{ color: 'var(--orange)', fontWeight: 'bold' }}>{fmtUsd(payload[0].value as number)}</div>
                      </div>
                    )
                  }}
                  cursor={{ fill: '#1a1a1a' }}
                />
                <Bar dataKey="value" fill="var(--orange)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <table className="bb-table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Period</th>
                  <th>Total Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.totalPaid.slice().reverse().map((r, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'left', color: 'var(--dim)' }}>{r.period}</td>
                    <td style={{ color: 'var(--orange)' }}>{fmtUsd(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quarterly DPS */}
      {hasQtr && (
        <div style={{ marginTop: 20 }}>
          <div className="section-title">QUARTERLY DIVIDENDS PER SHARE</div>
          <table className="bb-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Period</th>
                <th>DPS</th>
                <th style={{ textAlign: 'left' }}>End Date</th>
              </tr>
            </thead>
            <tbody>
              {data.quarterlyDPS.slice(-20).reverse().map((r, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'left', color: 'var(--dim)' }}>{r.period}</td>
                  <td style={{ color: 'var(--yellow)' }}>${r.value.toFixed(4)}</td>
                  <td style={{ textAlign: 'left', color: 'var(--dim)', fontSize: 10 }}>{r.end}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
