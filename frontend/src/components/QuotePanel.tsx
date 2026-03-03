import type { Quote } from '../types'

interface Props { quote: Quote | null; loading: boolean }

function fmt(v: number | null, digits = 2, prefix = '') {
  if (v === null || v === undefined) return '—'
  return `${prefix}${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

function fmtLarge(v: number | null): string {
  if (v === null || v === undefined) return '—'
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (Math.abs(v) >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`
  return `$${v.toLocaleString()}`
}

function fmtVol(v: number | null): string {
  if (v === null) return '—'
  if (v >= 1e9)  return `${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3)  return `${(v / 1e3).toFixed(0)}K`
  return `${v}`
}

function Row({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="qp-row">
      <span className="qp-label">{label}</span>
      <span className={`qp-val ${cls}`}>{value}</span>
    </div>
  )
}

export default function QuotePanel({ quote, loading }: Props) {
  if (loading) return <div className="quote-panel"><div className="loading">Loading…</div></div>
  if (!quote)  return <div className="quote-panel" />

  const changePos = (quote.change ?? 0) >= 0
  const changeCls = changePos ? 'pos' : 'neg'
  const changeSign = changePos ? '+' : ''
  const changePctStr = quote.changePct !== null
    ? `${changeSign}${(quote.changePct * 100).toFixed(2)}%` : '—'
  const changeStr = quote.change !== null
    ? `${changeSign}${fmt(quote.change)}` : '—'

  return (
    <div className="quote-panel">
      <div className="qp-ticker">{quote.symbol}</div>
      <div className="qp-name">{quote.name}</div>
      <div className="qp-price">{fmt(quote.price)}</div>
      <div className={`qp-change ${changeCls}`}>
        {changeStr} ({changePctStr})
      </div>

      <div className="qp-section">PRICE</div>
      <Row label="Open"    value={fmt(quote.open)} />
      <Row label="High"    value={fmt(quote.dayHigh)} />
      <Row label="Low"     value={fmt(quote.dayLow)} />
      <Row label="Prev"    value={fmt(quote.prevClose)} />
      <Row label="52W H"   value={fmt(quote.week52High)} />
      <Row label="52W L"   value={quote.week52Low !== null ? fmt(quote.week52Low) : '—'} />

      <div className="qp-section">VOLUME</div>
      <Row label="Vol"     value={fmtVol(quote.volume)} />
      <Row label="Avg Vol" value={fmtVol(quote.avgVolume)} />

      <div className="qp-section">VALUATION</div>
      <Row label="Mkt Cap" value={fmtLarge(quote.marketCap)} />
      <Row label="P/E"     value={fmt(quote.pe)} />
      <Row label="Fwd P/E" value={fmt(quote.forwardPe)} />
      <Row label="P/B"     value={fmt(quote.priceToBook)} />
      <Row label="EPS"     value={fmt(quote.eps)} />
      <Row label="Fwd EPS" value={fmt(quote.forwardEps)} />

      <div className="qp-section">DIVIDENDS</div>
      <Row label="Div"     value={fmt(quote.dividend)} />
      <Row label="Yield"   value={quote.dividendYield !== null ? `${(quote.dividendYield * 100).toFixed(2)}%` : '—'} />
      <Row label="Ex-Div"  value={quote.exDivDate ?? '—'} />
      <Row label="Payout"  value={quote.payoutRatio !== null ? `${(quote.payoutRatio * 100).toFixed(1)}%` : '—'} />

      <div className="qp-section">RISK</div>
      <Row label="Beta"    value={fmt(quote.beta)} />
      <Row label="Short%"  value={quote.shortPct !== null ? `${(quote.shortPct * 100).toFixed(1)}%` : '—'} />
      <Row label="Short R" value={fmt(quote.shortRatio)} />

      <div className="qp-section">ANALYST</div>
      <Row
        label="Rec"
        value={quote.recKey ? quote.recKey.replace(/_/g, ' ').toUpperCase() : '—'}
        cls={quote.recKey?.includes('buy') ? 'pos' : quote.recKey?.includes('sell') ? 'neg' : ''}
      />
      <Row label="# Analysts" value={quote.numAnalysts?.toString() ?? '—'} />
      <Row
        label="Target"
        value={quote.targetMean !== null ? fmt(quote.targetMean, 2, '$') : '—'}
        cls="orange"
      />

      <div className="qp-section">OWNERSHIP</div>
      <Row label="Inst %"  value={quote.pctInstitutions !== null ? `${(quote.pctInstitutions * 100).toFixed(1)}%` : '—'} />
      <Row label="Insider%" value={quote.pctInsiders !== null ? `${(quote.pctInsiders * 100).toFixed(1)}%` : '—'} />

      {quote.sector && (
        <>
          <div className="qp-section">INFO</div>
          <Row label="Sector"  value={quote.sector} />
          {quote.industry && <Row label="Industry" value={quote.industry} />}
          {quote.exchange && <Row label="Exchange" value={quote.exchange} />}
          {quote.employees !== null && (
            <Row label="Employees" value={quote.employees.toLocaleString()} />
          )}
        </>
      )}
    </div>
  )
}
