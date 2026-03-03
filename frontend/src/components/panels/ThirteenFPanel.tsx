import { useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Holder {
  name: string
  shares: number | null
  pctHeld: number | null
  value: number | null
  date: string
}

interface ThirteenFData {
  institutionalHolders: Holder[]
  mutualFundHolders: Holder[]
  pctInstitutions: number | null
  pctInsiders: number | null
  marketCap: number | null
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtShares(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3)  return `${(v / 1e3).toFixed(1)}K`
  return `${v}`
}

function fmtValue(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`
  return `$${v.toFixed(0)}`
}

function fmtPct(v: number | null): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(2)}%`
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// ── Sub-components ────────────────────────────────────────────────────────────

type TabKey = 'institutions' | 'mutual'

interface HolderTableProps {
  holders: Holder[]
}

function HolderTable({ holders }: HolderTableProps) {
  const top20 = holders.slice(0, 20)

  if (top20.length === 0) {
    return <div className="empty">No holder data available.</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="bb-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left', color: 'var(--dim)', minWidth: 32 }}>#</th>
            <th style={{ textAlign: 'left', minWidth: 200 }}>Holder Name</th>
            <th>Shares Held</th>
            <th>% of Float</th>
            <th>Market Value</th>
            <th style={{ textAlign: 'right', color: 'var(--orange)' }}>Date Reported</th>
          </tr>
        </thead>
        <tbody>
          {top20.map((h, i) => (
            <tr key={i}>
              <td style={{ color: 'var(--dim)', textAlign: 'left' }}>{i + 1}</td>
              <td style={{ textAlign: 'left', color: 'var(--white)' }}>{truncate(h.name, 35)}</td>
              <td>{fmtShares(h.shares)}</td>
              <td>{fmtPct(h.pctHeld)}</td>
              <td style={{ color: 'var(--yellow)' }}>{fmtValue(h.value)}</td>
              <td style={{ color: 'var(--dim)', textAlign: 'right', fontSize: 10 }}>{h.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface BarChartProps {
  holders: Holder[]
}

function HolderBarChart({ holders }: BarChartProps) {
  const top10 = holders.slice(0, 10)
  if (top10.length === 0) return null

  const maxPct = Math.max(...top10.map(h => h.pctHeld ?? 0), 0.0001)

  return (
    <div style={{ marginTop: 16 }}>
      <div className="section-title">TOP 10 HOLDERS BY % HELD</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {top10.map((h, i) => {
          const barWidth = ((h.pctHeld ?? 0) / maxPct) * 100
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <div style={{
                minWidth: 180,
                maxWidth: 180,
                color: 'var(--dim)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'right',
                flexShrink: 0,
              }}>
                {truncate(h.name, 28)}
              </div>
              <div style={{ flex: 1, background: '#111', height: 14, position: 'relative', minWidth: 60 }}>
                <div style={{
                  width: `${barWidth}%`,
                  height: '100%',
                  background: 'var(--orange)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <div style={{ minWidth: 52, color: 'var(--white)', textAlign: 'right', flexShrink: 0 }}>
                {fmtPct(h.pctHeld)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ConcentrationProps {
  holders: Holder[]
}

function ConcentrationMetrics({ holders }: ConcentrationProps) {
  if (holders.length === 0) return null

  const top5pct  = holders.slice(0, 5).reduce((sum, h) => sum + (h.pctHeld ?? 0), 0)
  const top10pct = holders.slice(0, 10).reduce((sum, h) => sum + (h.pctHeld ?? 0), 0)
  const total    = holders.length

  return (
    <div style={{ marginTop: 16 }}>
      <div className="section-title">CONCENTRATION METRICS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 4px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--dim)' }}>Top 5 institutional holders</span>
          <span style={{ color: 'var(--white)', fontWeight: 'bold' }}>{fmtPct(top5pct)} of shares</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 4px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--dim)' }}>Top 10 institutional holders</span>
          <span style={{ color: 'var(--white)', fontWeight: 'bold' }}>{fmtPct(top10pct)} of shares</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 4px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--dim)' }}>Total reporting institutions</span>
          <span style={{ color: 'var(--white)', fontWeight: 'bold' }}>{total}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ThirteenFPanel({ ticker }: { ticker: string }) {
  const [data, setData]       = useState<ThirteenFData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('institutions')

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setData(null)
    setError(null)

    fetch(`/api/ticker/${ticker}/thirteen_f`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ThirteenFData>
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [ticker])

  if (loading) return <div className="loading">Loading 13F institutional ownership data…</div>
  if (error)   return <div className="error">Error: {error}</div>
  if (!data)   return null

  const pctInst    = data.pctInstitutions ?? 0
  const pctIns     = data.pctInsiders ?? 0
  const pctFloat   = Math.max(0, 1 - pctInst - pctIns)

  const instPctBar   = Math.min(100, pctInst * 100)
  const insPctBar    = Math.min(100, pctIns * 100)
  const floatPctBar  = Math.min(100, pctFloat * 100)

  const activeHolders = activeTab === 'institutions'
    ? data.institutionalHolders
    : data.mutualFundHolders

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'institutions', label: 'INSTITUTIONS',  count: data.institutionalHolders.length },
    { key: 'mutual',       label: 'MUTUAL FUNDS',  count: data.mutualFundHolders.length },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13, marginBottom: 10 }}>
        INSTITUTIONAL OWNERSHIP&nbsp;&nbsp;&#9632;&nbsp;&nbsp;13F FILINGS
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <div style={{
          background: '#1a0a00',
          border: '1px solid var(--orange)',
          color: 'var(--orange)',
          fontSize: 11,
          padding: '3px 10px',
          fontWeight: 'bold',
        }}>
          Institutional: {(pctInst * 100).toFixed(1)}%
        </div>
        <div style={{
          background: '#1a1600',
          border: '1px solid var(--yellow)',
          color: 'var(--yellow)',
          fontSize: 11,
          padding: '3px 10px',
          fontWeight: 'bold',
        }}>
          Insider: {(pctIns * 100).toFixed(1)}%
        </div>
        <div style={{
          background: '#111',
          border: '1px solid var(--border2)',
          color: 'var(--white)',
          fontSize: 11,
          padding: '3px 10px',
          fontWeight: 'bold',
        }}>
          Float: {(pctFloat * 100).toFixed(1)}%
        </div>
      </div>

      {/* Ownership concentration stacked bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 4, letterSpacing: '0.5px' }}>
          OWNERSHIP BREAKDOWN
        </div>
        <div style={{ display: 'flex', height: 24, width: '100%', border: '1px solid var(--border2)', overflow: 'hidden', borderRadius: 2 }}>
          <div
            title={`Institutional: ${(pctInst * 100).toFixed(1)}%`}
            style={{ width: `${instPctBar}%`, background: 'var(--orange)', transition: 'width 0.3s' }}
          />
          <div
            title={`Insider: ${(pctIns * 100).toFixed(1)}%`}
            style={{ width: `${insPctBar}%`, background: 'var(--yellow)', transition: 'width 0.3s' }}
          />
          <div
            title={`Float: ${(pctFloat * 100).toFixed(1)}%`}
            style={{ width: `${floatPctBar}%`, background: '#333', transition: 'width 0.3s' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 10 }}>
          <span><span style={{ color: 'var(--orange)' }}>&#9632;</span> <span style={{ color: 'var(--dim)' }}>Institutions</span></span>
          <span><span style={{ color: 'var(--yellow)' }}>&#9632;</span> <span style={{ color: 'var(--dim)' }}>Insiders</span></span>
          <span><span style={{ color: '#555' }}>&#9632;</span> <span style={{ color: 'var(--dim)' }}>Float</span></span>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={`period-btn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Holder table */}
      <HolderTable holders={activeHolders} />

      {/* Bar chart (top 10, institutions only) */}
      {activeTab === 'institutions' && (
        <HolderBarChart holders={data.institutionalHolders} />
      )}
      {activeTab === 'mutual' && (
        <HolderBarChart holders={data.mutualFundHolders} />
      )}

      {/* Concentration metrics (always based on institutional) */}
      <ConcentrationMetrics holders={data.institutionalHolders} />
    </div>
  )
}
