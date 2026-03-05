import { useState, useMemo } from 'react'
import type { Grant, SaleSimulationInput } from '../types'
import { calculateTaxSummary, TAX_BRACKETS, YISUPH_THRESHOLD, CAPITAL_GAIN_RATE } from '../utils/taxCalculator'
import { getVestingSummary, grantLabel } from '../utils/vestingCalculator'
import { fetchStockPrice } from '../utils/stockPrice'

interface Props {
  grants: Grant[]
}

function fmt(n: number) {
  return n.toLocaleString('he-IL', { maximumFractionDigits: 0 })
}

function fmtCurrency(n: number) {
  return `₪${fmt(Math.round(n))}`
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(0)}%`
}

export default function SaleSimulation({ grants }: Props) {
  const [annualIncome, setAnnualIncome] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [exchangeRate, setExchangeRate] = useState('3.7')
  const [saleInputs, setSaleInputs] = useState<Record<string, string>>({})

  // Ticker fetch state
  const [ticker, setTicker] = useState('')
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [fetchError, setFetchError] = useState('')
  const [fetchedTicker, setFetchedTicker] = useState('')

  // Exchange rate fetch state
  const [rateFetchState, setRateFetchState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const parsedIncome = parseFloat(annualIncome) || 0
  const parsedPrice = parseFloat(currentPrice) || 0
  const parsedRate = parseFloat(exchangeRate) || 3.7
  const parsedPriceILS = parsedPrice * parsedRate

  const inputs: SaleSimulationInput[] = grants.map(g => ({
    grantId: g.id,
    sharesToSell: parseInt(saleInputs[g.id] || '0') || 0,
  }))

  // Convert grant prices from $ to ₪ for tax calculation
  const grantsILS = grants.map(g => ({ ...g, grantPrice: g.grantPrice * parsedRate }))

  const hasAnySale = inputs.some(i => i.sharesToSell > 0)
  const isValid = parsedIncome >= 0 && parsedPrice > 0 && hasAnySale

  const summary = useMemo(() => {
    if (!isValid) return null
    return calculateTaxSummary(grantsILS, inputs, parsedPriceILS, parsedIncome)
  }, [grantsILS, inputs, parsedPriceILS, parsedIncome, isValid])

  // Current marginal bracket for display
  const currentBracket = TAX_BRACKETS.find(b => parsedIncome < b.max)

  async function handleFetchRate() {
    setRateFetchState('loading')
    try {
      const rate = await fetchStockPrice('USDILS=X')
      setExchangeRate(rate.toFixed(3))
      setRateFetchState('success')
    } catch {
      setRateFetchState('error')
    }
  }

  async function handleFetchPrice() {
    if (!ticker.trim()) return
    setFetchState('loading')
    setFetchError('')
    try {
      const price = await fetchStockPrice(ticker)
      setCurrentPrice(String(price))
      setFetchedTicker(ticker.trim().toUpperCase())
      setFetchState('success')
    } catch (err: any) {
      setFetchError(err.message ?? 'שגיאה לא ידועה')
      setFetchState('error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Global Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">שער דולר (₪/$)</label>
          <div className="flex gap-2">
            <input
              type="number"
              className="input"
              placeholder="3.7"
              min="0"
              step="0.001"
              value={exchangeRate}
              onChange={e => { setExchangeRate(e.target.value); setRateFetchState('idle') }}
            />
            <button
              type="button"
              className="btn-primary whitespace-nowrap text-sm"
              onClick={handleFetchRate}
              disabled={rateFetchState === 'loading'}
            >
              {rateFetchState === 'loading' ? '⏳' : '🔄 עדכן'}
            </button>
          </div>
          {rateFetchState === 'success' && (
            <p className="text-xs text-green-600 mt-1">✅ שער עודכן: ₪{parsedRate.toFixed(3)}</p>
          )}
          {rateFetchState === 'error' && (
            <p className="text-xs text-red-500 mt-1">❌ שגיאה בשליפת שער</p>
          )}
          {rateFetchState === 'idle' && parsedRate > 0 && parsedPrice > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              ${parsedPrice.toFixed(2)} = ₪{parsedPriceILS.toFixed(2)}
            </p>
          )}
        </div>

        <div>
          <label className="label">הכנסה שנתית ממוצעת (₪)</label>
          <input
            type="number"
            className="input"
            placeholder="200000"
            min="0"
            value={annualIncome}
            onChange={e => setAnnualIncome(e.target.value)}
          />
          {parsedIncome > 0 && currentBracket && (
            <p className="text-xs text-gray-500 mt-1">
              מדרגת מס שולית: <span className="font-semibold text-gray-700">{fmtPct(currentBracket.rate)}</span>
            </p>
          )}
        </div>

        {/* Stock price + ticker fetch */}
        <div>
          <label className="label">מחיר מניה נוכחי ($)</label>

          {/* Ticker row */}
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              className="input"
              placeholder="טיקר: AAPL, MSFT, GOOG..."
              value={ticker}
              onChange={e => { setTicker(e.target.value); setFetchState('idle') }}
              onKeyDown={e => e.key === 'Enter' && handleFetchPrice()}
            />
            <button
              type="button"
              className="btn-primary whitespace-nowrap text-sm"
              onClick={handleFetchPrice}
              disabled={fetchState === 'loading' || !ticker.trim()}
            >
              {fetchState === 'loading' ? '⏳' : '🔍 שלוף'}
            </button>
          </div>

          {/* Manual price */}
          <input
            type="number"
            className="input"
            placeholder="או הכנס ידנית: 150"
            min="0"
            step="0.01"
            value={currentPrice}
            onChange={e => { setCurrentPrice(e.target.value); setFetchState('idle') }}
          />

          {/* Fetch status */}
          {fetchState === 'success' && (
            <p className="text-xs text-green-600 mt-1">
              ✅ מחיר {fetchedTicker} עודכן: <strong>${parseFloat(currentPrice).toFixed(2)}</strong>
              <span className="text-gray-400 mr-1">(Yahoo Finance)</span>
            </p>
          )}
          {fetchState === 'error' && (
            <p className="text-xs text-red-500 mt-1">❌ {fetchError}</p>
          )}
        </div>
      </div>

      {/* Tax Brackets Reference */}
      <details className="bg-gray-50 rounded-xl border border-gray-200">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-600 select-none">
          📊 מדרגות מס הכנסה ישראל 2025
        </summary>
        <div className="px-4 pb-4">
          <table className="w-full text-xs mt-2">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-right py-1.5 font-semibold text-gray-500">הכנסה שנתית</th>
                <th className="text-left py-1.5 font-semibold text-gray-500">שיעור מס</th>
              </tr>
            </thead>
            <tbody>
              {TAX_BRACKETS.map((b, i) => {
                const isActive = parsedIncome > b.min && parsedIncome <= b.max
                return (
                  <tr
                    key={i}
                    className={`border-b border-gray-100 ${isActive ? 'bg-blue-50 font-semibold' : ''}`}
                  >
                    <td className="py-1.5 text-right text-gray-700">
                      {fmtCurrency(b.min)} – {b.max === Infinity ? '∞' : fmtCurrency(b.max)}
                      {isActive && <span className="tag-blue mr-2">← ההכנסה שלך</span>}
                    </td>
                    <td className="py-1.5 text-left font-medium text-gray-800">{fmtPct(b.rate)}</td>
                  </tr>
                )
              })}
              <tr className="bg-yellow-50">
                <td className="py-1.5 text-right text-gray-700">
                  מעל {fmtCurrency(YISUPH_THRESHOLD)} (ייסף)
                </td>
                <td className="py-1.5 text-left font-medium text-yellow-700">+3%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      {/* Per-Grant Sale Rows */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-700">בחר כמה מניות למכור מכל הענקה</h3>
        {grants.map(grant => {
          const vestSummary = getVestingSummary(grant)
          const today = new Date()
          const grantDate = new Date(grant.grantDate)
          const twoYearsDate = new Date(grantDate)
          twoYearsDate.setFullYear(twoYearsDate.getFullYear() + 2)
          const isTwoYears = today >= twoYearsDate
          const maxSellable = vestSummary.vestedShares
          const bd = summary?.breakdowns.find(b => b.grantId === grant.id)

          return (
            <div key={grant.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
              {/* Grant Header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="font-semibold text-gray-800">{grantLabel(grant)}</h4>
                  <p className="text-xs text-gray-500">
                    מחיר הענקה: ${grant.grantPrice.toFixed(2)} | הבשילו: {fmt(vestSummary.vestedShares)} מניות
                  </p>
                </div>
                <div className="flex gap-2">
                  {isTwoYears ? (
                    <span className="tag-green">עברו שנתיים ✓</span>
                  ) : (
                    <span className="tag-orange">פחות משנתיים</span>
                  )}
                </div>
              </div>

              {/* Two-year status explanation */}
              <div className={`text-xs rounded-lg p-2.5 ${isTwoYears ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                {isTwoYears ? (
                  <>✅ עברו שנתיים — חלק עד מחיר ההענקה (${grant.grantPrice.toFixed(2)}/מניה) ימוסה כהכנסה, הרווח מעל יחוייב ב-{fmtPct(CAPITAL_GAIN_RATE)} רווח הון</>
                ) : (
                  <>⚠️ לא עברו שנתיים — כל התמורה תמוסה כהכנסה רגילה לפי מדרגות המס</>
                )}
              </div>

              {/* Shares input */}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="label">
                    מספר מניות למכירה (מקסימום: {fmt(maxSellable)} שהבשילו)
                  </label>
                  <input
                    type="number"
                    className="input"
                    placeholder="0"
                    min="0"
                    max={maxSellable}
                    value={saleInputs[grant.id] || ''}
                    onChange={e => setSaleInputs(prev => ({ ...prev, [grant.id]: e.target.value }))}
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary text-xs py-2"
                  onClick={() => setSaleInputs(prev => ({ ...prev, [grant.id]: String(maxSellable) }))}
                >
                  מקסימום
                </button>
                <button
                  type="button"
                  className="btn-secondary text-xs py-2"
                  onClick={() => setSaleInputs(prev => ({ ...prev, [grant.id]: '' }))}
                >
                  נקה
                </button>
              </div>

              {/* Tax breakdown for this grant */}
              {bd && bd.sharesToSell > 0 && parsedPrice > 0 && parsedIncome >= 0 && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-sm border border-gray-100">
                  <p className="font-semibold text-gray-700 text-xs uppercase tracking-wide">חישוב מס</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-gray-600">תמורה כוללת:</span>
                    <span className="font-semibold text-gray-800 text-left">{fmtCurrency(bd.saleProceeds)}</span>

                    {bd.isTwoYearsPassed ? (
                      <>
                        <span className="text-gray-600">הכנסה רגילה ({bd.sharesToSell} × ${grant.grantPrice.toFixed(2)}):</span>
                        <span className="text-left">{fmtCurrency(bd.ordinaryIncome)}</span>

                        <span className="text-gray-600">מס הכנסה על הכנסה רגילה:</span>
                        <span className="text-red-600 text-left">{fmtCurrency(bd.ordinaryTax)}</span>

                        {bd.capitalGain > 0 && (
                          <>
                            <span className="text-gray-600">רווח הון ({fmtPct(CAPITAL_GAIN_RATE)}):</span>
                            <span className="text-left">{fmtCurrency(bd.capitalGain)}</span>

                            <span className="text-gray-600">מס רווח הון:</span>
                            <span className="text-red-600 text-left">{fmtCurrency(bd.capitalGainTax)}</span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-gray-600">הכנסה רגילה (כל התמורה):</span>
                        <span className="text-left">{fmtCurrency(bd.ordinaryIncome)}</span>

                        <span className="text-gray-600">מס הכנסה:</span>
                        <span className="text-red-600 text-left">{fmtCurrency(bd.ordinaryTax)}</span>
                      </>
                    )}

                    <span className="font-semibold text-gray-700 border-t border-gray-200 pt-1">סה"כ מס:</span>
                    <span className="font-bold text-red-700 text-left border-t border-gray-200 pt-1">{fmtCurrency(bd.totalTax)}</span>

                    <span className="font-semibold text-gray-700">רווח נקי לאחר מס:</span>
                    <span className="font-bold text-green-700 text-left">{fmtCurrency(bd.netProfit)}</span>

                    <span className="text-gray-500 text-xs">אפקטיבי:</span>
                    <span className="text-gray-500 text-xs text-left">
                      {bd.saleProceeds > 0 ? fmtPct(bd.totalTax / bd.saleProceeds) : '0%'}
                    </span>
                  </div>

                  {bd.yisufhSubjectAmount > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 text-xs text-yellow-800">
                      ⚠️ <strong>שים לב — מס ייסף (3%):</strong> {fmtCurrency(bd.yisufhSubjectAmount)} מהכנסתך עולה מעל
                      סף הייסף ({fmtCurrency(YISUPH_THRESHOLD)}). עליך לשלם 3% נוסף = {fmtCurrency(bd.yisufhSubjectAmount * 0.03)} שקלים.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Total Summary */}
      {summary && hasAnySale && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-blue-800 text-lg">סיכום כולל</h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-3 border border-blue-100">
              <p className="text-xs text-gray-500 mb-1">תמורה כוללת ממכירה</p>
              <p className="text-xl font-bold text-gray-800">{fmtCurrency(summary.totalSaleProceeds)}</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-blue-100">
              <p className="text-xs text-gray-500 mb-1">מס הכנסה רגיל</p>
              <p className="text-xl font-bold text-red-600">{fmtCurrency(summary.totalOrdinaryTax)}</p>
            </div>
            {summary.totalCapitalGainTax > 0 && (
              <div className="bg-white rounded-xl p-3 border border-blue-100">
                <p className="text-xs text-gray-500 mb-1">מס רווח הון (25%)</p>
                <p className="text-xl font-bold text-red-600">{fmtCurrency(summary.totalCapitalGainTax)}</p>
              </div>
            )}
            <div className="bg-white rounded-xl p-3 border border-red-100">
              <p className="text-xs text-gray-500 mb-1">סה"כ מס</p>
              <p className="text-xl font-bold text-red-700">{fmtCurrency(summary.totalTax)}</p>
              <p className="text-xs text-red-400">
                {summary.totalSaleProceeds > 0
                  ? fmtPct(summary.totalTax / summary.totalSaleProceeds) + ' מהתמורה'
                  : ''}
              </p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-green-100">
              <p className="text-xs text-gray-500 mb-1">רווח נקי לאחר מס</p>
              <p className="text-xl font-bold text-green-700">{fmtCurrency(summary.totalNetProfit)}</p>
            </div>
          </div>

          {summary.yisufhNote > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 text-sm text-yellow-900">
              <p className="font-bold mb-1">⚠️ מס ייסף (Surtax) — 3% נוסף</p>
              <p>
                הכנסתך הכוללת לאחר המכירה ({fmtCurrency(summary.finalTaxableIncome)}) עולה מעל
                סף הייסף ({fmtCurrency(YISUPH_THRESHOLD)}) ב-{fmtCurrency(summary.yisufhNote)}.
              </p>
              <p className="mt-1 font-semibold">
                עליך לשלם מס ייסף נוסף של {fmtCurrency(summary.yisufhNote * 0.03)} ₪ (3% × {fmtCurrency(summary.yisufhNote)}).
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                * מס הייסף לא נכלל בחישוב המס הכולל למעלה — יש להוסיפו בנפרד.
              </p>
            </div>
          )}
        </div>
      )}

      {!isValid && grants.length > 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          הזן הכנסה שנתית, מחיר מניה נוכחי ומספר מניות למכירה כדי לראות את חישוב המס
        </p>
      )}
    </div>
  )
}
