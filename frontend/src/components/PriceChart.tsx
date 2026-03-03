import { useEffect, useRef, useState } from 'react'
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi,
} from 'lightweight-charts'
import { api } from '../api'
import type { OHLCVBar } from '../types'

// ── Periods & Intervals ───────────────────────────────────────────────────────

const PERIODS  = ['1d','5d','1mo','3mo','6mo','1y','2y','5y','max'] as const
const INTERVALS = ['auto','1m','5m','15m','30m','1h','1d','1wk','1mo'] as const
type Period   = typeof PERIODS[number]
type Interval = typeof INTERVALS[number]

const PERIOD_LABELS: Record<Period, string> = {
  '1d':'1D', '5d':'5D', '1mo':'1M', '3mo':'3M', '6mo':'6M',
  '1y':'1Y', '2y':'2Y', '5y':'5Y', 'max':'MAX',
}
const INTERVAL_LABELS: Record<Interval, string> = {
  'auto':'AUTO', '1m':'1m', '5m':'5m', '15m':'15m', '30m':'30m',
  '1h':'1H', '1d':'D', '1wk':'W', '1mo':'M',
}

// Default interval when 'auto' is selected
const AUTO_INTERVAL: Record<Period, Interval> = {
  '1d':'5m', '5d':'15m', '1mo':'1d', '3mo':'1d',
  '6mo':'1d', '1y':'1d', '2y':'1wk', '5y':'1wk', 'max':'1mo',
}

// Max days each interval can cover (yfinance limits)
const MAX_DAYS: Record<Interval, number> = {
  'auto':99999, '1m':7, '5m':60, '15m':60, '30m':60,
  '1h':730, '1d':99999, '1wk':99999, '1mo':99999,
}
const PERIOD_DAYS: Record<Period, number> = {
  '1d':1, '5d':5, '1mo':30, '3mo':90, '6mo':180,
  '1y':365, '2y':730, '5y':1825, 'max':99999,
}

const INTRADAY_SET = new Set<Interval>(['1m','5m','15m','30m','1h'])

function effectiveInterval(p: Period, iv: Interval): Interval {
  return iv === 'auto' ? AUTO_INTERVAL[p] : iv
}
function isIntraday(p: Period, iv: Interval): boolean {
  return INTRADAY_SET.has(effectiveInterval(p, iv))
}
function isValidCombo(p: Period, iv: Interval): boolean {
  return PERIOD_DAYS[p] <= MAX_DAYS[iv]
}

// ── Indicator math ────────────────────────────────────────────────────────────

function calcEma(prices: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const out: (number | null)[] = new Array(prices.length).fill(null)
  if (prices.length < period) return out
  let sum = 0
  for (let i = 0; i < period; i++) sum += prices[i]
  out[period - 1] = sum / period
  for (let i = period; i < prices.length; i++) {
    out[i] = prices[i] * k + out[i - 1]! * (1 - k)
  }
  return out
}

function calcSma(prices: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(prices.length).fill(null)
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += prices[j]
    out[i] = sum / period
  }
  return out
}

function calcBB(prices: number[], period = 20, mult = 2) {
  const mid = calcSma(prices, period)
  const upper: (number | null)[] = new Array(prices.length).fill(null)
  const lower: (number | null)[] = new Array(prices.length).fill(null)
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1)
    const mean = mid[i]!
    const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period
    const std = Math.sqrt(variance)
    upper[i] = mean + mult * std
    lower[i] = mean - mult * std
  }
  return { upper, mid, lower }
}

function calcMacd(prices: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEma(prices, fast)
  const emaSlow = calcEma(prices, slow)
  const macdLine: (number | null)[] = prices.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i]! - emaSlow[i]! : null
  )
  const signalLine: (number | null)[] = new Array(prices.length).fill(null)
  const k = 2 / (signal + 1)
  const validIdx = macdLine.reduce<number[]>((acc, v, i) => { if (v != null) acc.push(i); return acc }, [])
  if (validIdx.length >= signal) {
    const seedEnd = validIdx[signal - 1]
    let sum = 0
    for (let i = 0; i < signal; i++) sum += macdLine[validIdx[i]]!
    signalLine[seedEnd] = sum / signal
    for (let i = seedEnd + 1; i < prices.length; i++) {
      if (macdLine[i] != null && signalLine[i - 1] != null)
        signalLine[i] = macdLine[i]! * k + signalLine[i - 1]! * (1 - k)
    }
  }
  const histogram = macdLine.map((v, i) =>
    v != null && signalLine[i] != null ? v - signalLine[i]! : null
  )
  return { macdLine, signalLine, histogram }
}

