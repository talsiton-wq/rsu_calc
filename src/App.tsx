import { useState } from 'react'
import type { Grant } from './types'
import GrantForm from './components/GrantForm'
import VestingChart from './components/VestingChart'
import VestingTable from './components/VestingTable'
import SaleSimulation from './components/SaleSimulation'
import { getVestingSummary, formatDate, VESTING_TYPE_LABELS } from './utils/vestingCalculator'

type ActiveTab = 'vesting' | 'simulation'

export default function App() {
  const [grants, setGrants] = useState<Grant[]>([])
  const [selectedGrantId, setSelectedGrantId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('vesting')
  const [showForm, setShowForm] = useState(true)
  const [expandedGrantId, setExpandedGrantId] = useState<string | null>(null)

  function handleAddGrant(grant: Grant) {
    setGrants(prev => [...prev, grant])
    setSelectedGrantId(grant.id)
    setExpandedGrantId(grant.id)
    setShowForm(false)
  }

  function handleRemoveGrant(id: string) {
    setGrants(prev => prev.filter(g => g.id !== id))
    if (selectedGrantId === id) {
      setSelectedGrantId(null)
    }
  }

  const selectedGrant = grants.find(g => g.id === selectedGrantId) ?? null

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
            <button
              className="btn-primary text-sm"
              onClick={() => setShowForm(f => !f)}
            >
              {showForm ? '▲ סגור טופס' : '+ הוסף הענקה'}
            </button>
          </div>

          {/* Add Form */}
          {showForm && (
            <div className="mb-5 pb-5 border-b border-gray-100">
              <GrantForm onAdd={handleAddGrant} />
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

                return (
                  <div
                    key={grant.id}
                    className={`border rounded-xl overflow-hidden transition-all ${
                      selectedGrantId === grant.id
                        ? 'border-blue-400 shadow-md'
                        : 'border-gray-200'
                    }`}
                  >
                    <button
                      className="w-full text-right px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      onClick={() => {
                        setSelectedGrantId(grant.id)
                        setExpandedGrantId(isExpanded ? null : grant.id)
                      }}
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-semibold text-gray-800">{grant.name}</span>
                        <span className="text-xs text-gray-500">{formatDate(grant.grantDate)}</span>
                        <span className="tag-blue">{VESTING_TYPE_LABELS[grant.vestingType].split(' ')[0]}</span>
                        {isTwoYears && <span className="tag-green">✓ עברו שנתיים</span>}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-left hidden sm:block">
                          <p className="text-xs text-gray-500">הבשילו / סה"כ</p>
                          <p className="text-sm font-semibold text-gray-700">
                            {summary.vestedShares.toLocaleString('he-IL')} / {grant.totalShares.toLocaleString('he-IL')}
                          </p>
                        </div>
                        {/* Progress bar */}
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
                      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                        <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-3">
                          <span>מחיר הענקה: <strong className="text-gray-800">₪{grant.grantPrice.toLocaleString('he-IL')}</strong></span>
                          <span>מניות: <strong className="text-gray-800">{grant.totalShares.toLocaleString('he-IL')}</strong></span>
                          <span>משך: <strong className="text-gray-800">{grant.durationMonths} חודשים</strong></span>
                          <span>הבשלה: <strong className="text-gray-800">{VESTING_TYPE_LABELS[grant.vestingType]}</strong></span>
                        </div>
                        <button
                          className="btn-danger"
                          onClick={() => handleRemoveGrant(grant.id)}
                        >
                          🗑 הסר הענקה
                        </button>
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
            {/* Grant selector (if multiple) */}
            {grants.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {grants.map(g => (
                  <button
                    key={g.id}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedGrantId === g.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    onClick={() => setSelectedGrantId(g.id)}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}

            {selectedGrant ? (
              <>
                {/* Chart */}
                <section className="card">
                  <h2 className="section-title">גרף הבשלה — {selectedGrant.name}</h2>
                  <VestingChart grant={selectedGrant} />
                </section>

                {/* Table */}
                <section className="card">
                  <h2 className="section-title">לוח הבשלה מפורט</h2>
                  <VestingTable grant={selectedGrant} />
                </section>
              </>
            ) : (
              <div className="card text-center text-gray-400 py-8">
                בחר הענקה למעלה לצפייה בגרף
              </div>
            )}
          </div>
        )}

        {/* Sale Simulation Tab */}
        {activeTab === 'simulation' && grants.length > 0 && (
          <section className="card">
            <h2 className="section-title">סימולציית מכירה ומיסוי</h2>
            <SaleSimulation grants={grants} />
          </section>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 py-6 mt-4">
        <p>מחשבון RSU — לצרכי הערכה בלבד. אין לראות בחישובים ייעוץ מס מקצועי.</p>
        <p className="mt-1">מדרגות מס הכנסה 2025 • ריבית ייסף מעל ₪721,560 • מס רווח הון 25%</p>
      </footer>
    </div>
  )
}
