import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { NewsItem } from '../../types'

function timeAgo(ts: number | null): string {
  if (!ts) return ''
  const diff = Math.floor((Date.now() / 1000) - ts)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function NewsPanel({ ticker }: { ticker: string }) {
  const [items, setItems]     = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setItems([]); setError(null)
    api.news(ticker).then(setItems).catch(e => setError(e.message)).finally(() => setLoading(false))

    // Auto-refresh every 5 minutes
    const id = setInterval(() => {
      api.news(ticker).then(setItems).catch(() => {})
    }, 5 * 60_000)
    return () => clearInterval(id)
  }, [ticker])

  if (loading) return <div className="loading">Fetching news from Yahoo Finance…</div>
  if (error)   return <div className="error">Error: {error}</div>

  return (
    <div>
      <div style={{ color: 'var(--orange)', fontWeight: 'bold', fontSize: 13, marginBottom: 12 }}>
        NEWS FEED — {ticker}
        <span style={{ color: 'var(--dim)', fontSize: 10, fontWeight: 'normal', marginLeft: 12 }}>
          Source: Yahoo Finance  ■  {items.length} articles
        </span>
      </div>

      {items.length === 0 && !loading && (
        <div className="empty">No news available for {ticker}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="news-item"
          >
            <div className="news-item__meta">
              <span className="news-item__publisher">{item.publisher}</span>
              <span className="news-item__time">{timeAgo(item.publishedAt)}</span>
            </div>
            <div className="news-item__title">{item.title}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
