import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { OptionsData, OptionContract } from '../../types'

function fmtNum(v: number | null, dec = 2): string {
  if (v === null) return '—'
  return v.toFixed(dec)
}

function fmtVol(v: number | null): string {
  if (v === null) return '—'
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return `${v}`
}

function fmtIv(v: number | null): string {
  if (v === null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

type Side = 'calls' | 'puts'

function OptionsTable({ contracts, currentPrice }: { contracts: OptionContract[]; currentPrice?: number }) {
  if (contracts.length === 0) return <div className="empty">No contracts available</div>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="bb-table">
        <thead>
          <tr>
            <th>Strike</th>
            <th>Last</th>
            <th>Bid</th>
            <th>Ask</th>
            <th>Volume</th>
            <th>Open Int.</th>
            <th>IV</th>
            <th>ITM</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c, i) => {
            const itm = c.inTheMoney
            return (
              <tr key={i} style={{ background: itm ? '#0d1f0d' : undefined }}>
                <td style={{
                  color: itm ? 'var(--green)' : 'var(--white)',
                  fontWeight: itm ? 'bold' : undefined,
                }}>
                  ${fmtNum(c.strike)}
                </td>
                <td style={{ color: 'var(--yellow)' }}>${fmtNum(c.lastPrice)}</td>
                <td style={{ color: 'var(--dim)' }}>${fmtNum(c.bid)}</td>
                <td style={{ color: 'var(--dim)' }}>${fmtNum(c.ask)}</td>
                <td style={{ color: 'var(--white)' }}>{fmtVol(c.volume)}</td>
                <td style={{ color: 'var(--dim)' }}>{fmtVol(c.openInterest)}</td>
                <td style={{ color: (c.impliedVolatility ?? 0) > 0.5 ? 'var(--red)' : 'var(--dim)' }}>
                  {fmtIv(c.impliedVolatility)}
                </td>
                <td style={{ color: itm ? 'var(--green)' : 'var(--dim)' }}>{itm ? '✓' : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function OptionsPanel({ ticker }: { ticker: string }) {
  const [data, setData]           = useState<OptionsData | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [expiration, setExp]      = useState<string | null>(null)
  const [side, setSide]           = useState<Side>('calls')

  // Load expirations list first
  useEffect(() => {
    setLoading(true); setData(null); setError(null); setExp(null)
    api.options(ticker, undefined)
      .then(d => { setData(d); setExp(d.selected) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [ticker])

  // Reload when expiration changes + 60s auto-refresh
  useEffect(() => {
    if (!expiration) return
    setLoading(true)
    api.options(ticker, expiration)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    const id = setInterval(() => {
      api.options(ticker, expiration).then(setData).catch(() => {})
    }, 60_000)
    return () => clearInterval(id)
  }, [expiration, ticker])

  if (loading && !data) return <div className="loading">Loading options chain from Yahoo Finance…</div>
  if (error)             return <div className="error">Error: {error}</div>
  if (!data)             return null

  const contracts = side === 'calls' ? data.calls : data.puts
  const callCount = data.calls.length
  const putCount  = data.puts.length
  const pcRatio   = callCount > 0 ? (putCount / callCount).toFixed(2) : '—'

  return (
    <div>
      <div style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13, marginBottom: 10 }}>
        OPTIONS CHAIN — {ticker}
        <span style={{ color: 'var(--dim)', fontSize: 10, fontWeight: 'normal', marginLeft: 12 }}>
          Source: Yahoo Finance
        </span>
      </div>

      {/* Expiration selector */}
      {data.expirations.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ color: 'var(--dim)', fontSize: 11, marginRight: 8 }}>Expiration:</span>
          <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
            {data.expirations.map(exp => (
              <button
                key={exp}
                className={`period-btn ${expiration === exp ? 'active' : ''}`}
                onClick={() => setExp(exp)}
                style={{ fontSize: 10 }}
              >
                {exp}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Calls', val: callCount, color: 'var(--green)' },
          { label: 'Puts',  val: putCount,  color: 'var(--red)' },
          { label: 'P/C Ratio', val: pcRatio, color: (parseFloat(pcRatio) > 1 ? 'var(--red)' : 'var(--green)') },
        ].map(s => (
          <div key={s.label}>
            <div style={{ color: 'var(--dim)', fontSize: 10 }}>{s.label}</div>
            <div style={{ color: s.color, fontWeight: 'bold', fontSize: 14 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Calls / Puts toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <button className={`period-btn ${side === 'calls' ? 'active' : ''}`} onClick={() => setSide('calls')}>
          CALLS ({callCount})
        </button>
        <button className={`period-btn ${side === 'puts' ? 'active' : ''}`} onClick={() => setSide('puts')}>
          PUTS ({putCount})
        </button>
      </div>

      {loading && <div style={{ color: 'var(--dim)', fontSize: 11, marginBottom: 8 }}>Refreshing…</div>}

      <OptionsTable contracts={contracts} />

      <div style={{ color: 'var(--dim)', fontSize: 10, marginTop: 8 }}>
        Green rows = in-the-money  ■  IV &gt; 50% highlighted red  ■  Green checkmark = ITM
      </div>
    </div>
  )
}
