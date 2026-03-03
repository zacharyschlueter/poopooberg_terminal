import { useEffect, useRef, useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuoteData {
  symbol: string
  name: string
  price: number | null
  change: number | null
  changePct: number | null
  marketCap: number | null
  volume: number | null
  pe: number | null
  week52High: number | null
  week52Low: number | null
}

interface Props {
  onLoadTicker: (sym: string) => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_KEY     = 'pb_watchlist'
const REFRESH_MS = 30_000

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPrice(v: number | null): string {
  if (v === null) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtChange(v: number | null): string {
  if (v === null) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(2)
}

function fmtChangePct(v: number | null): string {
  if (v === null) return '—'
  return `(${v >= 0 ? '+' : ''}${v.toFixed(2)}%)`
}

function fmtMarketCap(v: number | null): string {
  if (v === null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`
  return `$${v.toFixed(0)}`
}

function fmtVol(v: number | null): string {
  if (v === null) return '—'
  if (v >= 1e9)  return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6)  return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3)  return `${(v / 1e3).toFixed(0)}K`
  return `${v}`
}

function fmtPE(v: number | null): string {
  if (v === null) return '—'
  return v.toFixed(1)
}

function truncateName(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── 52-Week Range Bar ─────────────────────────────────────────────────────────

interface RangeBarProps {
  price: number | null
  low: number | null
  high: number | null
}

function RangeBar({ price, low, high }: RangeBarProps) {
  if (price === null || low === null || high === null || high === low) {
    return <div style={{ width: 60, height: 8, background: '#1e1e1e', borderRadius: 2 }} />
  }

  const pct = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100))

  return (
    <div
      title={`52W: $${low.toFixed(2)} – $${high.toFixed(2)}`}
      style={{
        width: 60,
        height: 8,
        background: '#1e1e1e',
        borderRadius: 2,
        position: 'relative',
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
    >
      {/* Filled portion up to current price */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: `${pct}%`,
        background: '#2a2a2a',
        borderRadius: 2,
      }} />
      {/* Current price tick */}
      <div style={{
        position: 'absolute',
        left: `${pct}%`,
        top: 0,
        bottom: 0,
        width: 2,
        background: 'var(--orange)',
        transform: 'translateX(-50%)',
        borderRadius: 1,
      }} />
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WatchlistPanel({ onLoadTicker }: Props) {
  const [watchlist, setWatchlist]   = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })
  const [quotes, setQuotes]         = useState<Record<string, QuoteData>>({})
  const [loading, setLoading]       = useState(false)
  const [newTicker, setNewTicker]   = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)

  // Persist watchlist to localStorage whenever it changes
  const saveWatchlist = useCallback((list: string[]) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list))
    } catch {
      // ignore storage errors
    }
  }, [])

  // Fetch a single ticker quote, returns QuoteData or null on error
  const fetchQuote = useCallback(async (sym: string): Promise<QuoteData | null> => {
    try {
      const r = await fetch(`/api/ticker/${sym}/quote`)
      if (!r.ok) return null
      return (await r.json()) as QuoteData
    } catch {
      return null
    }
  }, [])

  // Fetch quotes for all tickers in parallel
  const refreshAll = useCallback(async (list: string[]) => {
    if (list.length === 0) return
    setLoading(true)
    const results = await Promise.all(list.map(sym => fetchQuote(sym)))
    setQuotes(prev => {
      const next = { ...prev }
      list.forEach((sym, i) => {
        const q = results[i]
        if (q) next[sym] = q
      })
      return next
    })
    setLastUpdated(new Date())
    setLoading(false)
  }, [fetchQuote])

  // On mount: fetch all quotes; set up interval
  useEffect(() => {
    refreshAll(watchlist)
    intervalRef.current = setInterval(() => {
      setWatchlist(prev => {
        refreshAll(prev)
        return prev
      })
    }, REFRESH_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Add ticker
  const addTicker = useCallback(async () => {
    const sym = newTicker.trim().toUpperCase()
    if (!sym) return
    setNewTicker('')

    setWatchlist(prev => {
      if (prev.includes(sym)) return prev
      const next = [...prev, sym]
      saveWatchlist(next)
      // fetch the new ticker immediately
      fetchQuote(sym).then(q => {
        if (q) {
          setQuotes(qprev => ({ ...qprev, [sym]: q }))
          setLastUpdated(new Date())
        }
      })
      return next
    })
  }, [newTicker, saveWatchlist, fetchQuote])

  // Remove ticker
  const removeTicker = useCallback((sym: string) => {
    setWatchlist(prev => {
      const next = prev.filter(s => s !== sym)
      saveWatchlist(next)
      return next
    })
    setQuotes(prev => {
      const next = { ...prev }
      delete next[sym]
      return next
    })
  }, [saveWatchlist])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') addTicker()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
        <div style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13 }}>
          <span style={{ fontSize: 18 }}>💩</span>{' '}
          <span>WATCHLIST</span>
          {loading && (
            <span style={{ color: 'var(--dim)', fontSize: 10, fontWeight: 'normal', marginLeft: 10 }}>
              refreshing…
            </span>
          )}
        </div>
        {lastUpdated && (
          <div style={{ color: 'var(--dim)', fontSize: 10 }}>
            Last updated {fmtTime(lastUpdated)}
          </div>
        )}
      </div>

      {/* Add ticker input */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
        <input
          ref={inputRef}
          type="text"
          value={newTicker}
          onChange={e => setNewTicker(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          placeholder="ADD TICKER…"
          maxLength={10}
          spellCheck={false}
          style={{
            background: '#000',
            border: '1px solid var(--border2)',
            color: 'var(--yellow)',
            fontFamily: 'var(--font)',
            fontSize: 12,
            padding: '4px 8px',
            outline: 'none',
            textTransform: 'uppercase',
            width: 140,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--orange)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border2)' }}
        />
        <button
          onClick={addTicker}
          style={{
            background: 'var(--orange)',
            color: '#000',
            border: 'none',
            fontFamily: 'var(--font)',
            fontSize: 11,
            fontWeight: 'bold',
            padding: '4px 10px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--yellow)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--orange)' }}
        >
          ADD
        </button>
        <button
          onClick={() => refreshAll(watchlist)}
          title="Refresh all quotes"
          style={{
            background: 'none',
            color: 'var(--dim)',
            border: '1px solid var(--border2)',
            fontFamily: 'var(--font)',
            fontSize: 11,
            padding: '4px 8px',
            cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--orange)'; e.currentTarget.style.color = 'var(--white)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--dim)' }}
        >
          ↺
        </button>
      </div>

      {/* Table or empty state */}
      {watchlist.length === 0 ? (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--dim)',
          fontSize: 12,
          flexDirection: 'column',
          gap: 6,
        }}>
          <div>No tickers in watchlist. Add one above. 💩</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table className="bb-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Ticker</th>
                <th style={{ textAlign: 'left' }}>Name</th>
                <th>Price</th>
                <th>Chg</th>
                <th>Chg%</th>
                <th>Mkt Cap</th>
                <th>Vol</th>
                <th>P/E</th>
                <th>52W Range</th>
                <th style={{ textAlign: 'center' }}>–</th>
              </tr>
            </thead>
            <tbody>
              {watchlist.map(sym => {
                const q = quotes[sym]
                const isHovered = hoveredRow === sym
                const chg = q?.change ?? null
                const pct = q?.changePct ?? null
                const isPos = chg !== null && chg > 0
                const isNeg = chg !== null && chg < 0

                return (
                  <tr
                    key={sym}
                    onMouseEnter={() => setHoveredRow(sym)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={isHovered ? { background: 'var(--bg-hover)' } : {}}
                  >
                    {/* Ticker */}
                    <td
                      style={{
                        textAlign: 'left',
                        color: 'var(--orange)',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                      onClick={() => onLoadTicker(sym)}
                      title={`Load ${sym}`}
                    >
                      {sym}
                    </td>

                    {/* Name */}
                    <td style={{ textAlign: 'left', color: 'var(--dim)' }}>
                      {q ? truncateName(q.name, 25) : <span style={{ opacity: 0.4 }}>loading…</span>}
                    </td>

                    {/* Price */}
                    <td style={{ color: 'var(--white)', fontWeight: 'bold' }}>
                      {q ? fmtPrice(q.price) : '—'}
                    </td>

                    {/* Chg */}
                    <td className={isPos ? 'pos' : isNeg ? 'neg' : ''}>
                      {q ? fmtChange(chg) : '—'}
                    </td>

                    {/* Chg% */}
                    <td className={isPos ? 'pos' : isNeg ? 'neg' : ''}>
                      {q ? fmtChangePct(pct) : '—'}
                    </td>

                    {/* Mkt Cap */}
                    <td style={{ color: 'var(--dim)' }}>
                      {q ? fmtMarketCap(q.marketCap) : '—'}
                    </td>

                    {/* Vol */}
                    <td style={{ color: 'var(--dim)' }}>
                      {q ? fmtVol(q.volume) : '—'}
                    </td>

                    {/* P/E */}
                    <td style={{ color: 'var(--white)' }}>
                      {q ? fmtPE(q.pe) : '—'}
                    </td>

                    {/* 52W Range bar */}
                    <td style={{ textAlign: 'right' }}>
                      {q ? (
                        <RangeBar
                          price={q.price}
                          low={q.week52Low}
                          high={q.week52High}
                        />
                      ) : (
                        <div style={{ width: 60, height: 8, background: '#1e1e1e', borderRadius: 2, display: 'inline-block' }} />
                      )}
                    </td>

                    {/* Remove */}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => removeTicker(sym)}
                        title={`Remove ${sym}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--dim)',
                          cursor: 'pointer',
                          fontFamily: 'var(--font)',
                          fontSize: 14,
                          padding: '0 4px',
                          lineHeight: 1,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--dim)' }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
