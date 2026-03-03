import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { AnalystData } from '../../types'

const RATING_LABEL: Record<string, string> = {
  'strong_buy': 'Strong Buy', 'buy': 'Buy', 'hold': 'Hold',
  'sell': 'Sell', 'strong_sell': 'Strong Sell',
  'strongBuy': 'Strong Buy', 'underperform': 'Underperform',
  'outperform': 'Outperform', 'neutral': 'Neutral', 'overweight': 'Overweight',
  'underweight': 'Underweight', 'market_perform': 'Market Perform',
}

const RATING_COLOR: Record<string, string> = {
  'strong_buy': '#16a34a', 'buy': '#22c55e', 'hold': '#ca8a04',
  'sell': '#ef4444', 'strong_sell': '#991b1b',
  'outperform': '#22c55e', 'overweight': '#22c55e',
  'underperform': '#ef4444', 'underweight': '#ef4444',
  'neutral': '#ca8a04', 'market_perform': '#ca8a04',
}

function ConsensusBar({ label, count, max, cls }: { label: string; count: number; max: number; cls: string }) {
  const width = max > 0 ? Math.round((count / max) * 140) : 0
  return (
    <div className={`consensus-bar ${cls}`}>
      <span className="consensus-bar__label">{label}</span>
      <div className="consensus-bar__fill" style={{ width }} />
      <span className="consensus-bar__count">{count}</span>
    </div>
  )
}