function calcRsi(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length < period + 1) return result
  const gains: number[] = [], losses: number[] = []
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    gains.push(d > 0 ? d : 0)
    losses.push(d < 0 ? -d : 0)
  }
  let avgGain = gains.reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.reduce((a, b) => a + b, 0) / period
  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const d = closes[i] - closes[i - 1]
      avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period
      avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result[i] = 100 - 100 / (1 + rs)
  }
  return result
}

function toLineData(bars: OHLCVBar[], values: (number | null)[]) {
  return bars
    .map((b, i) => values[i] != null ? { time: b.time as never, value: values[i]! } : null)
    .filter(Boolean) as { time: never; value: number }[]
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { ticker: string }

export default function PriceChart({ ticker }: Props) {
  const mainRef = useRef<HTMLDivElement>(null)
  const volRef  = useRef<HTMLDivElement>(null)
  const macdRef = useRef<HTMLDivElement>(null)
  const rsiRef  = useRef<HTMLDivElement>(null)

  const chartMain = useRef<IChartApi | null>(null)
  const chartVol  = useRef<IChartApi | null>(null)
  const chartMacd = useRef<IChartApi | null>(null)
  const chartRsi  = useRef<IChartApi | null>(null)

  const candleSeries     = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volSeries        = useRef<ISeriesApi<'Histogram'> | null>(null)
  const ema8Series       = useRef<ISeriesApi<'Line'> | null>(null)
  const ema21Series      = useRef<ISeriesApi<'Line'> | null>(null)
  const sma50Series      = useRef<ISeriesApi<'Line'> | null>(null)
  const sma100Series     = useRef<ISeriesApi<'Line'> | null>(null)
  const sma200Series     = useRef<ISeriesApi<'Line'> | null>(null)
  const bbUpperSeries    = useRef<ISeriesApi<'Line'> | null>(null)
  const bbMidSeries      = useRef<ISeriesApi<'Line'> | null>(null)
  const bbLowerSeries    = useRef<ISeriesApi<'Line'> | null>(null)
  const macdLineSeries   = useRef<ISeriesApi<'Line'> | null>(null)
  const macdSignalSeries = useRef<ISeriesApi<'Line'> | null>(null)
  const macdHistSeries   = useRef<ISeriesApi<'Histogram'> | null>(null)
  const rsiSeries        = useRef<ISeriesApi<'Line'> | null>(null)

  const dataRef = useRef<OHLCVBar[]>([])

  const [period,    setPeriod]    = useState<Period>('1y')
  const [candleIv,  setCandleIv]  = useState<Interval>('auto')
  const [loading,   setLoading]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [crossInfo, setCrossInfo] = useState<string | null>(null)

  const [showEma8,   setShowEma8]   = useState(true)
  const [showEma21,  setShowEma21]  = useState(true)
  const [showSma50,  setShowSma50]  = useState(true)
  const [showSma100, setShowSma100] = useState(false)
  const [showSma200, setShowSma200] = useState(false)
  const [showBB,     setShowBB]     = useState(false)
  const [showMacd,   setShowMacd]   = useState(false)
  const [showRsi,    setShowRsi]    = useState(false)

  const intraday    = isIntraday(period, candleIv)
  const refreshRate = intraday ? 30_000 : 60_000

  const CHART_OPTS = {
    layout:     { background: { type: ColorType.Solid, color: '#000' }, textColor: '#FF6600' },
    grid:       { vertLines: { color: '#111' }, horzLines: { color: '#111' } },
    crosshair:  { mode: CrosshairMode.Normal },
    timeScale:  { borderColor: '#222', timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderColor: '#222' },
    handleScroll: true,
    handleScale:  true,
  }

  // ── Period change: reset candleIv if it becomes incompatible ─────────────
  const handlePeriodChange = (p: Period) => {
    setPeriod(p)
    if (!isValidCombo(p, candleIv)) setCandleIv('auto')
  }

  // ── Interval change: only allow valid combos ───────────────────────────────
  const handleIntervalChange = (iv: Interval) => {
    if (isValidCombo(period, iv)) setCandleIv(iv)
  }

  // ── Init main + volume charts (once) ───────────────────────────────────────
  useEffect(() => {
    if (!mainRef.current || !volRef.current) return

    const cm = createChart(mainRef.current, { ...CHART_OPTS, height: 360 })
    chartMain.current = cm

    const cs = cm.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      borderVisible: false,
    })
    candleSeries.current = cs

    ema8Series.current    = cm.addLineSeries({ color: '#00d4ff', lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false })
    ema21Series.current   = cm.addLineSeries({ color: '#FFD700', lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false })
    sma50Series.current   = cm.addLineSeries({ color: '#FF6600', lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false })
    sma100Series.current  = cm.addLineSeries({ color: '#60a5fa', lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false })
    sma200Series.current  = cm.addLineSeries({ color: '#ef4444', lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false })

    bbUpperSeries.current = cm.addLineSeries({ color: 'rgba(34,197,94,0.6)',   lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, crosshairMarkerVisible: false })
    bbMidSeries.current   = cm.addLineSeries({ color: 'rgba(180,180,180,0.4)', lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false })
    bbLowerSeries.current = cm.addLineSeries({ color: 'rgba(239,68,68,0.6)',   lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, crosshairMarkerVisible: false })

    sma100Series.current.applyOptions({ visible: false })
    sma200Series.current.applyOptions({ visible: false })
    bbUpperSeries.current.applyOptions({ visible: false })
    bbMidSeries.current.applyOptions({ visible: false })
    bbLowerSeries.current.applyOptions({ visible: false })

    const cv = createChart(volRef.current, {
      ...CHART_OPTS, height: 80,
      rightPriceScale: { ...CHART_OPTS.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0 } },
    })
    chartVol.current = cv
    volSeries.current = cv.addHistogramSeries({
      color: '#334155', priceFormat: { type: 'volume' }, priceScaleId: 'right',
    })

    cm.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) cv.timeScale().setVisibleLogicalRange(range)
    })
    cv.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) cm.timeScale().setVisibleLogicalRange(range)
    })

    cm.subscribeCrosshairMove(param => {
      if (!param.point || !param.time) { setCrossInfo(null); return }
      const bar = param.seriesData.get(cs) as { open: number; high: number; low: number; close: number } | undefined
      if (bar) {
        const { open, high, low, close } = bar
        const chg = close - open
        const chgPct = chg / open * 100
        const color = chg >= 0 ? '#22c55e' : '#ef4444'
        setCrossInfo(`O ${open.toFixed(2)}  H ${high.toFixed(2)}  L ${low.toFixed(2)}  C ${close.toFixed(2)}  ${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%)  ||color:${color}`)
      }
    })

    const handleResize = () => {
      if (mainRef.current) cm.applyOptions({ width: mainRef.current.clientWidth })
      if (volRef.current)  cv.applyOptions({ width: volRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)

    return () => { window.removeEventListener('resize', handleResize); cm.remove(); cv.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── MACD chart (conditional) ───────────────────────────────────────────────
  useEffect(() => {
    if (!showMacd || !macdRef.current) return

    const cm = createChart(macdRef.current, {
      ...CHART_OPTS, height: 100,
      rightPriceScale: { ...CHART_OPTS.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
    })
    chartMacd.current      = cm
    macdLineSeries.current   = cm.addLineSeries({ color: '#60a5fa', lineWidth: 1, priceLineVisible: false })
    macdSignalSeries.current = cm.addLineSeries({ color: '#FF6600', lineWidth: 1, priceLineVisible: false })
    macdHistSeries.current   = cm.addHistogramSeries({ priceScaleId: 'right' })

    chartMain.current?.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) cm.timeScale().setVisibleLogicalRange(range)
    })

    if (dataRef.current.length > 0) {
      const bars = dataRef.current
      const closes = bars.map(b => b.close)
      const { macdLine, signalLine, histogram } = calcMacd(closes)
      macdLineSeries.current.setData(toLineData(bars, macdLine))
      macdSignalSeries.current.setData(toLineData(bars, signalLine))
      macdHistSeries.current.setData(
        bars.map((b, i) => histogram[i] != null
          ? { time: b.time as never, value: histogram[i]!, color: histogram[i]! >= 0 ? '#16a34a' : '#991b1b' }
          : null
        ).filter(Boolean) as { time: never; value: number; color: string }[]
      )
    }

    const handleResize = () => { if (macdRef.current) cm.applyOptions({ width: macdRef.current.clientWidth }) }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cm.remove()
      chartMacd.current = null; macdLineSeries.current = null
      macdSignalSeries.current = null; macdHistSeries.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMacd])

  // ── RSI chart (conditional) ────────────────────────────────────────────────
  useEffect(() => {
    if (!showRsi || !rsiRef.current) return

    const cr = createChart(rsiRef.current, {
      ...CHART_OPTS, height: 100,
      rightPriceScale: { ...CHART_OPTS.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
    })
    chartRsi.current = cr
    rsiSeries.current = cr.addLineSeries({ color: '#a855f7', lineWidth: 1, priceLineVisible: false })

    chartMain.current?.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) cr.timeScale().setVisibleLogicalRange(range)
    })

    if (dataRef.current.length > 0) {
      const bars = dataRef.current
      rsiSeries.current.setData(toLineData(bars, calcRsi(bars.map(b => b.close))))
    }

    const handleResize = () => { if (rsiRef.current) cr.applyOptions({ width: rsiRef.current.clientWidth }) }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cr.remove()
      chartRsi.current = null; rsiSeries.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRsi])

  // ── Fetch data + auto-refresh ─────────────────────────────────────────────
  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    let firstFetch = true

    const doFetch = () => {
      setLoading(true); setError(null)
      api.history(ticker, period, candleIv)
        .then(bars => {
          if (cancelled) return
          // Sort ascending by time — guard against any server-side ordering gaps
          bars.sort((a, b) => {
            const ta = typeof a.time === 'number' ? a.time : new Date(a.time as string).getTime()
            const tb = typeof b.time === 'number' ? b.time : new Date(b.time as string).getTime()
            return ta - tb
          })
          dataRef.current = bars
          if (!candleSeries.current || !volSeries.current) return

          candleSeries.current.setData(
            bars.map(b => ({ time: b.time as never, open: b.open, high: b.high, low: b.low, close: b.close }))
          )
          volSeries.current.setData(
            bars.map(b => ({ time: b.time as never, value: b.volume, color: b.close >= b.open ? '#1a3a2a' : '#3a1a1a' }))
          )

          const closes = bars.map(b => b.close)
          ema8Series.current?.setData(toLineData(bars, calcEma(closes, 8)))
          ema21Series.current?.setData(toLineData(bars, calcEma(closes, 21)))
          sma50Series.current?.setData(toLineData(bars, calcSma(closes, 50)))
          sma100Series.current?.setData(toLineData(bars, calcSma(closes, 100)))
          sma200Series.current?.setData(toLineData(bars, calcSma(closes, 200)))

          const { upper, mid, lower } = calcBB(closes)
          bbUpperSeries.current?.setData(toLineData(bars, upper))
          bbMidSeries.current?.setData(toLineData(bars, mid))
          bbLowerSeries.current?.setData(toLineData(bars, lower))

          if (macdLineSeries.current && macdSignalSeries.current && macdHistSeries.current) {
            const { macdLine, signalLine, histogram } = calcMacd(closes)
            macdLineSeries.current.setData(toLineData(bars, macdLine))
            macdSignalSeries.current.setData(toLineData(bars, signalLine))
            macdHistSeries.current.setData(
              bars.map((b, i) => histogram[i] != null
                ? { time: b.time as never, value: histogram[i]!, color: histogram[i]! >= 0 ? '#16a34a' : '#991b1b' }
                : null
              ).filter(Boolean) as { time: never; value: number; color: string }[]
            )
          }

          if (rsiSeries.current) {
            rsiSeries.current.setData(toLineData(bars, calcRsi(closes)))
          }

          if (firstFetch) {
            chartMain.current?.timeScale().fitContent()
            chartVol.current?.timeScale().fitContent()
            firstFetch = false
          }
        })
        .catch(e => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }

    doFetch()
    const id = window.setInterval(doFetch, refreshRate)
    return () => { cancelled = true; window.clearInterval(id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, period, candleIv])

  // ── Visibility toggles ────────────────────────────────────────────────────
  useEffect(() => { ema8Series.current?.applyOptions({ visible: showEma8 }) },    [showEma8])
  useEffect(() => { ema21Series.current?.applyOptions({ visible: showEma21 }) },   [showEma21])
  useEffect(() => { sma50Series.current?.applyOptions({ visible: showSma50 }) },   [showSma50])
  useEffect(() => { sma100Series.current?.applyOptions({ visible: showSma100 }) }, [showSma100])
  useEffect(() => { sma200Series.current?.applyOptions({ visible: showSma200 }) }, [showSma200])
  useEffect(() => {
    bbUpperSeries.current?.applyOptions({ visible: showBB })
    bbMidSeries.current?.applyOptions({ visible: showBB })
    bbLowerSeries.current?.applyOptions({ visible: showBB })
  }, [showBB])

  const crossColor = crossInfo?.match(/\|\|color:(.+)/)?.[1]
  const crossText  = crossInfo?.replace(/\|\|color:.+/, '') ?? ''

  const effIvlLabel = candleIv === 'auto'
    ? `AUTO (${INTERVAL_LABELS[AUTO_INTERVAL[period]]})`
    : INTERVAL_LABELS[candleIv]

  return (
    <div>
      {/* ── Period row ── */}
      <div className="chart-controls">
        {PERIODS.map(p => (
          <button key={p} className={`period-btn ${period === p ? 'active' : ''}`}
            onClick={() => handlePeriodChange(p)}>
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* ── Interval row ── */}
      <div className="chart-controls" style={{ marginTop: 0 }}>
        <span style={{ color: 'var(--dim)', fontSize: 10, marginRight: 2, whiteSpace: 'nowrap' }}>CANDLE:</span>
        {INTERVALS.map((iv, idx) => {
          const valid  = isValidCombo(period, iv)
          const active = candleIv === iv
          // Visual divider before 1d
          const divider = idx === 6
          return (
            <span key={iv} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {divider && <div className="chart-divider" />}
              <button
                className={`period-btn ${active ? 'active' : ''}`}
                onClick={() => handleIntervalChange(iv)}
                disabled={!valid}
                title={valid ? `${INTERVAL_LABELS[iv]} candles` : 'Not available for this date range'}
                style={!valid ? { opacity: 0.25, cursor: 'not-allowed' } : {}}
              >
                {INTERVAL_LABELS[iv]}
              </button>
            </span>
          )
        })}
        {intraday && (
          <span style={{ color: '#22c55e', fontSize: 10, marginLeft: 6, whiteSpace: 'nowrap', fontWeight: 'bold' }}>
            ● NEAR-LIVE 30s
          </span>
        )}
        <span style={{ color: '#333', fontSize: 10, marginLeft: 4 }}>
          {effIvlLabel}
        </span>
      </div>

      {/* ── Indicator row ── */}
      <div className="chart-controls" style={{ marginTop: 0 }}>
        <span style={{ color: 'var(--dim)', fontSize: 10, marginRight: 2, whiteSpace: 'nowrap' }}>OVERLAY:</span>
        <label className="ma-toggle"><input type="checkbox" checked={showEma8}   onChange={e => setShowEma8(e.target.checked)}   /><span style={{ color: '#00d4ff' }}>EMA8</span></label>
        <label className="ma-toggle"><input type="checkbox" checked={showEma21}  onChange={e => setShowEma21(e.target.checked)}  /><span style={{ color: '#FFD700' }}>EMA21</span></label>
        <label className="ma-toggle"><input type="checkbox" checked={showSma50}  onChange={e => setShowSma50(e.target.checked)}  /><span style={{ color: '#FF6600' }}>SMA50</span></label>
        <label className="ma-toggle"><input type="checkbox" checked={showSma100} onChange={e => setShowSma100(e.target.checked)} /><span style={{ color: '#60a5fa' }}>SMA100</span></label>
        <label className="ma-toggle"><input type="checkbox" checked={showSma200} onChange={e => setShowSma200(e.target.checked)} /><span style={{ color: '#ef4444' }}>SMA200</span></label>
        <div className="chart-divider" />
        <label className="ma-toggle"><input type="checkbox" checked={showBB}   onChange={e => setShowBB(e.target.checked)}   /><span style={{ color: '#22c55e' }}>BB(20)</span></label>
        <label className="ma-toggle"><input type="checkbox" checked={showMacd} onChange={e => setShowMacd(e.target.checked)} /><span style={{ color: '#60a5fa' }}>MACD</span></label>
        <label className="ma-toggle"><input type="checkbox" checked={showRsi}  onChange={e => setShowRsi(e.target.checked)}  /><span style={{ color: '#a855f7' }}>RSI(14)</span></label>
      </div>

      {/* Crosshair info */}
      <div style={{ height: 16, fontSize: 11, color: crossColor || 'var(--dim)', marginBottom: 4 }}>
        {crossText}
      </div>

      {loading && <div className="loading">Loading chart data…</div>}
      {error   && <div className="error">Error: {error}</div>}

      <div ref={mainRef} style={{ width: '100%' }} />
      <div ref={volRef}  style={{ width: '100%', marginTop: 2 }} />
      {showMacd && <div ref={macdRef} style={{ width: '100%', marginTop: 2 }} />}
      {showRsi  && <div ref={rsiRef}  style={{ width: '100%', marginTop: 2 }} />}

      <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 6 }}>
        Source: Yahoo Finance (yfinance)  ■  Lightweight Charts by TradingView  ■  Indicators calculated client-side
        {intraday
          ? '  ■  Near-live: polling every 30s  ■  Times shown in market local time'
          : '  ■  Auto-refreshes every 60s'}
      </div>
    </div>
  )
}
