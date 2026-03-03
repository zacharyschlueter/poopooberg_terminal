import { useEffect, useState, useCallback } from 'react'

const BASE = '/api'

interface RevenueRow {
  year: string
  revenue: number
  growth: number
}

interface DcfData {
  ticker: string
  name: string
  currentPrice: number | null
  beta: number | null
  sharesOutstanding: number | null
  netDebt: number | null
  historicalRevenue: RevenueRow[]
  avgRevenueGrowth: number | null
  avgEbitMargin: number | null
  avgCapexPct: number | null
  avgDaPct: number | null
  avgTaxRate: number | null
  riskFreeRate: number | null
  costOfDebt: number | null
  debtWeight: number | null
}

interface Assumptions {
  phase1Growth: number
  phase2Growth: number
  terminalGrowth: number
  ebitMargin: number
  taxRate: number
  capexPct: number
  daPct: number
  wcPct: number
  riskFreeRate: number
  erp: number
  beta: number
  costOfDebt: number
  debtWeight: number
  netDebt: number
  sharesMillion: number
  currentPrice: number
}

interface ProjectionRow {
  year: number
  revenue: number
  revenueGrowth: number | null
  ebit: number
  taxes: number
  nopat: number
  da: number
  capex: number
  deltaWC: number
  fcf: number
  discountFactor: number | null
  pvFcf: number | null
}

interface ValuationResult {
  sumPvFcf: number
  terminalValue: number
  pvTerminalValue: number
  enterpriseValue: number
  equityValue: number
  intrinsicPerShare: number
  upside: number
  marginOfSafety: number
  wacc: number
}

function computeWacc(a: Assumptions): number {
  const equityWeight = 1 - a.debtWeight / 100
  const debtWeight = a.debtWeight / 100
  const costOfEquity = a.riskFreeRate / 100 + a.beta * (a.erp / 100)
  const afterTaxDebt = (a.costOfDebt / 100) * (1 - a.taxRate / 100)
  return equityWeight * costOfEquity + debtWeight * afterTaxDebt
}

function buildProjections(a: Assumptions, baseRevenue: number): ProjectionRow[] {
  const rows: ProjectionRow[] = []
  const wacc = computeWacc(a)

  for (let yr = 0; yr <= 10; yr++) {
    let revenue: number
    let revenueGrowth: number | null = null

    if (yr === 0) {
      revenue = baseRevenue
    } else {
      const prevRevenue = rows[yr - 1].revenue
      const growthRate = yr <= 5 ? a.phase1Growth / 100 : a.phase2Growth / 100
      revenue = prevRevenue * (1 + growthRate)
      revenueGrowth = growthRate
    }

    const ebit = revenue * (a.ebitMargin / 100)
    const taxes = ebit * (a.taxRate / 100)
    const nopat = ebit - taxes
    const da = revenue * (a.daPct / 100)
    const capex = revenue * (a.capexPct / 100)

    let deltaWC = 0
    if (yr > 0) {
      const prevRevenue = rows[yr - 1].revenue
      deltaWC = (revenue - prevRevenue) * (a.wcPct / 100)
    }

    const fcf = nopat + da - capex - deltaWC
    const discountFactor = yr === 0 ? null : 1 / Math.pow(1 + wacc, yr)
    const pvFcf = yr === 0 ? null : fcf * (discountFactor as number)

    rows.push({ year: yr, revenue, revenueGrowth, ebit, taxes, nopat, da, capex, deltaWC, fcf, discountFactor, pvFcf })
  }

  return rows
}

function computeValuation(a: Assumptions, projections: ProjectionRow[]): ValuationResult {
  const wacc = computeWacc(a)
  const tg = a.terminalGrowth / 100

  const sumPvFcf = projections.slice(1).reduce((acc, r) => acc + (r.pvFcf ?? 0), 0)

  const fcfYr10 = projections[10].fcf
  const terminalValue = wacc > tg ? (fcfYr10 * (1 + tg)) / (wacc - tg) : 0
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, 10)

  const enterpriseValue = sumPvFcf + pvTerminalValue
  const equityValue = enterpriseValue - a.netDebt
  const shares = a.sharesMillion
  const intrinsicPerShare = shares > 0 ? equityValue / shares : 0
  const upside = a.currentPrice > 0 ? ((intrinsicPerShare - a.currentPrice) / a.currentPrice) * 100 : 0
  const marginOfSafety = intrinsicPerShare > 0 ? ((intrinsicPerShare - a.currentPrice) / intrinsicPerShare) * 100 : 0

  return { sumPvFcf, terminalValue, pvTerminalValue, enterpriseValue, equityValue, intrinsicPerShare, upside, marginOfSafety, wacc }
}

