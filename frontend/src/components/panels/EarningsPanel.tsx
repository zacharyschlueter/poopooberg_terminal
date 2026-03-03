import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { EarningsData } from '../../types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ResponsiveContainer, ReferenceLine,
} from 'recharts'

function fmtEps(v: number | null): string {
  if (v === null) return '—'
  return `$${v.toFixed(2)}`
}

export default function EarningsPanel({ ticker }: { ticker: string }) {
  const [data, setData]       = useState<EarningsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setData(null); setError(null)
    api.earnings(ticker).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [ticker])

  if (loading) return <div className="loading">Loading earnings from SEC EDGAR XBRL…</div>
  if (error)   return <div className="error">Error: {error}</div>
  if (!data)   return null

  const annualChart = data.annual.map(r => ({
    period: r.fy,
    eps: r.diluted ?? r.basic,
  }))

  const quarterlyChart = data.quarterly.map(r => ({
    period: r.period,
    eps: r.diluted ?? r.basic,
  }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const val = payload[0].value
    return (
      <div style={{ background: '#0a0a0a', border: '1px solid #333', padding: '6px 10px', fontSize: 11 }}>
        <div style={{ color: 'var(--dim)' }}>{label}</div>
        <div style={{ color: val >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 'bold' }}>
          EPS: {val != null ? `$${val.toFixed(2)}` : '—'}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13, marginBottom: 12 }}>
        EARNINGS PER SHARE — {ticker}
        <span style={{ color: 'var(--dim)', fontSize: 10, fontWeight: 'normal', marginLeft: 12 }}>
          Source: SEC EDGAR XBRL  ■  Diluted EPS preferred
        </span>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* Annual */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="section-title">ANNUAL EPS</div>
          {annualChart.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={annualChart} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis dataKey="period" tick={{ fill: '#666', fontSize: 10 }} axisLine={{ stroke: '#333' }} tickLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `$${v.toFixed(1)}`} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1a1a1a' }} />
                  <ReferenceLine y={0} stroke="#444" />
                  <Bar dataKey="eps" radius={[2, 2, 0, 0]}>
                    {annualChart.map((entry, i) => (
                      <Cell key={i} fill={(entry.eps ?? 0) >= 0 ? '#16a34a' : '#991b1b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <table className="bb-table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Fiscal Year</th>
                    <th>Basic EPS</th>
                    <th>Diluted EPS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.annual.map((r, i) => {
                    const pos = (r.diluted ?? r.basic ?? 0) >= 0
                    return (
                      <tr key={i}>
                        <td style={{ textAlign: 'left', color: 'var(--dim)' }}>{r.fy}</td>
                        <td className={pos ? 'pos' : 'neg'}>{fmtEps(r.basic)}</td>
                        <td className={pos ? 'pos' : 'neg'} style={{ fontWeight: 'bold' }}>{fmtEps(r.diluted)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          ) : (
            <div className="empty">No annual EPS data available</div>
          )}
        </div>

        {/* Quarterly */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="section-title">QUARTERLY EPS</div>
          {quarterlyChart.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={quarterlyChart.slice(-16)} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis dataKey="period" tick={{ fill: '#666', fontSize: 9 }} axisLine={{ stroke: '#333' }} tickLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `$${v.toFixed(2)}`} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1a1a1a' }} />
                  <ReferenceLine y={0} stroke="#444" />
                  <Bar dataKey="eps" radius={[2, 2, 0, 0]}>
                    {quarterlyChart.slice(-16).map((entry, i) => (
                      <Cell key={i} fill={(entry.eps ?? 0) >= 0 ? '#16a34a' : '#991b1b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <table className="bb-table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Period</th>
                    <th>Basic EPS</th>
                    <th>Diluted EPS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.quarterly.slice(-16).reverse().map((r, i) => {
                    const pos = (r.diluted ?? r.basic ?? 0) >= 0
                    return (
                      <tr key={i}>
                        <td style={{ textAlign: 'left', color: 'var(--dim)' }}>{r.period}</td>
                        <td className={pos ? 'pos' : 'neg'}>{fmtEps(r.basic)}</td>
                        <td className={pos ? 'pos' : 'neg'} style={{ fontWeight: 'bold' }}>{fmtEps(r.diluted)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          ) : (
            <div className="empty">No quarterly EPS data available</div>
          )}
        </div>
      </div>
    </div>
  )
}
