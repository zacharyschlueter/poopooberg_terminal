import { useState, useEffect } from 'react'
import type { Tab, Quote } from './types'
import { api } from './api'
import TopBar from './components/TopBar'
import QuotePanel from './components/QuotePanel'
import NavTabs from './components/NavTabs'
import PriceChart from './components/PriceChart'
import OverviewPanel from './components/panels/OverviewPanel'
import FinancialsPanel from './components/panels/FinancialsPanel'
import RatiosPanel from './components/panels/RatiosPanel'
import AnalystPanel from './components/panels/AnalystPanel'
import NewsPanel from './components/panels/NewsPanel'
import FilingsPanel from './components/panels/FilingsPanel'
import EarningsPanel from './components/panels/EarningsPanel'
import DividendsPanel from './components/panels/DividendsPanel'
import OwnershipPanel from './components/panels/OwnershipPanel'
import OptionsPanel from './components/panels/OptionsPanel'
import CagrPanel from './components/panels/CagrPanel'
import DcfPanel from './components/panels/DcfPanel'
import HeatmapPanel from './components/panels/HeatmapPanel'
import WatchlistPanel from './components/panels/WatchlistPanel'

export default function App() {
  const [ticker,       setTicker]       = useState<string>('')
  const [activeTab,    setActiveTab]    = useState<Tab>('CHART')
  const [quote,        setQuote]        = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  // Quote fetch + 30s auto-refresh
  useEffect(() => {
    if (!ticker) { setQuote(null); return }
    let cancelled = false

    const doFetch = () => {
      if (!cancelled) setQuoteLoading(true)
      api.quote(ticker)
        .then(q  => { if (!cancelled) setQuote(q) })
        .catch(() => { if (!cancelled) setQuote(null) })
        .finally(() => { if (!cancelled) setQuoteLoading(false) })
    }

    doFetch()
    const id = setInterval(doFetch, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [ticker])

  const handleTickerLock  = (sym: string) => { setTicker(sym); setActiveTab('CHART') }
  const handleTickerClear = ()             => { setTicker(''); setQuote(null); setActiveTab('CHART') }

  return (
    <div className="app">
      <TopBar
        ticker={ticker}
        activeTab={activeTab}
        onTickerLock={handleTickerLock}
        onTickerClear={handleTickerClear}
        onTabChange={setActiveTab}
      />

      <div className="main-layout">
        {ticker && <QuotePanel quote={quote} loading={quoteLoading} />}

        <div className="content-area">
          <NavTabs active={activeTab} onChange={setActiveTab} />
          <div className="panel-content">
            {/* ── Ticker-independent panels (always available) ── */}
            {activeTab === 'MAP' && <HeatmapPanel />}
            {activeTab === 'WL'  && <WatchlistPanel onLoadTicker={handleTickerLock} />}

            {/* ── Ticker-required panels ── */}
            {activeTab !== 'MAP' && activeTab !== 'WL' && (
              ticker ? (
                <>
                  {activeTab === 'CHART'   && <PriceChart ticker={ticker} />}
                  {activeTab === 'DES'     && <OverviewPanel ticker={ticker} />}
                  {activeTab === 'FA'      && <FinancialsPanel ticker={ticker} stmt="fa" />}
                  {activeTab === 'IS'      && <FinancialsPanel ticker={ticker} stmt="income" />}
                  {activeTab === 'BS'      && <FinancialsPanel ticker={ticker} stmt="balance" />}
                  {activeTab === 'CF'      && <FinancialsPanel ticker={ticker} stmt="cashflow" />}
                  {activeTab === 'RATIOS'  && <RatiosPanel ticker={ticker} />}
                  {activeTab === 'ERN'     && <EarningsPanel ticker={ticker} />}
                  {activeTab === 'DVD'     && <DividendsPanel ticker={ticker} />}
                  {activeTab === 'OWN'     && <OwnershipPanel ticker={ticker} />}
                  {activeTab === 'SFIL'    && <FilingsPanel ticker={ticker} />}
                  {activeTab === 'ANALYST' && <AnalystPanel ticker={ticker} />}
                  {activeTab === 'NEWS'    && <NewsPanel ticker={ticker} />}
                  {activeTab === 'OPTIONS' && <OptionsPanel ticker={ticker} />}
                  {activeTab === 'CAGR'    && <CagrPanel ticker={ticker} />}
                  {activeTab === 'DCF'     && <DcfPanel ticker={ticker} />}
                </>
              ) : (
                <div className="placeholder">
                  <div className="placeholder__logo">💩</div>
                  <div className="placeholder__logo" style={{ fontSize: 32, letterSpacing: 6 }}>POOPOOBERG</div>
                  <div className="placeholder__sub">Professional Financial Terminal  ■  SEC EDGAR + Yahoo Finance</div>
                  <div className="placeholder__sub" style={{ color: '#444' }}>
                    Type a ticker symbol · press SPACE or ENTER to lock it in
                  </div>
                  <div style={{ fontSize: '11px', color: '#333', marginTop: 4 }}>
                    GP · DES · FA · IS · BS · CF · RV · ERN · DVD · OWN · SFIL · ANR · N · OMON · CAGR · DCF
                  </div>
                  <div style={{ fontSize: '11px', color: '#FF6600', marginTop: 8, opacity: 0.5 }}>
                    MAP and WL available without ticker ↑
                  </div>
                  <div style={{ fontSize: '11px', color: '#222', marginTop: 8 }}>
                    AAPL &nbsp;·&nbsp; MSFT &nbsp;·&nbsp; GOOGL &nbsp;·&nbsp; AMZN &nbsp;·&nbsp; NVDA &nbsp;·&nbsp; TSLA
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
