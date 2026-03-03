import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { OverviewData } from '../../types'

function fmtM(v: number | null): string {
  if (v === null || v === undefined) return '—'
  const m = v / 1e6
  if (Math.abs(m) >= 1000) return `$${(m / 1000).toFixed(2)}B`
  return `$${m.toFixed(1)}M`
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return value ? (
    <div style={{ display: 'flex', gap: 12, padding: '3px 0', fontSize: 12, borderBottom: '1px solid #111' }}>
      <span style={{ color: 'var(--dim)', minWidth: 180 }}>{label}</span>
      <span style={{ color: 'var(--white)' }}>{value}</span>
    </div>
  ) : null
}

export default function OverviewPanel({ ticker }: { ticker: string }) {
  const [data, setData]       = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setData(null); setError(null)
    api.overview(ticker)
      .then(setData).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [ticker])

  if (loading) return <div className="loading">Fetching company data from EDGAR…</div>
  if (error)   return <div className="error">Error: {error}</div>
  if (!data)   return null

  const snap = data.snapshot
  return (
    <div>
      <div style={{ color: 'var(--orange)', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
        {data.name} &nbsp;
        <span style={{ color: 'var(--yellow)', fontSize: 12 }}>[{data.ticker}]</span>
      </div>

      {data.description && (
        <div style={{ color: '#aaa', fontSize: 11, lineHeight: 1.6, marginBottom: 14, maxWidth: 900, fontFamily: 'sans-serif' }}>
          {data.description}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div className="section-title">COMPANY IDENTITY</div>
          <Row label="Legal Name"       value={data.name} />
          <Row label="Ticker"           value={data.ticker} />
          <Row label="CIK"              value={data.cik} />
          <Row label="EIN"              value={data.ein} />
          <Row label="Entity Type"      value={data.entityType} />
          <Row label="SIC Code"         value={data.sic ? `${data.sic}  —  ${data.sicDescription}` : null} />
          <Row label="State of Inc."    value={data.stateOfInc} />
          <Row label="Fiscal Year End"  value={data.fiscalYearEnd} />
          <Row label="Sector"           value={data.sector} />
          <Row label="Industry"         value={data.industry} />
          {data.employees && <Row label="Employees" value={data.employees.toLocaleString()} />}
          {data.website && (
            <div style={{ padding: '3px 0', fontSize: 12, borderBottom: '1px solid #111', display: 'flex', gap: 12 }}>
              <span style={{ color: 'var(--dim)', minWidth: 180 }}>Website</span>
              <a href={data.website} target="_blank" rel="noopener noreferrer">{data.website}</a>
            </div>
          )}
        </div>

        <div>
          <div className="section-title">CONTACT &amp; ADDRESSES</div>
          <Row label="Business Address" value={data.businessAddress} />
          <Row label="Mailing Address"  value={data.mailingAddress} />
          <Row label="Phone"            value={data.phone} />

          <div className="section-title" style={{ marginTop: 16 }}>LATEST ANNUAL SNAPSHOT  <span style={{ color: 'var(--dim)', fontSize: 10 }}>(Most Recent 10-K, USD)</span></div>
          <Row label="Revenue"              value={fmtM(snap.revenue)} />
          <Row label="Net Income"           value={fmtM(snap.netIncome)} />
          <Row label="Total Assets"         value={fmtM(snap.totalAssets)} />
          <Row label="Shareholders' Equity" value={fmtM(snap.equity)} />
          <Row label="EPS (Diluted)"        value={snap.epsDiluted !== null ? `$${snap.epsDiluted?.toFixed(2)}` : null} />
          {snap.sharesOut && <Row label="Shares Outstanding" value={`${(snap.sharesOut / 1e6).toFixed(1)}M`} />}

          <div className="section-title" style={{ marginTop: 16 }}>RECENT FILINGS</div>
          {Object.entries(data.lastFiled).map(([form, date]) => (
            date ? <Row key={form} label={`Last ${form}`} value={date} /> : null
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 10, color: 'var(--dim)' }}>
        ■ Identity &amp; filings: SEC EDGAR   ■ Description, sector, employees: Yahoo Finance
      </div>
    </div>
  )
}
