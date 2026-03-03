import { useEffect, useState, useCallback } from 'react'

const BASE = '/api'

interface SectorData {
  sector: string
  etf: string
  price: number
  change: number
  changePct: number
  week52High: number
  week52Low: number
}

function tileBackground(changePct: number): string {
  if (changePct > 0.02)  return '#16a34a'
  if (changePct > 0.01)  return '#22c55e80'
  if (changePct >= 0)    return '#14532d'
  if (changePct >= -0.01) return '#450a0a'
  if (changePct >= -0.02) return '#ef444480'
  return '#dc2626'
}

function changeColor(changePct: number): string {
  return changePct >= 0 ? '#22c55e' : '#ef4444'
}

function fmtPct(v: number): string {
  const pct = v * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}

function fmtPrice(v: number): string {
  return `$${v.toFixed(2)}`
}

function fmtChange(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
}

function w52Position(price: number, low: number, high: number): number {
  if (high <= low) return 50
  return Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100))
}

interface TileProps {
  sector: SectorData
  selected: boolean
  onClick: () => void
}

function SectorTile({ sector, selected, onClick }: TileProps) {
  const bg = tileBackground(sector.changePct)
  const pctColor = changeColor(sector.changePct)
  const pos52 = w52Position(sector.price, sector.week52Low, sector.week52High)

  return (
    <div
      onClick={onClick}
      style={{
        background: bg,
        border: selected ? '1px solid #FF6600' : '1px solid #1e1e1e',
        padding: '10px 10px 8px',
        cursor: 'pointer',
        position: 'relative',
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: selected ? '0 0 8px #FF660044' : undefined,
        transition: 'border-color 0.1s',
      }}
    >
      {/* Top row: sector name + ETF */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
        <div style={{
          color: '#e8e8e8',
          fontSize: 11,
          fontWeight: 'bold',
          fontFamily: "'Courier New', monospace",
          lineHeight: 1.3,
        }}>
          {sector.sector}
        </div>
        <div style={{
          color: '#555',
          fontSize: 10,
          fontFamily: "'Courier New', monospace",
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {sector.etf}
        </div>
      </div>

      {/* Center: large change % */}
      <div style={{
        color: pctColor,
        fontSize: 20,
        fontWeight: 'bold',
        fontFamily: "'Courier New', monospace",
        textAlign: 'center',
        padding: '6px 0',
        textShadow: sector.changePct > 0.02 || sector.changePct < -0.02
          ? `0 0 12px ${pctColor}66`
          : undefined,
      }}>
        {fmtPct(sector.changePct)}
      </div>

      {/* Bottom: price + 52W bar */}
      <div>
        <div style={{ color: '#555', fontSize: 10, fontFamily: "'Courier New', monospace", marginBottom: 4 }}>
          {fmtPrice(sector.price)}
        </div>
        {/* 52W range bar */}
        <div style={{ position: 'relative', height: 3, background: '#00000040', borderRadius: 1 }}>
          <div style={{
            position: 'absolute',
            left: `${pos52}%`,
            top: 0,
            width: 3,
            height: '100%',
            background: '#e8e8e8',
            borderRadius: 1,
            transform: 'translateX(-50%)',
          }} />
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${pos52}%`,
            height: '100%',
            background: `${pctColor}60`,
            borderRadius: 1,
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ color: '#33333399', fontSize: 9, fontFamily: "'Courier New', monospace" }}>
            {fmtPrice(sector.week52Low)}
          </span>
          <span style={{ color: '#33333399', fontSize: 9, fontFamily: "'Courier New', monospace" }}>
            {fmtPrice(sector.week52High)}
          </span>
        </div>
      </div>
    </div>
  )
}

function LastUpdated({ ts }: { ts: number }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    function update() {
      const elapsed = Math.floor((Date.now() - ts) / 1000)
      if (elapsed < 5) setLabel('just now')
      else if (elapsed < 60) setLabel(`${elapsed}s ago`)
      else setLabel(`${Math.floor(elapsed / 60)}m ago`)
    }
    update()
    const id = setInterval(update, 5000)
    return () => clearInterval(id)
  }, [ts])

  return <span>{label}</span>
}

export default function HeatmapPanel() {
  const [sectors, setSectors] = useState<SectorData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<keyof SectorData>('changePct')
  const [sortAsc, setSortAsc] = useState(false)

  const fetchData = useCallback(() => {
    setLoading(true)
    fetch(`${BASE}/market/heatmap`)
      .then(r => {
        if (!r.ok) return r.json().then(e => { throw new Error(e.detail || `HTTP ${r.status}`) })
        return r.json()
      })
      .then((d: SectorData[]) => {
        setSectors(d)
        setLastFetch(Date.now())
        setError(null)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  const handleSort = (col: keyof SectorData) => {
    if (sortCol === col) {
      setSortAsc(a => !a)
    } else {
      setSortCol(col)
      setSortAsc(col === 'sector' || col === 'etf')
    }
  }

  const sortedSectors = [...sectors].sort((a, b) => {
    const va = a[sortCol]
    const vb = b[sortCol]
    if (typeof va === 'string' && typeof vb === 'string') {
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    }
    const na = va as number
    const nb = vb as number
    return sortAsc ? na - nb : nb - na
  })

  const selectedSector = selected ? sectors.find(s => s.sector === selected) : null

  // Summary stats
  const advancing = sectors.filter(s => s.changePct > 0).length
  const declining = sectors.filter(s => s.changePct < 0).length
  const unchanged = sectors.filter(s => s.changePct === 0).length
  const spyRow = sectors.find(s => s.etf === 'SPY')

  function ThSortable({ col, children }: { col: keyof SectorData; children: React.ReactNode }) {
    const active = sortCol === col
    return (
      <th
        onClick={() => handleSort(col)}
        style={{
          color: active ? '#FF6600' : '#FF6600',
          textAlign: col === 'sector' || col === 'etf' ? 'left' : 'right',
          padding: '4px 8px',
          fontWeight: 'bold',
          borderBottom: '1px solid #2a2a2a',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          background: active ? '#0d0d0d' : undefined,
        }}
      >
        {children}{active ? (sortAsc ? ' ▲' : ' ▼') : ''}
      </th>
    )
  }

  return (
    <div style={{ fontFamily: "'Courier New', monospace" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ color: '#FF6600', fontWeight: 'bold', fontSize: 13, letterSpacing: '0.5px' }}>
          MARKET SECTOR HEATMAP
        </div>

        {spyRow && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ color: '#555' }}>S&P 500</span>
            <span style={{ color: '#e8e8e8', fontWeight: 'bold' }}>{fmtPrice(spyRow.price)}</span>
            <span style={{ color: changeColor(spyRow.changePct), fontWeight: 'bold' }}>
              {fmtPct(spyRow.changePct)}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, fontSize: 10, marginLeft: 'auto' }}>
          <span style={{ color: '#22c55e' }}>{advancing} ADV</span>
          <span style={{ color: '#ef4444' }}>{declining} DEC</span>
          {unchanged > 0 && <span style={{ color: '#555' }}>{unchanged} UNCH</span>}
        </div>

        <button
          onClick={fetchData}
          style={{
            background: loading ? '#0d0d0d' : '#1a0a00',
            border: '1px solid #FF6600',
            color: '#FF6600',
            fontFamily: "'Courier New', monospace",
            fontSize: 10,
            padding: '3px 10px',
            cursor: loading ? 'default' : 'pointer',
            letterSpacing: '0.5px',
          }}
          disabled={loading}
        >
          {loading ? 'LOADING…' : '⟳ REFRESH'}
        </button>

        {lastFetch && (
          <span style={{ color: '#555', fontSize: 10 }}>
            <LastUpdated ts={lastFetch} />
          </span>
        )}
      </div>

      {error && (
        <div className="error" style={{ marginBottom: 12 }}>
          Error loading heatmap: {error}
        </div>
      )}

      {loading && sectors.length === 0 && (
        <div className="loading">Loading sector data…</div>
      )}

      {sectors.length > 0 && (
        <>
          {/* Heatmap Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 6,
            marginBottom: 20,
          }}>
            {sectors.map(s => (
              <SectorTile
                key={s.sector}
                sector={s}
                selected={selected === s.sector}
                onClick={() => setSelected(selected === s.sector ? null : s.sector)}
              />
            ))}
          </div>

          {/* Selected sector detail panel */}
          {selectedSector && (
            <div style={{
              background: '#080808',
              border: '1px solid #FF6600',
              padding: 12,
              marginBottom: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
            }}>
              <div>
                <div style={{ color: '#FF6600', fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>
                  {selectedSector.sector}
                </div>
                <div style={{ color: '#555', fontSize: 10 }}>ETF: {selectedSector.etf}</div>
              </div>
              {[
                { label: 'Price', value: fmtPrice(selectedSector.price), color: '#e8e8e8' },
                { label: '1D Change', value: fmtChange(selectedSector.change), color: changeColor(selectedSector.changePct) },
                { label: '1D Change %', value: fmtPct(selectedSector.changePct), color: changeColor(selectedSector.changePct) },
                { label: '52W High', value: fmtPrice(selectedSector.week52High), color: '#555' },
                { label: '52W Low', value: fmtPrice(selectedSector.week52Low), color: '#555' },
                {
                  label: '52W Position',
                  value: `${w52Position(selectedSector.price, selectedSector.week52Low, selectedSector.week52High).toFixed(1)}%`,
                  color: '#FFD700',
                },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ color: '#555', fontSize: 10, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ color: item.color, fontSize: 13, fontWeight: 'bold' }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Summary Table */}
          <div>
            <div style={{
              color: '#FF6600',
              fontSize: 11,
              letterSpacing: '1.5px',
              padding: '6px 0 4px',
              borderBottom: '1px solid #cc5200',
              marginBottom: 8,
            }}>
              SECTOR PERFORMANCE SUMMARY
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="bb-table">
                <thead>
                  <tr>
                    <ThSortable col="sector">Sector</ThSortable>
                    <ThSortable col="etf">ETF</ThSortable>
                    <ThSortable col="price">Price</ThSortable>
                    <ThSortable col="change">1D Chg</ThSortable>
                    <ThSortable col="changePct">1D Chg%</ThSortable>
                    <ThSortable col="week52High">52W High</ThSortable>
                    <ThSortable col="week52Low">52W Low</ThSortable>
                    <th style={{
                      color: '#FF6600',
                      textAlign: 'right',
                      padding: '4px 8px',
                      fontWeight: 'bold',
                      borderBottom: '1px solid #2a2a2a',
                      whiteSpace: 'nowrap',
                    }}>
                      52W Pos%
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSectors.map((s, i) => {
                    const pos52 = w52Position(s.price, s.week52Low, s.week52High)
                    const isSelected = s.sector === selected
                    return (
                      <tr
                        key={s.sector}
                        onClick={() => setSelected(selected === s.sector ? null : s.sector)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? '#1a0a00' : i % 2 === 0 ? '#050505' : undefined,
                        }}
                      >
                        <td style={{
                          textAlign: 'left',
                          color: isSelected ? '#FF6600' : '#e8e8e8',
                          fontWeight: isSelected ? 'bold' : 'normal',
                        }}>
                          {s.sector}
                        </td>
                        <td style={{ textAlign: 'left', color: '#555' }}>{s.etf}</td>
                        <td style={{ color: '#e8e8e8', fontWeight: 'bold' }}>{fmtPrice(s.price)}</td>
                        <td className={s.change >= 0 ? 'pos' : 'neg'}>{fmtChange(s.change)}</td>
                        <td style={{ fontWeight: 'bold' }} className={s.changePct >= 0 ? 'pos' : 'neg'}>
                          {fmtPct(s.changePct)}
                        </td>
                        <td style={{ color: '#555' }}>{fmtPrice(s.week52High)}</td>
                        <td style={{ color: '#555' }}>{fmtPrice(s.week52Low)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <div style={{ width: 60, height: 4, background: '#1e1e1e', position: 'relative', borderRadius: 2 }}>
                              <div style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                width: `${pos52}%`,
                                height: '100%',
                                background: changeColor(s.changePct),
                                borderRadius: 2,
                              }} />
                              <div style={{
                                position: 'absolute',
                                left: `${pos52}%`,
                                top: -1,
                                width: 2,
                                height: 6,
                                background: '#e8e8e8',
                                transform: 'translateX(-50%)',
                                borderRadius: 1,
                              }} />
                            </div>
                            <span style={{ color: '#FFD700', minWidth: 36, textAlign: 'right' }}>
                              {pos52.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div style={{ color: '#333', fontSize: 10, marginTop: 10 }}>
            Auto-refreshes every 60s  ■  Click a tile or row to expand details  ■  Click column headers to sort
          </div>
        </>
      )}
    </div>
  )
}
