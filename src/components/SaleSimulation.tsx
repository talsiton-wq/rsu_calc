import { useState, useMemo, useEffect } from 'react'
import type { Grant, SaleSimulationInput } from '../types'
import {
  calculateTaxSummary,
  TAX_BRACKETS,
  BL_BRACKETS,
  YISUPH_THRESHOLD,
  CAPITAL_GAIN_RATE,
  calculateMarginalTax,
  calculateMarginalBL,
} from '../utils/taxCalculator'
import { getVestingSummary, grantLabel } from '../utils/vestingCalculator'

interface Props {
  grants: Grant[]
  tickerPrices?: Record<string, number>
  initialUsdRate?: number
}

function fmt(n: number) {
  return n.toLocaleString('he-IL', { maximumFractionDigits: 0 })
}
function fmtCurrency(n: number) {
  return `₪${fmt(Math.round(n))}`
}
function fmtUSD(n: number, rate: number) {
  if (!rate) return ''
  return ` (~$${Math.round(n / rate).toLocaleString('en-US')})`
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function getBracketDetails(baseIncome: number, additionalIncome: number) {
  const start = baseIncome
  const end = baseIncome + additionalIncome
  return TAX_BRACKETS
    .map(b => {
      const from = Math.max(start, b.min)
      const to = Math.min(end, b.max)
      const inBracket = Math.max(0, to - from)
      return { min: b.min, max: b.max, rate: b.rate, inBracket, tax: inBracket * b.rate }
    })
    .filter(x => x.inBracket > 0)
}

function getBLDetails(baseIncome: number, additionalIncome: number) {
  const start = Math.min(baseIncome, 588_360)
  const end = Math.min(baseIncome + additionalIncome, 588_360)
  return BL_BRACKETS
    .map(b => {
      const from = Math.max(start, b.min)
      const to = Math.min(end, b.max)
      const inBracket = Math.max(0, to - from)
      return { rate: b.rate, inBracket, tax: inBracket * b.rate, label: b.label }
    })
    .filter(x => x.inBracket > 0 && x.rate > 0)
}

export default function SaleSimulation({ grants, tickerPrices = {}, initialUsdRate = 3.7 }: Props) {
  const [annualIncome, setAnnualIncome] = useState('')
  const [exchangeRate, setExchangeRate] = useState(String(initialUsdRate))
  const [saleInputs, setSaleInputs] = useState<Record<string, string>>({})
  // Per-ticker price overrides — user can override the live price per ticker
  const [tickerPriceOverrides, setTickerPriceOverrides] = useState<Record<string, string>>({})

  // Update exchange rate when it arrives from sheet
  useEffect(() => {
    if (initialUsdRate && initialUsdRate !== 3.7) {
      setExchangeRate(initialUsdRate.toFixed(3))
    }
  }, [initialUsdRate])

  // Unique tickers from grants
  const uniqueTickers = [...new Set(grants.map(g => g.ticker).filter(Boolean))]

  const parsedIncome = parseFloat(annualIncome) || 0
  const parsedRate = parseFloat(exchangeRate) || 3.7

  // Effective price per ticker: user override → live price from sheet → 0
  function effectivePriceUSD(ticker: string): number {
    const override = parseFloat(tickerPriceOverrides[ticker])
    if (override > 0) return override
    return tickerPrices[ticker] || 0
  }

  const inputs: SaleSimulationInput[] = grants.map(g => ({
    grantId: g.id,
    sharesToSell: parseInt(saleInputs[g.id] || '0') || 0,
  }))

  const grantsILS = grants.map(g => ({ ...g, grantPrice: g.grantPrice * parsedRate }))

  // Per-grant current price in NIS — each grant uses its own ticker's price
  const grantCurrentPricesNIS = useMemo(() => {
    const map: Record<string, number> = {}
    for (const g of grantsILS) {
      map[g.id] = effectivePriceUSD(g.ticker) * parsedRate
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantsILS, tickerPrices, tickerPriceOverrides, parsedRate])

  const hasAnySale = inputs.some(i => i.sharesToSell > 0)
  const hasAllPrices = grants
    .filter(g => inputs.find(i => i.grantId === g.id && i.sharesToSell > 0))
    .every(g => effectivePriceUSD(g.ticker) > 0)
  const isValid = parsedIncome >= 0 && hasAllPrices && hasAnySale

  const summary = useMemo(() => {
    if (!isValid) return null
    return calculateTaxSummary(grantsILS, inputs, grantCurrentPricesNIS, parsedIncome)
  }, [grantsILS, inputs, grantCurrentPricesNIS, parsedIncome, isValid])

  // Current marginal bracket for display
  const currentBracket = TAX_BRACKETS.find(b => parsedIncome < b.max)
  const currentBLBracket = BL_BRACKETS.find(b => parsedIncome < b.max)

  return (
    <div className="space-y-6">
      {/* Global Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* USD Rate — auto from sheet, no fetch button */}
        <div>
          <label className="label">שער דולר (₪/$)</label>
          <input
            type="number"
            className="input"
            placeholder="3.7"
            min="0"
            step="0.001"
            value={exchangeRate}
            onChange={e => setExchangeRate(e.target.value)}
          />
          {parsedRate > 0 && uniqueTickers.some(t => effectivePriceUSD(t) > 0) && (
            <p className="text-xs text-gray-500 mt-1">
              {uniqueTickers.filter(t => effectivePriceUSD(t) > 0).map(t =>
                `${t}: $${effectivePriceUSD(t).toFixed(2)} = ₪${(effectivePriceUSD(t) * parsedRate).toFixed(2)}`
              ).join(' | ')}
            </p>
          )}
        </div>

        {/* Annual income */}
        <div>
          <label className="label">הכנסה שנתית (₪)</label>
          <input
            type="number"
            className="input"
            placeholder="200000"
            min="0"
            value={annualIncome}
            onChange={e => setAnnualIncome(e.target.value)}
          />
          {parsedIncome > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              מ"ה שולי: <span className="font-semibold text-gray-700">{currentBracket ? fmtPct(currentBracket.rate) : '—'}</span>
              <span className="mr-2">ב"ל שולי: <span className="font-semibold text-gray-700">{currentBLBracket ? fmtPct(currentBLBracket.rate) : '—'}</span></span>
            </p>
          )}
        </div>

        {/* Per-ticker prices — auto from sheet, optional override */}
        <div>
          <label className="label">מחיר מניה ($) — לפי טיקר</label>
          <div className="space-y-2">
            {uniqueTickers.map(t => {
              const livePrice = tickerPrices[t]
              const override = tickerPriceOverrides[t] || ''
              return (
                <div key={t} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-600 w-14 shrink-0">{t}</span>
                  <input
                    type="number"
                    className="input py-1.5 text-sm"
                    placeholder={livePrice ? `${livePrice.toFixed(2)}` : '0'}
                    min="0"
                    step="0.01"
                    value={override}
                    onChange={e => setTickerPriceOverrides(prev => ({ ...prev, [t]: e.target.value }))}
                  />
                  {livePrice && !override && (
                    <span className="text-xs text-green-600 shrink-0">✓ ${livePrice.toFixed(2)}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tax brackets reference */}
      <details className="bg-gray-50 rounded-xl border border-gray-200">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-600 select-none">
          📊 מדרגות מס — פרטים והסבר
        </summary>
        <div className="px-4 pb-4 space-y-4">

          {/* Income Tax Brackets */}
          <div>
            <p className="text-xs font-bold text-gray-700 mt-3 mb-1">מס הכנסה 2025</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-right py-1 font-semibold text-gray-500">הכנסה שנתית</th>
                  <th className="text-left py-1 font-semibold text-gray-500">שיעור</th>
                  {parsedIncome > 0 && <th className="text-left py-1 font-semibold text-gray-500">מצבך</th>}
                </tr>
              </thead>
              <tbody>
                {TAX_BRACKETS.map((b, i) => {
                  const isActive = parsedIncome > b.min && parsedIncome <= b.max
                  return (
                    <tr key={i} className={`border-b border-gray-100 ${isActive ? 'bg-blue-50 font-semibold' : ''}`}>
                      <td className="py-1 text-right text-gray-700">
                        {fmtCurrency(b.min)} – {b.max === Infinity ? '∞' : fmtCurrency(b.max)}
                      </td>
                      <td className="py-1 text-left font-medium text-gray-800">{fmtPct(b.rate)}</td>
                      {parsedIncome > 0 && (
                        <td className="py-1 text-left">
                          {isActive && <span className="tag-blue">← שכרך כאן</span>}
                        </td>
                      )}
                    </tr>
                  )
                })}
                <tr className="bg-yellow-50">
                  <td className="py-1 text-right text-gray-700">מעל {fmtCurrency(YISUPH_THRESHOLD)} (ייסף)</td>
                  <td className="py-1 text-left font-medium text-yellow-700">+3%</td>
                  {parsedIncome > 0 && <td />}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Bituach Leumi Brackets */}
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1">ביטוח לאומי + בריאות 2025 (עובד שכיר)</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-right py-1 font-semibold text-gray-500">הכנסה שנתית</th>
                  <th className="text-left py-1 font-semibold text-gray-500">שיעור</th>
                  <th className="text-left py-1 font-semibold text-gray-500">פירוט</th>
                </tr>
              </thead>
              <tbody>
                {BL_BRACKETS.map((b, i) => {
                  const isActive = parsedIncome > b.min && parsedIncome <= b.max
                  return (
                    <tr key={i} className={`border-b border-gray-100 ${isActive ? 'bg-blue-50 font-semibold' : ''}`}>
                      <td className="py-1 text-right text-gray-700">
                        {fmtCurrency(b.min)} – {b.max === Infinity ? '∞' : fmtCurrency(b.max)}
                      </td>
                      <td className="py-1 text-left font-medium text-gray-800">{fmtPct(b.rate)}</td>
                      <td className="py-1 text-left text-gray-500">{b.label}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* How tax is calculated */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 space-y-1">
            <p className="font-bold">💡 איך מחשבים את המס?</p>
            <p>המס מחושב <strong>מרגינלית</strong> — כל שקל הכנסה ממוסה לפי המדרגה שהוא נופל בה.</p>
            <p>אם המכירה <strong>חוצה מדרגה</strong>, החלק שמתחת לסף ימוסה בשיעור הנמוך, החלק מעל — בשיעור הגבוה.</p>
            <p><strong>פחות משנתיים:</strong> כל תמורת המכירה = הכנסת עבודה → מוסה לפי מדרגות מ"ה.</p>
            <p><strong>מעל שנתיים (102 נאמן):</strong> עד מחיר ההענקה = הכנסה, מעליו = רווח הון (25%).</p>
            <p><strong>ביטוח לאומי</strong> חל רק על חלק ה"הכנסה" (לא על רווח הון), עד תקרה שנתית של ₪588,360.</p>
          </div>

          {/* Live example */}
          {parsedIncome > 0 && grants.length > 0 && effectivePriceUSD(grants[0]?.ticker) > 0 && !hasAnySale && (
            <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-700">
              <p className="font-semibold mb-1">דוגמה: מכירת 100 מניות</p>
              {(() => {
                const exampleGrant = grants[0]
                if (!exampleGrant) return null
                const proceeds = 100 * effectivePriceUSD(exampleGrant.ticker) * parsedRate
                const tax = calculateMarginalTax(parsedIncome, proceeds)
                const bl = calculateMarginalBL(parsedIncome, proceeds)
                return (
                  <div className="space-y-0.5">
                    <p>תמורה: {fmtCurrency(proceeds)}</p>
                    <p>מ"ה שולי: {fmtCurrency(tax)} ({fmtPct(tax / proceeds)})</p>
                    <p>ב"ל שולי: {fmtCurrency(bl)} ({fmtPct(bl / proceeds)})</p>
                    <p className="font-semibold">נטו משוער: {fmtCurrency(proceeds - tax - bl)}</p>
                  </div>
                )
              })()}
            </div>
          )}
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
          const livePrice = tickerPrices[grant.ticker]

          return (
            <div key={grant.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
              {/* Grant Header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="font-semibold text-gray-800">{grantLabel(grant)}</h4>
                  {livePrice && vestSummary.vestedShares > 0 && (
                    <p className="text-2xl font-bold text-blue-700 leading-tight">
                      ${(vestSummary.vestedShares * livePrice).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className="font-medium">{fmt(vestSummary.grossVested)} הבשילו</span>
                    {vestSummary.totalSold > 0 && (
                      <> · <span className="text-red-500">{fmt(vestSummary.totalSold)} נמכרו</span>
                      · <span className="font-semibold text-green-700">{fmt(vestSummary.vestedShares)} זמין</span></>
                    )}
                    {' | '}מחיר הענקה: ${grant.grantPrice.toFixed(2)}
                    {livePrice && <> | עכשיו: <strong className="text-blue-600">${livePrice.toFixed(2)}</strong></>}
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
                  effectivePriceUSD(grant.ticker) < grant.grantPrice ? (
                    <>✅ עברו שנתיים — מחיר מכירה (${effectivePriceUSD(grant.ticker).toFixed(2)}) נמוך ממחיר הענקה (${grant.grantPrice.toFixed(2)}) — כל התמורה = הכנסת עבודה</>
                  ) : (
                    <>✅ עברו שנתיים — עד ${grant.grantPrice.toFixed(2)}/מניה = הכנסה | מעל = רווח הון {fmtPct(CAPITAL_GAIN_RATE)}</>
                  )
                ) : (
                  <>⚠️ לא עברו שנתיים — כל התמורה תמוסה כהכנסה רגילה לפי מדרגות המס</>
                )}
              </div>

              {/* Shares input */}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="label">
                    מניות למכירה (זמין: {maxSellable.toLocaleString('he-IL')})
                  </label>
                  <input
                    type="number"
                    className="input"
                    placeholder="0"
                    min="0"
                    max={maxSellable}
                    value={saleInputs[grant.id] || ''}
                    onChange={e => {
                      const v = parseInt(e.target.value) || 0
                      const clamped = Math.min(Math.max(v, 0), maxSellable)
                      setSaleInputs(prev => ({ ...prev, [grant.id]: clamped === 0 ? '' : String(clamped) }))
                    }}
                  />
                </div>
                <button type="button" className="btn-secondary text-xs py-2"
                  onClick={() => setSaleInputs(prev => ({ ...prev, [grant.id]: String(maxSellable) }))}>
                  מקסימום
                </button>
                <button type="button" className="btn-secondary text-xs py-2"
                  onClick={() => setSaleInputs(prev => ({ ...prev, [grant.id]: '' }))}>
                  נקה
                </button>
              </div>

              {/* Tax breakdown for this grant */}
              {bd && bd.sharesToSell > 0 && effectivePriceUSD(grant.ticker) > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-sm border border-gray-100">
                  <p className="font-semibold text-gray-700 text-xs uppercase tracking-wide">חישוב מס — הענקה זו</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-gray-600">תמורה כוללת:</span>
                    <span className="font-semibold text-gray-800 text-left">
                      {fmtCurrency(bd.saleProceeds)}<span className="text-xs text-gray-400">{fmtUSD(bd.saleProceeds, parsedRate)}</span>
                    </span>

                    {bd.isTwoYearsPassed ? (
                      <>
                        <span className="text-gray-600">הכנסת עבודה ({bd.sharesToSell} × ${Math.min(effectivePriceUSD(grant.ticker), grant.grantPrice).toFixed(2)}):</span>
                        <span className="text-left">
                          {fmtCurrency(bd.ordinaryIncome)}<span className="text-xs text-gray-400">{fmtUSD(bd.ordinaryIncome, parsedRate)}</span>
                        </span>

                        <span className="text-gray-600">מס הכנסה על הכנסה:</span>
                        <span className="text-red-600 text-left">
                          {fmtCurrency(bd.ordinaryTax)}<span className="text-xs text-red-300">{fmtUSD(bd.ordinaryTax, parsedRate)}</span>
                        </span>

                        <span className="text-gray-600">ביטוח לאומי + בריאות:</span>
                        <span className="text-red-600 text-left">
                          {fmtCurrency(bd.bituachLeumi)}<span className="text-xs text-red-300">{fmtUSD(bd.bituachLeumi, parsedRate)}</span>
                        </span>

                        {bd.capitalGain > 0 && (
                          <>
                            <span className="text-gray-600">
                              רווח הון ({fmtPct(CAPITAL_GAIN_RATE)}):
                              <span className="text-xs text-gray-400 block">
                                {bd.sharesToSell} × (${effectivePriceUSD(grant.ticker).toFixed(2)} − ${grant.grantPrice.toFixed(2)}) × ₪{parsedRate.toFixed(3)}
                              </span>
                            </span>
                            <span className="text-left">
                              {fmtCurrency(bd.capitalGain)}<span className="text-xs text-gray-400">{fmtUSD(bd.capitalGain, parsedRate)}</span>
                            </span>
                            <span className="text-gray-600">מס רווח הון:</span>
                            <span className="text-red-600 text-left">
                              {fmtCurrency(bd.capitalGainTax)}<span className="text-xs text-red-300">{fmtUSD(bd.capitalGainTax, parsedRate)}</span>
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-gray-600">
                          הכנסה רגילה ({bd.sharesToSell} × ${effectivePriceUSD(grant.ticker).toFixed(2)}):
                        </span>
                        <span className="text-left">
                          {fmtCurrency(bd.ordinaryIncome)}<span className="text-xs text-gray-400">{fmtUSD(bd.ordinaryIncome, parsedRate)}</span>
                        </span>
                        <span className="text-gray-600">מס הכנסה:</span>
                        <span className="text-red-600 text-left">
                          {fmtCurrency(bd.ordinaryTax)}<span className="text-xs text-red-300">{fmtUSD(bd.ordinaryTax, parsedRate)}</span>
                        </span>
                        <span className="text-gray-600">ביטוח לאומי + בריאות:</span>
                        <span className="text-red-600 text-left">
                          {fmtCurrency(bd.bituachLeumi)}<span className="text-xs text-red-300">{fmtUSD(bd.bituachLeumi, parsedRate)}</span>
                        </span>
                      </>
                    )}

                    {bd.yisufhTax > 0 && (
                      <>
                        <span className="text-gray-600">
                          מס ייסף (3%):
                          <span className="text-xs text-gray-400 block">
                            {fmtCurrency(bd.yisufhSubjectAmount)} מעל סף {fmtCurrency(YISUPH_THRESHOLD)}
                          </span>
                        </span>
                        <span className="text-red-600 text-left">
                          {fmtCurrency(bd.yisufhTax)}<span className="text-xs text-red-300">{fmtUSD(bd.yisufhTax, parsedRate)}</span>
                        </span>
                      </>
                    )}

                    <span className="font-semibold text-gray-700 border-t border-gray-200 pt-1">סה"כ מס + ב"ל:</span>
                    <span className="font-bold text-red-700 text-left border-t border-gray-200 pt-1">
                      {fmtCurrency(bd.totalTax + bd.bituachLeumi)}<span className="text-xs text-red-300 font-normal">{fmtUSD(bd.totalTax + bd.bituachLeumi, parsedRate)}</span>
                    </span>

                    <span className="font-semibold text-gray-700">שיעור אפקטיבי:</span>
                    <span className="font-medium text-gray-600 text-left">
                      {bd.saleProceeds > 0 ? fmtPct((bd.totalTax + bd.bituachLeumi) / bd.saleProceeds) : '0%'}
                    </span>

                    <span className="font-semibold text-gray-700">רווח נקי:</span>
                    <span className="font-bold text-green-700 text-left">
                      {fmtCurrency(bd.netProfit)}<span className="text-xs text-green-500 font-normal">{fmtUSD(bd.netProfit, parsedRate)}</span>
                    </span>
                  </div>

                  {/* Bracket breakdown toggle */}
                  <details className="mt-2">
                    <summary className="text-xs text-blue-600 cursor-pointer select-none hover:text-blue-800">
                      🔍 פרטי חישוב לפי מדרגות
                    </summary>
                    <div className="mt-2 space-y-3 text-xs">
                      {/* Income tax brackets */}
                      <div>
                        <p className="font-semibold text-gray-700 mb-1">מס הכנסה — לפי מדרגות</p>
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-gray-200 text-gray-500">
                              <th className="text-right py-1 pr-1">מדרגה</th>
                              <th className="text-left py-1">הכנסה במדרגה</th>
                              <th className="text-left py-1">שיעור</th>
                              <th className="text-left py-1">מס</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getBracketDetails(bd.isTwoYearsPassed ? parsedIncome : parsedIncome, bd.ordinaryIncome).map((row, i) => (
                              <tr key={i} className="border-b border-gray-100">
                                <td className="py-1 text-right text-gray-500 pr-1">
                                  {fmtCurrency(row.min)}–{row.max === Infinity ? '∞' : fmtCurrency(row.max)}
                                </td>
                                <td className="py-1 text-left text-gray-700">{fmtCurrency(row.inBracket)}</td>
                                <td className="py-1 text-left font-medium">{fmtPct(row.rate)}</td>
                                <td className="py-1 text-left font-semibold text-red-600">{fmtCurrency(row.tax)}</td>
                              </tr>
                            ))}
                            <tr className="border-t border-gray-300 font-semibold">
                              <td colSpan={3} className="py-1 text-right pr-1 text-gray-700">סה"כ מס הכנסה</td>
                              <td className="py-1 text-left text-red-700">{fmtCurrency(bd.ordinaryTax)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* BL brackets */}
                      {bd.bituachLeumi > 0 && (
                        <div>
                          <p className="font-semibold text-gray-700 mb-1">ביטוח לאומי + בריאות — לפי מדרגות</p>
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b border-gray-200 text-gray-500">
                                <th className="text-right py-1 pr-1">מדרגה</th>
                                <th className="text-left py-1">הכנסה במדרגה</th>
                                <th className="text-left py-1">שיעור</th>
                                <th className="text-left py-1">ב"ל</th>
                              </tr>
                            </thead>
                            <tbody>
                              {getBLDetails(parsedIncome, bd.ordinaryIncome).map((row, i) => (
                                <tr key={i} className="border-b border-gray-100">
                                  <td className="py-1 text-right text-gray-500 pr-1 text-xs">{row.label}</td>
                                  <td className="py-1 text-left text-gray-700">{fmtCurrency(row.inBracket)}</td>
                                  <td className="py-1 text-left font-medium">{fmtPct(row.rate)}</td>
                                  <td className="py-1 text-left font-semibold text-orange-600">{fmtCurrency(row.tax)}</td>
                                </tr>
                              ))}
                              <tr className="border-t border-gray-300 font-semibold">
                                <td colSpan={3} className="py-1 text-right pr-1 text-gray-700">סה"כ ב"ל + בריאות</td>
                                <td className="py-1 text-left text-orange-700">{fmtCurrency(bd.bituachLeumi)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </details>

                  {bd.yisufhTax > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 text-xs text-yellow-800">
                      ✓ <strong>מס ייסף (3%)</strong> כלול בחישוב: {fmtCurrency(bd.yisufhSubjectAmount)} × 3% = {fmtCurrency(bd.yisufhTax)}.
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
              <p className="text-xs text-gray-500 mb-1">תמורה ממכירה</p>
              <p className="text-xl font-bold text-gray-800">{fmtCurrency(summary.totalSaleProceeds)}</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-blue-100">
              <p className="text-xs text-gray-500 mb-1">מס הכנסה</p>
              <p className="text-xl font-bold text-red-600">{fmtCurrency(summary.totalOrdinaryTax)}</p>
            </div>
            {summary.totalCapitalGainTax > 0 && (
              <div className="bg-white rounded-xl p-3 border border-blue-100">
                <p className="text-xs text-gray-500 mb-1">מס רווח הון (25%)</p>
                <p className="text-xl font-bold text-red-600">{fmtCurrency(summary.totalCapitalGainTax)}</p>
              </div>
            )}
            <div className="bg-white rounded-xl p-3 border border-orange-100">
              <p className="text-xs text-gray-500 mb-1">ביטוח לאומי + בריאות</p>
              <p className="text-xl font-bold text-orange-600">{fmtCurrency(summary.totalBituachLeumi)}</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-red-100">
              <p className="text-xs text-gray-500 mb-1">סה"כ ניכויים</p>
              <p className="text-xl font-bold text-red-700">{fmtCurrency(summary.totalTax + summary.totalBituachLeumi)}</p>
              <p className="text-xs text-red-400">
                {summary.totalSaleProceeds > 0
                  ? fmtPct((summary.totalTax + summary.totalBituachLeumi) / summary.totalSaleProceeds) + ' מהתמורה'
                  : ''}
              </p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-green-100">
              <p className="text-xs text-gray-500 mb-1">רווח נקי לאחר הכל</p>
              <p className="text-xl font-bold text-green-700">{fmtCurrency(summary.totalNetProfit)}</p>
            </div>
          </div>

          {summary.yisufhNote > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 text-sm text-yellow-900">
              <p className="font-bold mb-1">ℹ️ מס ייסף — 3% נוסף (כלול בסיכום)</p>
              <p>
                הכנסתך הכוללת ({fmtCurrency(summary.finalTaxableIncome)}) עולה מעל {fmtCurrency(YISUPH_THRESHOLD)} ב-{fmtCurrency(summary.yisufhNote)}.
              </p>
              <p className="mt-1 font-semibold">
                מס ייסף: {fmtCurrency(summary.totalYisufhTax)} — כלול בסה"כ הניכויים.
              </p>
            </div>
          )}
        </div>
      )}

      {!isValid && grants.length > 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          הזן הכנסה שנתית ומספר מניות למכירה כדי לראות את חישוב המס
        </p>
      )}
    </div>
  )
}