export default function AnalystPanel({ ticker }: { ticker: string }) {
  const [data, setData]       = useState<AnalystData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setData(null); setError(null)
    api.analyst(ticker).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [ticker])

  if (loading) return <div className="loading">Fetching analyst data from Yahoo Finance…</div>
  if (error)   return <div className="error">Error: {error}</div>
  if (!data)   return null

  const { consensus, priceTargets, recentChanges } = data
  const totalVotes = (consensus.strongBuy + consensus.buy + consensus.hold + consensus.sell + consensus.strongSell)
  const maxVotes   = Math.max(consensus.strongBuy, consensus.buy, consensus.hold, consensus.sell, consensus.strongSell, 1)

  const upside    = priceTargets.upside
  const hasTarget = priceTargets.mean !== null && priceTargets.current !== null

  // Price target gauge
  const low  = priceTargets.low  ?? priceTargets.current ?? 0
  const high = priceTargets.high ?? priceTargets.current ?? 0
  const cur  = priceTargets.current ?? 0
  const mean = priceTargets.mean ?? cur
  const range = Math.max(high - low, 1)
  const curPct  = Math.min(100, Math.max(0, ((cur  - low) / range) * 100))
  const meanPct = Math.min(100, Math.max(0, ((mean - low) / range) * 100))

  return (
    <div>
      <div style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13, marginBottom: 12 }}>
        ANALYST COVERAGE  <span style={{ color: 'var(--dim)', fontSize: 10, fontWeight: 'normal' }}>Source: Yahoo Finance</span>
      </div>

      <div className="analyst-grid">
        {/* Consensus */}
        <div>
          <div className="section-title">CONSENSUS RATING</div>
          <div style={{ marginBottom: 8 }}>
            <span style={{
              fontSize: 18, fontWeight: 'bold',
              color: RATING_COLOR[consensus.ratingKey ?? ''] || 'var(--white)',
            }}>
              {RATING_LABEL[consensus.ratingKey ?? ''] || consensus.ratingKey || '—'}
            </span>
            {consensus.numAnalysts && (
              <span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 10 }}>
                {consensus.numAnalysts} analysts
              </span>
            )}
            {consensus.ratingMean && (
              <span style={{ color: 'var(--dim)', fontSize: 10, marginLeft: 8 }}>
                Mean: {consensus.ratingMean.toFixed(2)} / 5
              </span>
            )}
          </div>
          <ConsensusBar label="Strong Buy"  count={consensus.strongBuy}  max={maxVotes} cls="strong-buy" />
          <ConsensusBar label="Buy"         count={consensus.buy}         max={maxVotes} cls="buy" />
          <ConsensusBar label="Hold"        count={consensus.hold}        max={maxVotes} cls="hold" />
          <ConsensusBar label="Sell"        count={consensus.sell}        max={maxVotes} cls="sell" />
          <ConsensusBar label="Strong Sell" count={consensus.strongSell}  max={maxVotes} cls="strong-sell" />
          <div style={{ color: 'var(--dim)', fontSize: 10, marginTop: 6 }}>
            Total: {totalVotes} ratings
          </div>
        </div>

        {/* Price Targets */}
        <div>
          <div className="section-title">PRICE TARGETS</div>
          {hasTarget ? (
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                {[
                  { label: 'Current', val: priceTargets.current, color: 'var(--yellow)' },
                  { label: 'Mean Target', val: priceTargets.mean, color: 'var(--orange)' },
                  { label: 'Median', val: priceTargets.median, color: 'var(--white)' },
                  { label: 'High', val: priceTargets.high, color: 'var(--green)' },
                  { label: 'Low',  val: priceTargets.low,  color: 'var(--red)' },
                ].map(({ label, val, color }) => val !== null && (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--dim)', fontSize: 10 }}>{label}</div>
                    <div style={{ color, fontSize: 15, fontWeight: 'bold' }}>${val.toFixed(2)}</div>
                  </div>
                ))}
                {upside !== null && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--dim)', fontSize: 10 }}>Upside</div>
                    <span className={`upside-badge ${upside >= 0 ? 'pos' : 'neg'}`}>
                      {upside >= 0 ? '+' : ''}{(upside * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Gauge */}
              <div style={{ position: 'relative', height: 24, background: '#111', border: '1px solid #222', borderRadius: 2, marginBottom: 6 }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, background: '#1e1e1e' }} />
                {/* Current price marker */}
                <div title={`Current: $${priceTargets.current?.toFixed(2)}`}
                  style={{ position: 'absolute', left: `${curPct}%`, top: 0, bottom: 0, width: 3, background: 'var(--yellow)', transform: 'translateX(-50%)' }} />
                {/* Mean target marker */}
                <div title={`Mean target: $${priceTargets.mean?.toFixed(2)}`}
                  style={{ position: 'absolute', left: `${meanPct}%`, top: 0, bottom: 0, width: 3, background: 'var(--orange)', transform: 'translateX(-50%)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--dim)' }}>
                <span>Low ${priceTargets.low?.toFixed(2)}</span>
                <span style={{ color: 'var(--yellow)' }}>■ Current</span>
                <span style={{ color: 'var(--orange)' }}>■ Mean Target</span>
                <span>High ${priceTargets.high?.toFixed(2)}</span>
              </div>
            </>
          ) : (
            <div className="empty">No price target data available</div>
          )}
        </div>
      </div>

      {/* Recent rating changes */}
      {recentChanges.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 16 }}>RECENT UPGRADES / DOWNGRADES</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="bb-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Date</th>
                  <th style={{ textAlign: 'left' }}>Firm</th>
                  <th>Action</th>
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                {recentChanges.slice(0, 20).map((r, i) => {
                  const isUp = r.action.toLowerCase().includes('up') || r.action.toLowerCase().includes('init')
                  const isDn = r.action.toLowerCase().includes('down')
                  return (
                    <tr key={i}>
                      <td style={{ textAlign: 'left', color: 'var(--dim)' }}>{r.date}</td>
                      <td style={{ textAlign: 'left', color: 'var(--white)' }}>{r.firm}</td>
                      <td className={isUp ? 'pos' : isDn ? 'neg' : ''}>
                        {r.action || '—'}
                      </td>
                      <td style={{ color: 'var(--dim)' }}>{r.fromGrade || '—'}</td>
                      <td style={{ color: 'var(--white)' }}>{r.toGrade || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