function computeIntrinsicAtWaccTg(a: Assumptions, baseRevenue: number, waccOverride: number, tgOverride: number): number {
  const modified = { ...a }
  const equityWeight = 1 - modified.debtWeight / 100
  const debtWeight = modified.debtWeight / 100
  const afterTaxDebt = (modified.costOfDebt / 100) * (1 - modified.taxRate / 100)

  // Back-calculate a beta that gives the target WACC
  // waccOverride = equityWeight * (rfr + beta * erp) + debtWeight * afterTaxDebt
  // We just pass waccOverride and tgOverride directly to valuation
  const projs = buildProjectionsWithWacc(a, baseRevenue, waccOverride)
  const tg = tgOverride
  const sumPvFcf = projs.slice(1).reduce((acc, r) => {
    const df = 1 / Math.pow(1 + waccOverride, r.year)
    return acc + r.fcf * df
  }, 0)
  const fcfYr10 = projs[10].fcf
  const tv = waccOverride > tg ? (fcfYr10 * (1 + tg)) / (waccOverride - tg) : 0
  const pvTv = tv / Math.pow(1 + waccOverride, 10)
  const ev = sumPvFcf + pvTv
  const eq = ev - a.netDebt
  return a.sharesMillion > 0 ? eq / a.sharesMillion : 0
}

function buildProjectionsWithWacc(a: Assumptions, baseRevenue: number, waccVal: number): ProjectionRow[] {
  const rows: ProjectionRow[] = []
  for (let yr = 0; yr <= 10; yr++) {
    let revenue: number
    let revenueGrowth: number | null = null
    if (yr === 0) {
      revenue = baseRevenue
    } else {
      const prevRevenue = rows[yr - 1].revenue
      const growthRate = yr <= 5 ? a.phase1Growth / 100 : a.phase2Growth / 100
      revenue = prevRevenue * (1 + growthRate)
      revenueGrowth = growthRate
    }
    const ebit = revenue * (a.ebitMargin / 100)
    const taxes = ebit * (a.taxRate / 100)
    const nopat = ebit - taxes
    const da = revenue * (a.daPct / 100)
    const capex = revenue * (a.capexPct / 100)
    let deltaWC = 0
    if (yr > 0) {
      const prevRevenue = rows[yr - 1].revenue
      deltaWC = (revenue - prevRevenue) * (a.wcPct / 100)
    }
    const fcf = nopat + da - capex - deltaWC
    rows.push({ year: yr, revenue, revenueGrowth, ebit, taxes, nopat, da, capex, deltaWC, fcf, discountFactor: null, pvFcf: null })
  }
  return rows
}

function fmtM(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}T`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}B`
  return `${v.toFixed(0)}M`
}

