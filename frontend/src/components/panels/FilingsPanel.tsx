import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { Filing } from '../../types'

const FORM_FILTERS = [
  { label: 'ALL',     value: '' },
  { label: '10-K',    value: '10-K' },
  { label: '10-Q',    value: '10-Q' },
  { label: '8-K',     value: '8-K' },
  { label: 'DEF 14A', value: 'DEF 14A' },
  { label: 'S-1',     value: 'S-1' },
  { label: 'SC 13G',  value: 'SC 13G' },
  { label: 'SC 13D',  value: 'SC 13D' },
  { label: 'Form 4',  value: '4' },
  { label: '20-F',    value: '20-F' },
]

const FORM_COLOR: Record<string, string> = {
  '10-K':    'var(--orange)',
  '10-Q':    'var(--yellow)',
  '8-K':     '#a855f7',
  'DEF 14A': '#22d3ee',
  'S-1':     '#f97316',
  '4':       'var(--green)',
  'SC 13G':  '#e879f9',
  'SC 13D':  '#e879f9',
  '20-F':    'var(--orange)',
}

export default function FilingsPanel({ ticker }: { ticker: string }) {
  const [filings, setFilings]   = useState<Filing[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [formFilter, setFilter] = useState('')

  useEffect(() => {
    setLoading(true); setFilings([]); setError(null)
    api.filings(ticker, formFilter)
      .then(setFilings)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [ticker, formFilter])

  return (
    <div>
      <div style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13, marginBottom: 10 }}>
        SEC FILINGS — {ticker}
        <span style={{ color: 'var(--dim)', fontSize: 10, fontWeight: 'normal', marginLeft: 12 }}>
          Source: SEC EDGAR
        </span>
      </div>

      {/* Form filter tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
        {FORM_FILTERS.map(f => (
          <button
            key={f.value}
            className={`period-btn ${formFilter === f.value ? 'active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div className="loading">Loading filings from SEC EDGAR…</div>}
      {error   && <div className="error">Error: {error}</div>}

      {!loading && !error && filings.length === 0 && (
        <div className="empty">No filings found</div>
      )}

      {!loading && filings.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="bb-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', width: 80 }}>Form</th>
                <th style={{ textAlign: 'left', width: 90 }}>Date</th>
                <th style={{ textAlign: 'left' }}>Description</th>
                <th style={{ textAlign: 'left', width: 90 }}>Accession</th>
                <th style={{ width: 60 }}>Link</th>
              </tr>
            </thead>
            <tbody>
              {filings.slice(0, 200).map((f, i) => (
                <tr key={i}>
                  <td style={{ color: FORM_COLOR[f.form] || 'var(--white)', fontWeight: 'bold' }}>
                    {f.form}
                  </td>
                  <td style={{ color: 'var(--dim)' }}>{f.date}</td>
                  <td style={{ color: 'var(--white)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.description || '—'}
                  </td>
                  <td style={{ color: 'var(--dim)', fontSize: 10 }}>
                    {f.accession}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--orange)', textDecoration: 'none', fontSize: 11 }}>
                      VIEW
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filings.length > 200 && (
            <div style={{ color: 'var(--dim)', fontSize: 10, marginTop: 6 }}>
              Showing 200 of {filings.length} filings
            </div>
          )}
        </div>
      )}
    </div>
  )
}
