import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import type { Tab, SearchResult } from '../types'

// Bloomberg mnemonics → internal Tab
const TAB_MAP: Record<string, Tab> = {
  GP:   'CHART',
  DES:  'DES',
  FA:   'FA',
  IS:   'IS',
  BS:   'BS',
  CF:   'CF',
  RV:   'RATIOS',
  ERN:  'ERN',
  DVD:  'DVD',
  CAGR: 'CAGR',
  OWN:  'OWN',
  SFIL: 'SFIL',
  ANR:  'ANALYST',
  N:    'NEWS',
  OMON: 'OPTIONS',
  DCF:  'DCF',
  MAP:  'MAP',
  WL:   'WL',
}

const CMD_HINT = 'GP DES FA IS BS CF RV ERN DVD OWN SFIL ANR N OMON CAGR DCF MAP WL'

interface Props {
  ticker:         string
  activeTab:      Tab
  onTickerLock:   (sym: string) => void
  onTickerClear:  () => void
  onTabChange:    (tab: Tab) => void
}

export default function TopBar({ ticker, activeTab, onTickerLock, onTickerClear, onTabChange }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const debounce  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [inputVal,       setInputVal]       = useState('')
  const [clock,          setClock]          = useState('')
  const [suggestions,    setSuggestions]    = useState<SearchResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // ── Clock ───────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: '2-digit',
      year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Always focus input when ticker or active tab changes ────────
  useEffect(() => {
    inputRef.current?.focus()
  }, [ticker, activeTab])

  // ── Refocus after any click (except links and interactive elements) ─
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      // Don't steal focus from links, the input itself, or any focusable form element
      if (
        t.tagName === 'A' ||
        t === inputRef.current ||
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        (t as HTMLElement).isContentEditable
      ) return
      setTimeout(() => inputRef.current?.focus(), 30)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  // ── Close dropdown on outside click ────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Lock ticker helper ──────────────────────────────────────────
  const lockTicker = (sym: string) => {
    const s = sym.trim().toUpperCase()
    if (!s) return
    setInputVal('')
    setSuggestions([])
    setShowSuggestions(false)
    onTickerLock(s)
  }

  // ── onChange — ticker phase only (command phase uses preventDefault) ──
  const handleChange = (val: string) => {
    if (ticker) return        // command phase: input controlled manually
    const upper = val.toUpperCase()
    setInputVal(upper)
    if (debounce.current) clearTimeout(debounce.current)
    if (!upper) { setSuggestions([]); setShowSuggestions(false); return }
    debounce.current = setTimeout(async () => {
      try {
        const res = await api.search(upper)
        setSuggestions(res.slice(0, 8))
        setShowSuggestions(res.length > 0)
      } catch { setSuggestions([]); setShowSuggestions(false) }
    }, 200)
  }

  // ── Main keyboard handler ───────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!ticker) {
      // ── TICKER PHASE ──────────────────────────────────────────────
      if (e.key === 'Escape') {
        e.preventDefault()
        setInputVal(''); setShowSuggestions(false)
        return
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        lockTicker(inputVal)
        return
      }
      // All other keys: natural input via onChange

    } else {
      // ── COMMAND PHASE ─────────────────────────────────────────────
      e.preventDefault()    // take full control — no native input behaviour

      if (e.key === 'Escape') {
        if (inputVal) {
          setInputVal('')   // 1st ESC: clear command buffer, stay in command mode
        } else {
          onTickerClear()   // 2nd ESC (buffer already empty): unlock ticker
        }
        return
      }
      if (e.key === 'Backspace') {
        setInputVal(prev => prev.slice(0, -1))
        return
      }
      if (e.key.length === 1 && /[A-Za-z0-9]/.test(e.key)) {
        const next = (inputVal + e.key).toUpperCase()
        if (TAB_MAP[next]) {
          onTabChange(TAB_MAP[next])
          setInputVal('')           // clear on match, ready for next command
        } else {
          setInputVal(next)
        }
      }
    }
  }

  return (
    <div className="top-bar" ref={wrapRef}>
      <div className="top-bar__logo">💩 POOPOOBERG</div>

      {/* ── Bloomberg command line ───────────────────────────── */}
      <div className="command-line">
        {ticker && <span className="cmd-ticker">{ticker}</span>}
        {ticker && <span className="cmd-sep">&gt;</span>}

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <input
            ref={inputRef}
            className="cmd-input"
            value={inputVal}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => !ticker && suggestions.length > 0 && setShowSuggestions(true)}
            placeholder={ticker ? 'command…' : 'ticker symbol…'}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
          />

          {/* Autocomplete dropdown — ticker phase only */}
          {!ticker && showSuggestions && suggestions.length > 0 && (
            <div className="top-bar__results">
              {suggestions.map(r => (
                <div key={r.cik} className="search-result-item" onMouseDown={() => lockTicker(r.ticker)}>
                  <span className="search-result-item__ticker">{r.ticker}</span>
                  <span className="search-result-item__name">{r.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hint text */}
        <span className="cmd-hint">
          {!ticker
            ? 'SPACE · ENTER to lock'
            : inputVal
              ? null
              : CMD_HINT + ' · ESC to unlock'
          }
        </span>
      </div>

      <span className="top-bar__clock">{clock}</span>
    </div>
  )
}
