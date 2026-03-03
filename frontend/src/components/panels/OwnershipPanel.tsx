import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { OwnershipData, ThirteenFData } from '../../types'

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

function fmtPct(v: number | null, decimals = 2): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(decimals)}%`
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

type SubTab = 'institutional' | 'mutual' | '13dg' | 'form4'

// ── Holder bar chart (top 10) ─────────────────────────────────────────────────

interface HolderBarChartProps {
  holders: ThirteenFData['institutionalHolders']
  color?: string
}

function HolderBarChart({ holders, color = 'var(--orange)' }: HolderBarChartProps) {
  const top10 = holders.slice(0, 10).filter(h => (h.pctHeld ?? 0) > 0)
  if (top10.length === 0) return null
  const maxPct = Math.max(...top10.map(h => h.pctHeld ?? 0), 0.0001)

  return (
    <div style={{ marginTop: 16 }}>
      <div className="section-title">TOP 10 BY % HELD</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {top10.map((h, i) => {
          const barWidth = ((h.pctHeld ?? 0) / maxPct) * 100
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <div style={{ minWidth: 180, maxWidth: 180, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                {truncate(h.name, 28)}
              </div>
              <div style={{ flex: 1, background: '#111', height: 13, position: 'relative', minWidth: 60 }}>
                <div style={{ width: `${barWidth}%`, height: '100%', background: color }} />
              </div>
              <div style={{ minWidth: 56, color: 'var(--white)', textAlign: 'right', flexShrink: 0 }}>
                {fmtPct(h.pctHeld)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OwnershipPanel({ ticker }: { ticker: string }) {
  const [ownData,  setOwnData]  = useState<OwnershipData | null>(null)
  const [tfData,   setTfData]   = useState<ThirteenFData | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [subTab,   setSubTab]   = useState<SubTab>('institutional')

  useEffect(() => {
    if (!ticker) return
    setLoading(true); setOwnData(null); setTfData(null); setError(null)

    // Fetch both endpoints in parallel
    Promise.all([
      api.ownership(ticker),
      api.thirteenF(ticker),
    ])
      .then(([own, tf]) => { setOwnData(own); setTfData(tf) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [ticker])

  if (loading) return <div className="loading">Loading ownership data…</div>
  if (error)   return <div className="error">Error: {error}</div>
  if (!ownData) return null

  const pctInst  = tfData?.pctInstitutions ?? 0
  const pctIns   = tfData?.pctInsiders ?? 0
  const pctFloat = Math.max(0, 1 - pctInst - pctIns)

  const instHolders = tfData?.institutionalHolders ?? ownData.institutional.map(h => ({
    name: h.name, shares: h.shares, pctHeld: h.pctHeld, value: h.value, date: h.date,
  }))
  const mfHolders = tfData?.mutualFundHolders ?? []

  const top5pct  = instHolders.slice(0, 5).reduce((s, h) => s + (h.pctHeld ?? 0), 0)
  const top10pct = instHolders.slice(0, 10).reduce((s, h) => s + (h.pctHeld ?? 0), 0)

  const tabs: { key: SubTab; label: string; count: number }[] = [
    { key: 'institutional', label: 'INSTITUTIONS',   count: instHolders.length },
    { key: 'mutual',        label: 'MUTUAL FUNDS',   count: mfHolders.length },
    { key: '13dg',          label: '13D / 13G',      count: ownData.majorHolders13DG.length },
    { key: 'form4',         label: 'FORM 4',         count: ownData.insiderTransactions.length },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13, marginBottom: 10 }}>
        OWNERSHIP — {ticker}
        <span style={{ color: 'var(--dim)', fontSize: 10, fontWeight: 'normal', marginLeft: 12 }}>
          Institutional/MF: Yahoo Finance  ■  13D/G + Form 4: SEC EDGAR
        </span>
      </div>

      {/* Ownership summary chips */}
      {tfData && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <div style={{ background: '#1a0a00', border: '1px solid var(--orange)', color: 'var(--orange)', fontSize: 11, padding: '3px 10px', fontWeight: 'bold' }}>
            Institutional: {(pctInst * 100).toFixed(1)}%
          </div>
          <div style={{ background: '#1a1600', border: '1px solid var(--yellow)', color: 'var(--yellow)', fontSize: 11, padding: '3px 10px', fontWeight: 'bold' }}>
            Insider: {(pctIns * 100).toFixed(1)}%
          </div>
          <div style={{ background: '#111', border: '1px solid var(--border2)', color: 'var(--white)', fontSize: 11, padding: '3px 10px', fontWeight: 'bold' }}>
            Float: {(pctFloat * 100).toFixed(1)}%
          </div>
          {top10pct > 0 && (
            <>
              <div style={{ background: '#111', border: '1px solid var(--border2)', color: 'var(--dim)', fontSize: 11, padding: '3px 10px' }}>
                Top 5: <span style={{ color: 'var(--white)', fontWeight: 'bold' }}>{fmtPct(top5pct)}</span>
              </div>
              <div style={{ background: '#111', border: '1px solid var(--border2)', color: 'var(--dim)', fontSize: 11, padding: '3px 10px' }}>
                Top 10: <span style={{ color: 'var(--white)', fontWeight: 'bold' }}>{fmtPct(top10pct)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Stacked ownership breakdown bar */}
      {tfData && (pctInst > 0 || pctIns > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 4, letterSpacing: '0.5px' }}>OWNERSHIP BREAKDOWN</div>
          <div style={{ display: 'flex', height: 20, width: '100%', border: '1px solid var(--border2)', overflow: 'hidden', borderRadius: 2 }}>
            <div title={`Institutional: ${(pctInst * 100).toFixed(1)}%`} style={{ width: `${Math.min(100, pctInst * 100)}%`, background: 'var(--orange)', transition: 'width 0.3s' }} />
            <div title={`Insider: ${(pctIns * 100).toFixed(1)}%`}        style={{ width: `${Math.min(100, pctIns * 100)}%`, background: 'var(--yellow)', transition: 'width 0.3s' }} />
            <div title={`Float: ${(pctFloat * 100).toFixed(1)}%`}         style={{ width: `${Math.min(100, pctFloat * 100)}%`, background: '#2a2a2a', transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 3, fontSize: 10 }}>
            <span><span style={{ color: 'var(--orange)' }}>■</span> <span style={{ color: 'var(--dim)' }}>Institutions</span></span>
            <span><span style={{ color: 'var(--yellow)' }}>■</span> <span style={{ color: 'var(--dim)' }}>Insiders</span></span>
            <span><span style={{ color: '#555' }}>■</span> <span style={{ color: 'var(--dim)' }}>Float</span></span>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} className={`period-btn ${subTab === t.key ? 'active' : ''}`} onClick={() => setSubTab(t.key)}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* ── INSTITUTIONAL ── */}
      {subTab === 'institutional' && (
        <>
          {instHolders.length === 0 ? (
            <div className="empty">No institutional holder data available</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="bb-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', color: 'var(--dim)', minWidth: 28 }}>#</th>
                      <th style={{ textAlign: 'left', minWidth: 200 }}>Institution</th>
                      <th>Shares</th>
                      <th>% Float</th>
                      <th>Value</th>
                      <th style={{ textAlign: 'right', color: 'var(--orange)' }}>Report Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instHolders.slice(0, 25).map((h, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--dim)', textAlign: 'left' }}>{i + 1}</td>
                        <td style={{ textAlign: 'left', color: 'var(--white)' }}>{truncate(h.name, 38)}</td>
                        <td style={{ color: 'var(--dim)' }}>{fmtShares(h.shares)}</td>
                        <td className={(h.pctHeld ?? 0) > 0.05 ? 'pos' : ''}>{fmtPct(h.pctHeld)}</td>
                        <td style={{ color: 'var(--yellow)' }}>{fmtValue(h.value)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--dim)', fontSize: 10 }}>{h.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <HolderBarChart holders={instHolders} color="var(--orange)" />
            </>
          )}
        </>
      )}

      {/* ── MUTUAL FUNDS ── */}
      {subTab === 'mutual' && (
        <>
          {mfHolders.length === 0 ? (
            <div className="empty">No mutual fund holder data available</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="bb-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', color: 'var(--dim)', minWidth: 28 }}>#</th>
                      <th style={{ textAlign: 'left', minWidth: 200 }}>Fund</th>
                      <th>Shares</th>
                      <th>% Float</th>
                      <th>Value</th>
                      <th style={{ textAlign: 'right', color: 'var(--orange)' }}>Report Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mfHolders.slice(0, 25).map((h, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--dim)', textAlign: 'left' }}>{i + 1}</td>
                        <td style={{ textAlign: 'left', color: 'var(--white)' }}>{truncate(h.name, 38)}</td>
                        <td style={{ color: 'var(--dim)' }}>{fmtShares(h.shares)}</td>
                        <td className={(h.pctHeld ?? 0) > 0.05 ? 'pos' : ''}>{fmtPct(h.pctHeld)}</td>
                        <td style={{ color: 'var(--yellow)' }}>{fmtValue(h.value)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--dim)', fontSize: 10 }}>{h.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <HolderBarChart holders={mfHolders} color="var(--cyan)" />
            </>
          )}
        </>
      )}

      {/* ── 13D / 13G ── */}
      {subTab === '13dg' && (
        <>
          {ownData.majorHolders13DG.length === 0 ? (
            <div className="empty">No 13D/13G filings found for {ticker}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="bb-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Form</th>
                    <th style={{ textAlign: 'left' }}>Date</th>
                    <th style={{ textAlign: 'left' }}>Accession</th>
                    <th style={{ width: 60 }}>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {ownData.majorHolders13DG.map((f, i) => (
                    <tr key={i}>
                      <td style={{ color: '#e879f9', fontWeight: 'bold' }}>{f.form}</td>
                      <td style={{ color: 'var(--dim)' }}>{f.date}</td>
                      <td style={{ color: 'var(--dim)', fontSize: 10 }}>{f.accession}</td>
                      <td style={{ textAlign: 'center' }}>
                        <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--orange)', textDecoration: 'none', fontSize: 11 }}>VIEW</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── FORM 4 ── */}
      {subTab === 'form4' && (
        <>
          {ownData.insiderTransactions.length === 0 ? (
            <div className="empty">No Form 4 insider transactions found for {ticker}</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="bb-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Form</th>
                      <th style={{ textAlign: 'left' }}>Date</th>
                      <th style={{ textAlign: 'left' }}>Accession</th>
                      <th style={{ width: 60 }}>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownData.insiderTransactions.slice(0, 100).map((f, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--green)', fontWeight: 'bold' }}>{f.form}</td>
                        <td style={{ color: 'var(--dim)' }}>{f.date}</td>
                        <td style={{ color: 'var(--dim)', fontSize: 10 }}>{f.accession}</td>
                        <td style={{ textAlign: 'center' }}>
                          <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--orange)', textDecoration: 'none', fontSize: 11 }}>VIEW</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ownData.insiderTransactions.length > 100 && (
                <div style={{ color: 'var(--dim)', fontSize: 10, marginTop: 6 }}>
                  Showing 100 of {ownData.insiderTransactions.length} Form 4 filings
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
