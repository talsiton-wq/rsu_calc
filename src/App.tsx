import { useState, useEffect } from 'react'
import type { Grant } from './types'
import GrantForm from './components/GrantForm'
import VestingChart from './components/VestingChart'
import VestingTable from './components/VestingTable'
import SaleSimulation from './components/SaleSimulation'
import { getVestingSummary, grantLabel } from './utils/vestingCalculator'
import { fetchGoogleSheetsData } from './utils/stockPrice'

const STORAGE_KEY = 'rsu_grants_v1'

type ActiveTab = 'vesting' | 'simulation'

function loadGrants(): Grant[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export default function App() {
  const [grants, setGrants] = useState<Grant[]>(loadGrants)
  const [activeTab, setActiveTab] = useState<ActiveTab>('vesting')
  const [showForm, setShowForm] = useState(false)
  const [editingGrant, setEditingGrant] = useState<Grant | null>(null)
  const [expandedGrantId, setExpandedGrantId] = useState<string | null>(null)

  // Live prices from Google Sheet
  const [tickerPrices, setTickerPrices] = useState<Record<string, number>>({})
  const [usdRate, setUsdRate] = useState<number>(3.7)
  const [pricesStatus, setPricesStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  const [pricesError, setPricesError] = useState('')

  async function loadPrices() {
    if (pricesStatus === 'loading') return
    setPricesStatus('loading')
    setPricesError('')
    try {
      const { usdRate: rate, prices } = await fetchGoogleSheetsData()
      setUsdRate(rate)
      setTickerPrices(prices)
      setPricesStatus('ok')
    } catch (err: any) {
      setPricesStatus('error')
      setPricesError(err?.message ?? 'שגיאה לא ידועה')
      console.error('[loadPrices]', err)
    }
  }

  // Auto-fetch on mount (with or without saved grants)
  useEffect(() => {
    loadPrices()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(grants))
  }, [grants])

  function handleAddGrant(grant: Grant) {
    setGrants(prev => [...prev, grant])
    setShowForm(false)
    // Refresh prices for any new ticker
    loadPrices()
  }

  function handleUpdateGrant(updated: Grant) {
    setGrants(prev => prev.map(g => g.id === updated.id ? updated : g))
    setEditingGrant(null)
    loadPrices()
  }

  function handleRemoveGrant(id: string) {
    setGrants(prev => prev.filter(g => g.id !== id))
  }

  function handleSold(grantId: string, eventDate: string, sold: number) {
    setGrants(prev => prev.map(g => {
      if (g.id !== grantId) return g
      const soldEvents = { ...(g.soldEvents ?? {}), [eventDate]: sold }
      // If 0, remove the key to keep things clean
      if (sold === 0) delete soldEvents[eventDate]
      return { ...g, soldEvents }
    }))
  }

  const fmtUSD = (n: number) =>
    '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  return (
    <div className="min-h-screen" dir="rtl">
      {/* Header */}
      <header className="bg-gradient-to-l from-blue-700 to-blue-500 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">מחשבון RSU 📈</h1>
            <p className="text-blue-100 text-sm mt-0.5">חישוב הבשלה ומיסוי ישראלי</p>
          </div>
          <div className="text-xs text-blue-200 text-left hidden sm:block">
            {pricesStatus === 'ok' && (
              <p className="text-blue-100 font-medium">שער דולר: ₪{usdRate.toFixed(3)}</p>
            )}
            <p>מדרגות מס 2025</p>
            <p>סעיף 102 לפקודת מס הכנסה</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Grant List */}
        <section className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title mb-0">הענקות RSU שלי</h2>
            <div className="flex items-center gap-2">
              {pricesStatus === 'loading' && (
                <span className="text-xs text-gray-400">⏳ טוען מחירים...</span>
              )}
              {pricesStatus === 'error' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">{pricesError}</span>
                  <button onClick={loadPrices} className="text-xs text-red-500 underline whitespace-nowrap">
                    ❌ שגיאה — נסה שוב
                  </button>
                </div>
              )}
              {pricesStatus === 'ok' && (
                <span className="text-xs text-green-600">✅ מחירים עדכניים</span>
              )}
              <button
                className="btn-primary text-sm"
                onClick={() => { setShowForm(f => !f); setEditingGrant(null) }}
              >
                {showForm ? '▲ סגור' : '+ הוסף הענקה'}
              </button>
            </div>
          </div>

          {/* Add Form */}
          {showForm && !editingGrant && (
            <div className="mb-5 pb-5 border-b border-gray-100">
              <GrantForm onSave={handleAddGrant} />
            </div>
          )}

          {/* Edit Form */}
          {editingGrant && (
            <div className="mb-5 pb-5 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-blue-700">✏️ עריכת הענקה: {grantLabel(editingGrant)}</p>
                <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setEditingGrant(null)}>ביטול</button>
              </div>
              <GrantForm initialValues={editingGrant} onSave={handleUpdateGrant} />
            </div>
          )}

          {/* Grant Cards */}
          {grants.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-4xl mb-3">📋</p>
              <p className="font-medium">אין עדיין הענקות</p>
              <p className="text-sm">לחץ על "הוסף הענקה" כדי להתחיל</p>
            </div>
          ) : (
            <div className="space-y-3">
              {grants.map(grant => {
                const summary = getVestingSummary(grant)
                const isExpanded = expandedGrantId === grant.id
                const today = new Date()
                const twoYears = new Date(grant.grantDate)
                twoYears.setFullYear(twoYears.getFullYear() + 2)
                const isTwoYears = today >= twoYears
                const livePrice = tickerPrices[grant.ticker]

                return (
                  <div
                    key={grant.id}
                    className="border rounded-xl overflow-hidden border-gray-200"
                  >
                    <button
                      className="w-full text-right px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedGrantId(isExpanded ? null : grant.id)}
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-semibold text-gray-800">{grantLabel(grant)}</span>
                        {isTwoYears && <span className="tag-green">✓ עברו שנתיים</span>}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-left hidden sm:block">
                          <p className="text-xs text-gray-500">ביד / הבשיל / סה"כ</p>
                          <p className="text-sm font-semibold text-gray-700">
                            {summary.vestedShares.toLocaleString('he-IL')} / {summary.grossVested.toLocaleString('he-IL')} / {grant.totalShares.toLocaleString('he-IL')}
                          </p>
                          {livePrice && (
                            <p className="text-xs mt-0.5">
                              <span className="text-green-700 font-medium">{fmtUSD(summary.vestedShares * livePrice)} ביד</span>
                              <span className="text-orange-500 mr-1"> / {fmtUSD(summary.unvestedShares * livePrice)} עתידי</span>
                            </p>
                          )}
                        </div>
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className="h-2 bg-green-500 rounded-full transition-all"
                            style={{ width: `${summary.vestedPercent}%` }}
                          />
                        </div>
                        <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 space-y-3">
                        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                          <span>מחיר הענקה: <strong className="text-gray-800">${grant.grantPrice.toLocaleString('he-IL')}</strong></span>
                          <span>מניות: <strong className="text-gray-800">{grant.totalShares.toLocaleString('he-IL')}</strong></span>
                          {livePrice && (
                            <span>מחיר עכשיו: <strong className="text-blue-700">${livePrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong></span>
                          )}
                          <span>משך: <strong className="text-gray-800">{grant.durationMonths} חודשים</strong></span>
                        </div>
                        {livePrice && (
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="bg-green-50 border border-green-100 rounded-lg p-2">
                              <p className="text-green-600">ביד (זמין)</p>
                              <p className="font-bold text-green-700 text-sm">{fmtUSD(summary.vestedShares * livePrice)}</p>
                              <p className="text-green-500 mt-0.5">{summary.vestedShares.toLocaleString('he-IL')} מניות</p>
                              {summary.totalSold > 0 && (
                                <p className="text-red-400 mt-0.5 text-xs">{summary.totalSold.toLocaleString('he-IL')} נמכרו</p>
                              )}
                            </div>
                            <div className="bg-orange-50 border border-orange-100 rounded-lg p-2">
                              <p className="text-orange-600">שווי נותר</p>
                              <p className="font-bold text-orange-700 text-sm">{fmtUSD(summary.unvestedShares * livePrice)}</p>
                              <p className="text-orange-400 mt-0.5">{summary.unvestedShares.toLocaleString('he-IL')} מניות</p>
                            </div>
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-2">
                              <p className="text-blue-600">שווי כולל</p>
                              <p className="font-bold text-blue-700 text-sm">{fmtUSD(grant.totalShares * livePrice)}</p>
                              <p className="text-blue-400 mt-0.5">{grant.totalShares.toLocaleString('he-IL')} מניות</p>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            className="btn-secondary text-xs"
                            onClick={e => { e.stopPropagation(); setEditingGrant(grant); setShowForm(false); setExpandedGrantId(null) }}
                          >
                            ✏️ ערוך
                          </button>
                          <button
                            className="btn-danger text-xs"
                            onClick={e => { e.stopPropagation(); handleRemoveGrant(grant.id) }}
                          >
                            🗑 הסר
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Tabs */}
        {grants.length > 0 && (
          <div className="flex gap-2 border-b border-gray-200">
            <button
              className={`px-5 py-2.5 font-medium text-sm transition-colors border-b-2 -mb-px ${
                activeTab === 'vesting'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('vesting')}
            >
              📅 לוח הבשלה
            </button>
            <button
              className={`px-5 py-2.5 font-medium text-sm transition-colors border-b-2 -mb-px ${
                activeTab === 'simulation'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('simulation')}
            >
              💰 סימולציית מכירה
            </button>
          </div>
        )}

        {/* Vesting Tab */}
        {activeTab === 'vesting' && grants.length > 0 && (
          <div className="space-y-4">
            <section className="card">
              <h2 className="section-title">גרף הבשלה — כל ההענקות</h2>
              <VestingChart grants={grants} tickerPrices={tickerPrices} />
            </section>

            <section className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-title mb-0">לוח הבשלה מפורט</h2>
                {pricesStatus === 'ok' && (
                  <span className="text-xs text-gray-400">
                    {[...new Set(grants.map(g => g.ticker))].map(t =>
                      tickerPrices[t] ? `${t}: $${tickerPrices[t].toLocaleString('en-US', { maximumFractionDigits: 2 })}` : null
                    ).filter(Boolean).join(' | ')}
                  </span>
                )}
              </div>
              <VestingTable grants={grants} tickerPrices={tickerPrices} onSold={handleSold} />
            </section>
          </div>
        )}

        {/* Sale Simulation Tab */}
        {activeTab === 'simulation' && grants.length > 0 && (
          <section className="card">
            <h2 className="section-title">סימולציית מכירה ומיסוי</h2>
            <SaleSimulation
              grants={grants}
              tickerPrices={tickerPrices}
              initialUsdRate={usdRate}
            />
          </section>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 py-6 mt-4">
        <p>מחשבון RSU — לצרכי הערכה בלבד. אין לראות בחישובים ייעוץ מס מקצועי.</p>
        <p className="mt-1">מדרגות מס הכנסה 2025 • ביטוח לאומי 2025 • מס רווח הון 25%</p>
      </footer>
    </div>
  )
}