function fmtMFull(v: number): string {
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}M`
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

function fmtPrice(v: number): string {
  return `$${v.toFixed(2)}`
}

function fmtFactor(v: number): string {
  return v.toFixed(4)
}

const inputStyle: React.CSSProperties = {
  background: '#050505',
  border: '1px solid #2a2a2a',
  color: '#e8e8e8',
  fontFamily: "'Courier New', monospace",
  fontSize: 11,
  padding: '2px 6px',
  width: '90px',
  textAlign: 'right',
  outline: 'none',
}

function NumInput({
  label, value, onChange, min, max, step, unit,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  unit?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #111' }}>
      <span style={{ color: '#555', fontSize: 11 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => {
            const parsed = parseFloat(e.target.value)
            if (!isNaN(parsed)) onChange(parsed)
          }}
          style={inputStyle}
          onFocus={e => { e.target.style.borderColor = '#FF6600' }}
          onBlur={e => { e.target.style.borderColor = '#2a2a2a' }}
        />
        {unit && <span style={{ color: '#555', fontSize: 10, minWidth: 16 }}>{unit}</span>}
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: '#FF6600',
      fontSize: 10,
      letterSpacing: '1.5px',
      padding: '8px 0 4px',
      borderBottom: '1px solid #cc5200',
      marginBottom: 4,
      marginTop: 12,
      fontWeight: 'bold',
    }}>
      {children}
    </div>
  )
}

function sensitivityColor(intrinsic: number, currentPrice: number): string {
  if (currentPrice <= 0) return '#1e1e1e'
  const ratio = intrinsic / currentPrice
  if (ratio >= 1.10) return '#166534'
  if (ratio >= 1.00) return '#14532d'
  if (ratio >= 0.90) return '#713f12'
  if (ratio >= 0.80) return '#7c2d12'
  return '#450a0a'
}

function sensitivityTextColor(intrinsic: number, currentPrice: number): string {
  if (currentPrice <= 0) return '#555'
  const ratio = intrinsic / currentPrice
  if (ratio >= 1.10) return '#22c55e'
  if (ratio >= 1.00) return '#86efac'
  if (ratio >= 0.90) return '#FFD700'
  if (ratio >= 0.80) return '#fb923c'
  return '#ef4444'
}

export default function DcfPanel({ ticker }: { ticker: string }) {
  const [data, setData] = useState<DcfData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null)

  useEffect(() => {
    setLoading(true)
    setData(null)
    setError(null)
    setAssumptions(null)

    fetch(`${BASE}/ticker/${ticker}/dcf`)
      .then(r => {
        if (!r.ok) return r.json().then(e => { throw new Error(e.detail || `HTTP ${r.status}`) })
        return r.json()
      })
      .then((d: DcfData) => {
        setData(d)
        const phase1 = d.avgRevenueGrowth != null ? d.avgRevenueGrowth * 100 : 8
        const phase2 = d.avgRevenueGrowth != null ? Math.max(d.avgRevenueGrowth * 50, 2) : 4
        setAssumptions({
          phase1Growth: parseFloat(phase1.toFixed(1)),
          phase2Growth: parseFloat(phase2.toFixed(1)),
          terminalGrowth: 2.5,
          ebitMargin: d.avgEbitMargin != null ? parseFloat((d.avgEbitMargin * 100).toFixed(1)) : 15,
          taxRate: d.avgTaxRate != null ? parseFloat((d.avgTaxRate * 100).toFixed(1)) : 21,
          capexPct: d.avgCapexPct != null ? parseFloat((d.avgCapexPct * 100).toFixed(1)) : 3,
          daPct: d.avgDaPct != null ? parseFloat((d.avgDaPct * 100).toFixed(1)) : 4,
          wcPct: 2.0,
          riskFreeRate: d.riskFreeRate != null ? parseFloat((d.riskFreeRate * 100).toFixed(2)) : 4.3,
          erp: 5.5,
          beta: d.beta != null ? parseFloat(d.beta.toFixed(2)) : 1.0,
          costOfDebt: d.costOfDebt != null ? parseFloat((d.costOfDebt * 100).toFixed(1)) : 3.5,
          debtWeight: d.debtWeight != null ? parseFloat((d.debtWeight * 100).toFixed(0)) : 20,
          netDebt: d.netDebt ?? 0,
          sharesMillion: d.sharesOutstanding != null ? parseFloat((d.sharesOutstanding / 1e6).toFixed(1)) : 1000,
          currentPrice: d.currentPrice ?? 100,
        })
      })
      .catch(e => {
        setError(e.message)
        // Set fallback assumptions so user can still interact
        setAssumptions({
          phase1Growth: 8, phase2Growth: 4, terminalGrowth: 2.5,
          ebitMargin: 15, taxRate: 21, capexPct: 3, daPct: 4, wcPct: 2,
          riskFreeRate: 4.3, erp: 5.5, beta: 1.0, costOfDebt: 3.5, debtWeight: 20,
          netDebt: 0, sharesMillion: 1000, currentPrice: 100,
        })
      })
      .finally(() => setLoading(false))
  }, [ticker])

  const setA = useCallback((key: keyof Assumptions, val: number) => {
    setAssumptions(prev => prev ? { ...prev, [key]: val } : prev)
  }, [])

  const applyScenario = useCallback((scenario: 'bull' | 'base' | 'bear') => {
    if (!assumptions || !data) return
    const phase1Base = data.avgRevenueGrowth != null ? data.avgRevenueGrowth * 100 : 8
    const phase2Base = data.avgRevenueGrowth != null ? Math.max(data.avgRevenueGrowth * 50, 2) : 4
    const ebitBase = data.avgEbitMargin != null ? data.avgEbitMargin * 100 : 15

    if (scenario === 'base') {
      setAssumptions(prev => prev ? {
        ...prev,
        phase1Growth: parseFloat(phase1Base.toFixed(1)),
        phase2Growth: parseFloat(phase2Base.toFixed(1)),
        terminalGrowth: 2.5,
        ebitMargin: parseFloat(ebitBase.toFixed(1)),
      } : prev)
    } else if (scenario === 'bull') {
      setAssumptions(prev => prev ? {
        ...prev,
        phase1Growth: parseFloat((phase1Base + 5).toFixed(1)),
        phase2Growth: parseFloat((phase2Base + 3).toFixed(1)),
        terminalGrowth: 3.0,
        ebitMargin: parseFloat((ebitBase + 3).toFixed(1)),
      } : prev)
    } else {
      setAssumptions(prev => prev ? {
        ...prev,
        phase1Growth: parseFloat((phase1Base - 5).toFixed(1)),
        phase2Growth: parseFloat(Math.max(phase2Base - 2, 0).toFixed(1)),
        terminalGrowth: 1.5,
        ebitMargin: parseFloat(Math.max(ebitBase - 3, 0).toFixed(1)),
      } : prev)
    }
  }, [assumptions, data])

  if (loading && !assumptions) return <div className="loading">Loading DCF data…</div>
  if (!assumptions) return null

  const baseRevenue = data?.historicalRevenue?.length
    ? data.historicalRevenue[data.historicalRevenue.length - 1].revenue
    : 10000

  const wacc = computeWacc(assumptions)
  const projections = buildProjections(assumptions, baseRevenue)
  const valuation = computeValuation(assumptions, projections)

  // Sensitivity table: 5 WACC offsets × 5 TG offsets
  const waccOffsets = [-0.01, -0.005, 0, 0.005, 0.01]
  const tgOffsets = [-0.005, -0.0025, 0, 0.0025, 0.005]

  const sensitivityGrid = waccOffsets.map(wo =>
    tgOffsets.map(tgo => {
      const w = wacc + wo
      const tg = assumptions.terminalGrowth / 100 + tgo
      return computeIntrinsicAtWaccTg(assumptions, baseRevenue, w, tg)
    })
  )

  const isUndervalued = valuation.intrinsicPerShare > assumptions.currentPrice

  return (
    <div style={{ fontFamily: "'Courier New', monospace" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ color: '#FF6600', fontWeight: 'bold', fontSize: 13 }}>
          DCF ANALYSIS — {ticker}
          {data?.name && (
            <span style={{ color: '#555', fontSize: 10, fontWeight: 'normal', marginLeft: 10 }}>
              {data.name}
            </span>
          )}
        </div>
        <div
          style={{
            background: isUndervalued ? '#14532d' : '#450a0a',
            color: isUndervalued ? '#22c55e' : '#ef4444',
            fontSize: 10,
            fontWeight: 'bold',
            padding: '2px 8px',
            letterSpacing: '1px',
          }}
        >
          {isUndervalued ? 'UNDERVALUED' : 'OVERVALUED'}
        </div>
        {error && (
          <div style={{ color: '#ef4444', fontSize: 10, marginLeft: 'auto' }}>
            API error — using manual inputs
          </div>
        )}
      </div>

      {/* Two-column top section */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, marginBottom: 16 }}>

        {/* LEFT: Assumptions */}
        <div style={{ background: '#080808', border: '1px solid #1e1e1e', padding: 12 }}>
          <div style={{ color: '#FF6600', fontWeight: 'bold', fontSize: 11, letterSpacing: '1px', marginBottom: 8 }}>
            ASSUMPTIONS
          </div>

          {/* Scenario buttons */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {(['bull', 'base', 'bear'] as const).map(s => (
              <button
                key={s}
                onClick={() => applyScenario(s)}
                style={{
                  flex: 1,
                  background: s === 'bull' ? '#14532d' : s === 'bear' ? '#450a0a' : '#1a0a00',
                  border: `1px solid ${s === 'bull' ? '#22c55e' : s === 'bear' ? '#ef4444' : '#FF6600'}`,
                  color: s === 'bull' ? '#22c55e' : s === 'bear' ? '#ef4444' : '#FF6600',
                  fontFamily: "'Courier New', monospace",
                  fontSize: 10,
                  fontWeight: 'bold',
                  padding: '3px 0',
                  cursor: 'pointer',
                  letterSpacing: '0.5px',
                }}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>

          <SectionHeader>REVENUE GROWTH</SectionHeader>
          <NumInput label="Phase 1 Growth (Yr 1–5)" value={assumptions.phase1Growth} onChange={v => setA('phase1Growth', v)} min={-50} max={100} step={0.1} unit="%" />
          <NumInput label="Phase 2 Growth (Yr 6–10)" value={assumptions.phase2Growth} onChange={v => setA('phase2Growth', v)} min={-50} max={100} step={0.1} unit="%" />
          <NumInput label="Terminal Growth Rate" value={assumptions.terminalGrowth} onChange={v => setA('terminalGrowth', v)} min={0} max={6} step={0.1} unit="%" />

          <SectionHeader>MARGINS & TAXES</SectionHeader>
          <NumInput label="EBIT Margin" value={assumptions.ebitMargin} onChange={v => setA('ebitMargin', v)} min={0} max={80} step={0.1} unit="%" />
          <NumInput label="Tax Rate" value={assumptions.taxRate} onChange={v => { setA('taxRate', v) }} min={0} max={50} step={0.1} unit="%" />

          <SectionHeader>CASH FLOW ITEMS</SectionHeader>
          <NumInput label="CapEx % of Revenue" value={assumptions.capexPct} onChange={v => setA('capexPct', v)} min={0} max={30} step={0.1} unit="%" />
          <NumInput label="D&A % of Revenue" value={assumptions.daPct} onChange={v => setA('daPct', v)} min={0} max={20} step={0.1} unit="%" />
          <NumInput label="ΔWC % of Rev Δ" value={assumptions.wcPct} onChange={v => setA('wcPct', v)} min={-10} max={20} step={0.1} unit="%" />

          <SectionHeader>WACC COMPONENTS</SectionHeader>
          <NumInput label="Risk-Free Rate" value={assumptions.riskFreeRate} onChange={v => setA('riskFreeRate', v)} min={0} max={10} step={0.05} unit="%" />
          <NumInput label="Equity Risk Premium" value={assumptions.erp} onChange={v => setA('erp', v)} min={2} max={10} step={0.1} unit="%" />
          <NumInput label="Beta" value={assumptions.beta} onChange={v => setA('beta', v)} min={0.1} max={3.0} step={0.05} />
          <NumInput label="Cost of Debt" value={assumptions.costOfDebt} onChange={v => setA('costOfDebt', v)} min={0} max={15} step={0.1} unit="%" />
          <NumInput label="Debt Weight" value={assumptions.debtWeight} onChange={v => setA('debtWeight', v)} min={0} max={60} step={1} unit="%" />

          {/* WACC display */}
          <div style={{
            background: '#0d0d0d',
            border: '1px solid #1e1e1e',
            padding: '6px 10px',
            marginTop: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ color: '#555', fontSize: 11 }}>WACC</span>
            <span style={{ color: '#FF6600', fontWeight: 'bold', fontSize: 14 }}>
              {(wacc * 100).toFixed(2)}%
            </span>
          </div>
          <div style={{ color: '#333', fontSize: 9, marginTop: 4, lineHeight: 1.4 }}>
            = ({(1 - assumptions.debtWeight / 100) * 100 | 0}% × (
            {assumptions.riskFreeRate.toFixed(2)}% + {assumptions.beta}×{assumptions.erp}%)) +
            ({assumptions.debtWeight}% × {assumptions.costOfDebt.toFixed(1)}% × (1-{assumptions.taxRate}%))
          </div>

          <SectionHeader>VALUATION INPUTS</SectionHeader>
          <NumInput label="Net Debt ($M)" value={assumptions.netDebt} onChange={v => setA('netDebt', v)} min={-500000} max={500000} step={1} />
          <NumInput label="Shares Outstanding (M)" value={assumptions.sharesMillion} onChange={v => setA('sharesMillion', v)} min={1} max={1000000} step={0.1} />
          <NumInput label="Current Price ($)" value={assumptions.currentPrice} onChange={v => setA('currentPrice', v)} min={0.01} max={100000} step={0.01} />
        </div>

        {/* RIGHT: Projection Table */}
        <div style={{ overflowX: 'auto', background: '#080808', border: '1px solid #1e1e1e', padding: 12 }}>
          <div style={{ color: '#FF6600', fontWeight: 'bold', fontSize: 11, letterSpacing: '1px', marginBottom: 8 }}>
            10-YEAR PROJECTIONS ($M)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 10, whiteSpace: 'nowrap', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ color: '#FF6600', textAlign: 'left', padding: '4px 10px 4px 0', borderBottom: '1px solid #2a2a2a', position: 'sticky', left: 0, background: '#080808', minWidth: 120 }}>
                    Metric
                  </th>
                  {projections.map(r => (
                    <th key={r.year} style={{
                      color: r.year === 0 ? '#555' : '#FF6600',
                      textAlign: 'right',
                      padding: '4px 8px',
                      borderBottom: '1px solid #2a2a2a',
                      minWidth: 72,
                    }}>
                      {r.year === 0 ? 'BASE' : `Yr ${r.year}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'revenue', label: 'Revenue', fmt: (v: number) => fmtM(v) },
                  { key: 'revenueGrowth', label: 'Rev Growth', fmt: (v: number | null, yr: number) => yr === 0 || v === null ? '—' : fmtPct(v * 100), color: (v: number | null) => v === null ? '#555' : v >= 0 ? '#22c55e' : '#ef4444' },
                  { key: 'ebit', label: 'EBIT', fmt: (v: number) => fmtM(v) },
                  { key: 'taxes', label: 'Taxes', fmt: (v: number) => `(${fmtM(v)})` },
                  { key: 'nopat', label: 'NOPAT', fmt: (v: number) => fmtM(v) },
                  { key: 'da', label: 'D&A', fmt: (v: number) => fmtM(v) },
                  { key: 'capex', label: 'CapEx', fmt: (v: number) => `(${fmtM(v)})` },
                  { key: 'deltaWC', label: 'ΔWorking Capital', fmt: (v: number, yr: number) => yr === 0 ? '—' : fmtM(v) },
                  { key: 'fcf', label: 'Free Cash Flow', fmt: (v: number) => fmtM(v), bold: true, color: (v: number) => v >= 0 ? '#22c55e' : '#ef4444' },
                  { key: 'discountFactor', label: 'Discount Factor', fmt: (v: number | null) => v === null ? '—' : fmtFactor(v) },
                  { key: 'pvFcf', label: 'PV of FCF', fmt: (v: number | null) => v === null ? '—' : fmtM(v), bold: true },
                ].map((row, ri) => {
                  const isBold = (row as any).bold
                  const isGrowthRow = row.key === 'revenueGrowth'
                  const isDiscRow = row.key === 'discountFactor'
                  const isPvRow = row.key === 'pvFcf'
                  const isFcfRow = row.key === 'fcf'

                  return (
                    <tr key={row.key} style={{
                      background: ri % 2 === 0 ? '#050505' : 'transparent',
                      borderTop: isFcfRow || isPvRow ? '1px solid #2a2a2a' : undefined,
                    }}>
                      <td style={{
                        color: isBold ? '#e8e8e8' : '#555',
                        fontWeight: isBold ? 'bold' : 'normal',
                        padding: '3px 10px 3px 0',
                        borderBottom: '1px solid #111',
                        position: 'sticky',
                        left: 0,
                        background: ri % 2 === 0 ? '#050505' : '#080808',
                      }}>
                        {row.label}
                      </td>
                      {projections.map(proj => {
                        const rawVal = (proj as any)[row.key]
                        const formatted = typeof row.fmt === 'function'
                          ? (row.fmt as Function)(rawVal, proj.year)
                          : String(rawVal)
                        const colorFn = (row as any).color
                        const cellColor = colorFn
                          ? colorFn(rawVal)
                          : isBold
                            ? (proj.year === 0 ? '#555' : '#e8e8e8')
                            : (proj.year === 0 ? '#555' : '#888')

                        return (
                          <td key={proj.year} style={{
                            textAlign: 'right',
                            padding: '3px 8px',
                            borderBottom: '1px solid #111',
                            color: cellColor,
                            fontWeight: isBold ? 'bold' : 'normal',
                            fontSize: isFcfRow || isPvRow ? 11 : 10,
                          }}>
                            {formatted}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Historical Revenue section */}
          {data?.historicalRevenue && data.historicalRevenue.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ color: '#555', fontSize: 10, letterSpacing: '1px', marginBottom: 6 }}>
                HISTORICAL REVENUE (Source: SEC EDGAR)
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {data.historicalRevenue.map(r => (
                  <div key={r.year} style={{ textAlign: 'center', minWidth: 60 }}>
                    <div style={{ color: '#555', fontSize: 9 }}>{r.year}</div>
                    <div style={{ color: '#e8e8e8', fontSize: 11, fontWeight: 'bold' }}>{fmtM(r.revenue)}</div>
                    {r.growth != null && (
                      <div style={{ color: r.growth >= 0 ? '#22c55e' : '#ef4444', fontSize: 9 }}>
                        {fmtPct(r.growth * 100)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Valuation Summary + Sensitivity */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>

        {/* LEFT: Valuation Bridge */}
        <div style={{ background: '#080808', border: '1px solid #1e1e1e', padding: 14 }}>
          <div style={{ color: '#FF6600', fontWeight: 'bold', fontSize: 11, letterSpacing: '1px', marginBottom: 10 }}>
            VALUATION SUMMARY
          </div>

          {[
            { label: 'Sum of PV of FCFs', value: fmtMFull(valuation.sumPvFcf), color: '#e8e8e8' },
            { label: 'Terminal Value (PV)', value: fmtMFull(valuation.pvTerminalValue), color: '#e8e8e8' },
            { divider: true },
            { label: 'Enterprise Value', value: fmtMFull(valuation.enterpriseValue), color: '#FFD700', bold: true },
            { label: 'Less: Net Debt', value: `(${fmtMFull(Math.abs(assumptions.netDebt))})`, color: '#ef4444' },
            { divider: true },
            { label: 'Equity Value', value: fmtMFull(valuation.equityValue), color: '#e8e8e8', bold: true },
            { label: 'Shares Outstanding', value: `${assumptions.sharesMillion.toFixed(1)}M`, color: '#555' },
            { divider: true },
          ].map((item, i) => {
            if ((item as any).divider) {
              return <div key={i} style={{ borderTop: '1px solid #2a2a2a', margin: '6px 0' }} />
            }
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
                <span style={{ color: '#555' }}>{item.label}</span>
                <span style={{ color: item.color, fontWeight: (item as any).bold ? 'bold' : 'normal' }}>{item.value}</span>
              </div>
            )
          })}

          {/* Intrinsic Value — large */}
          <div style={{ padding: '10px 0 6px', borderTop: '1px solid #2a2a2a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: '#555', fontSize: 11, letterSpacing: '0.5px' }}>INTRINSIC VALUE / SHARE</span>
              <span style={{ color: '#FF6600', fontSize: 18, fontWeight: 'bold' }}>
                {fmtPrice(valuation.intrinsicPerShare)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
              <span style={{ color: '#555' }}>Current Price</span>
              <span style={{ color: '#e8e8e8' }}>{fmtPrice(assumptions.currentPrice)}</span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: '#555', fontSize: 11 }}>UPSIDE / DOWNSIDE</span>
              <span style={{
                color: valuation.upside >= 0 ? '#22c55e' : '#ef4444',
                fontSize: 18,
                fontWeight: 'bold',
              }}>
                {fmtPct(valuation.upside)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11 }}>
              <span style={{ color: '#555' }}>Margin of Safety</span>
              <span style={{ color: valuation.marginOfSafety >= 0 ? '#22c55e' : '#ef4444' }}>
                {valuation.marginOfSafety.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* TV as % of EV */}
          <div style={{ marginTop: 10, padding: '6px 8px', background: '#0a0a0a', border: '1px solid #1e1e1e', fontSize: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#555' }}>TV as % of EV</span>
              <span style={{ color: valuation.pvTerminalValue / valuation.enterpriseValue > 0.7 ? '#ef4444' : '#555' }}>
                {valuation.enterpriseValue > 0
                  ? `${((valuation.pvTerminalValue / valuation.enterpriseValue) * 100).toFixed(1)}%`
                  : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ color: '#555' }}>WACC</span>
              <span style={{ color: '#FF6600' }}>{(wacc * 100).toFixed(2)}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ color: '#555' }}>Terminal Growth</span>
              <span style={{ color: '#555' }}>{assumptions.terminalGrowth.toFixed(2)}%</span>
            </div>
          </div>
        </div>

        {/* RIGHT: Sensitivity Table */}
        <div style={{ background: '#080808', border: '1px solid #1e1e1e', padding: 14 }}>
          <div style={{ color: '#FF6600', fontWeight: 'bold', fontSize: 11, letterSpacing: '1px', marginBottom: 10 }}>
            SENSITIVITY: INTRINSIC VALUE PER SHARE
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 10, color: '#555' }}>
            <span>Rows: WACC ± 1%</span>
            <span>Cols: Terminal Growth Rate ± 0.5%</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ color: '#FF6600', padding: '4px 10px', textAlign: 'left', borderBottom: '1px solid #2a2a2a', whiteSpace: 'nowrap' }}>
                    WACC \ TGR
                  </th>
                  {tgOffsets.map((tgo, ci) => {
                    const tgVal = (assumptions.terminalGrowth / 100 + tgo) * 100
                    return (
                      <th key={ci} style={{
                        color: tgo === 0 ? '#FF6600' : '#555',
                        padding: '4px 8px',
                        textAlign: 'center',
                        borderBottom: '1px solid #2a2a2a',
                        whiteSpace: 'nowrap',
                        fontWeight: tgo === 0 ? 'bold' : 'normal',
                      }}>
                        {tgVal.toFixed(2)}%
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {waccOffsets.map((wo, ri) => {
                  const waccVal = (wacc + wo) * 100
                  const isBaseRow = wo === 0
                  return (
                    <tr key={ri}>
                      <td style={{
                        color: isBaseRow ? '#FF6600' : '#555',
                        padding: '4px 10px',
                        borderBottom: '1px solid #111',
                        fontWeight: isBaseRow ? 'bold' : 'normal',
                        whiteSpace: 'nowrap',
                      }}>
                        {waccVal.toFixed(2)}%
                      </td>
                      {sensitivityGrid[ri].map((intrinsic, ci) => {
                        const isBaseCell = wo === 0 && tgOffsets[ci] === 0
                        const bg = sensitivityColor(intrinsic, assumptions.currentPrice)
                        const textColor = sensitivityTextColor(intrinsic, assumptions.currentPrice)
                        return (
                          <td key={ci} style={{
                            textAlign: 'center',
                            padding: '5px 8px',
                            borderBottom: '1px solid #111',
                            background: bg,
                            color: textColor,
                            fontWeight: isBaseCell ? 'bold' : 'normal',
                            border: isBaseCell ? '1px solid #FF6600' : undefined,
                            fontSize: isBaseCell ? 12 : 11,
                          }}>
                            {fmtPrice(intrinsic)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
            {[
              { bg: '#166534', color: '#22c55e', label: '>110% of price' },
              { bg: '#14532d', color: '#86efac', label: '100–110%' },
              { bg: '#713f12', color: '#FFD700', label: '90–100%' },
              { bg: '#7c2d12', color: '#fb923c', label: '80–90%' },
              { bg: '#450a0a', color: '#ef4444', label: '<80%' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9 }}>
                <div style={{ width: 10, height: 10, background: l.bg, border: `1px solid ${l.color}` }} />
                <span style={{ color: '#555' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
