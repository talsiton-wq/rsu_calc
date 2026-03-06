import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { Grant } from '../types'
import { mergeVestingSchedules, getCombinedSummary, formatDate, getVestingSummary, grantLabel, calculateVestingSchedule } from '../utils/vestingCalculator'

interface Props {
  grants: Grant[]
  tickerPrices?: Record<string, number>
}

const TICKER_PALETTE = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444']

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm" dir="rtl">
        <p className="font-semibold text-gray-800 mb-2">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }} className="flex gap-2">
            <span>{p.name}:</span>
            <span className="font-medium">{p.value.toLocaleString('he-IL')} מניות</span>
          </p>
        ))}
      </div>
    )
  }
  return null
}

function fmtUSD(n: number) {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function VestingChart({ grants, tickerPrices = {} }: Props) {
  const merged = mergeVestingSchedules(grants)
  const summary = getCombinedSummary(grants)

  // Per-ticker aggregation — gross vested vs available (after sold)
  const tickerMap: Record<string, {
    grossVested: number  // total that have vested (regardless of sales)
    sold: number         // how many were already sold
    available: number    // grossVested - sold = זמין
    unvested: number
    total: number
    price: number | null
  }> = {}
  for (const g of grants) {
    const s = getVestingSummary(g)
    const price = tickerPrices[g.ticker] ?? null
    if (!tickerMap[g.ticker]) tickerMap[g.ticker] = { grossVested: 0, sold: 0, available: 0, unvested: 0, total: 0, price }
    tickerMap[g.ticker].grossVested += s.grossVested
    tickerMap[g.ticker].sold += s.totalSold
    tickerMap[g.ticker].available += s.vestedShares
    tickerMap[g.ticker].unvested += s.unvestedShares
    tickerMap[g.ticker].total += s.totalShares
  }
  const tickerSummary = Object.entries(tickerMap).map(([ticker, v]) => ({ ticker, ...v }))

  // Overall gross/available totals (across all grants)
  const totalGrossVested = tickerSummary.reduce((s, t) => s + t.grossVested, 0)
  const totalSoldAll = tickerSummary.reduce((s, t) => s + t.sold, 0)
  const totalAvailable = totalGrossVested - totalSoldAll
  const uniqueTickers = tickerSummary.map(t => t.ticker)
  const multiTicker = uniqueTickers.length > 1

  const tickerColors: Record<string, string> = {}
  uniqueTickers.forEach((t, i) => { tickerColors[t] = TICKER_PALETTE[i % TICKER_PALETTE.length] })

  // Fix: per-grant vested/unvested values using getVestingSummary (not global cumulativeVested)
  // vestedValue = gross vested × price (what has vested, regardless of sales)
  const vestedValue = grants.reduce((sum, g) => {
    const p = tickerPrices[g.ticker]
    if (!p) return sum
    return sum + getVestingSummary(g).grossVested * p
  }, 0)
  // availableValue = זמין × price (what's still in hand)
  const availableValue = grants.reduce((sum, g) => {
    const p = tickerPrices[g.ticker]
    if (!p) return sum
    return sum + getVestingSummary(g).vestedShares * p
  }, 0)

  const unvestedValue = grants.reduce((sum, g) => {
    const p = tickerPrices[g.ticker]
    if (!p) return sum
    return sum + getVestingSummary(g).unvestedShares * p
  }, 0)

  // Compute next vesting value: sum across all grants that vest on the same earliest date
  const nextVestingValue = (() => {
    if (!summary.nextVesting) return null
    const date = summary.nextVesting.date
    let total = 0
    let hasSomePrice = false
    for (const g of grants) {
      const p = tickerPrices[g.ticker]
      if (!p) continue
      const events = calculateVestingSchedule(g)
      for (const e of events) {
        if (e.date === date && !e.isPast) {
          total += e.sharesVested * p
          hasSomePrice = true
        }
      }
    }
    return hasSomePrice ? total : null
  })()

  const hasAnyPrice = Object.keys(tickerPrices).length > 0

  // Build chart data — track per-ticker shares per date
  const dateMap = new Map<string, {
    label: string
    cumulativeVested: number
    cumulativeUnvested: number
    isPast: boolean
    perTicker: Record<string, number>
  }>()

  for (const e of merged) {
    if (dateMap.has(e.date)) {
      const existing = dateMap.get(e.date)!
      existing.cumulativeVested = e.cumulativeVested
      existing.cumulativeUnvested = e.cumulativeUnvested
      existing.perTicker[e.ticker] = (existing.perTicker[e.ticker] || 0) + e.sharesVested
    } else {
      dateMap.set(e.date, {
        label: e.periodLabel,
        cumulativeVested: e.cumulativeVested,
        cumulativeUnvested: e.cumulativeUnvested,
        isPast: e.isPast,
        perTicker: { [e.ticker]: e.sharesVested },
      })
    }
  }

  const chartData = Array.from(dateMap.values()).map(d => {
    const obj: Record<string, any> = {
      label: d.label,
      'מניות שהבשילו (מצטבר)': d.cumulativeVested,
      'מניות שלא הבשילו': d.cumulativeUnvested,
      isPast: d.isPast,
    }
    if (multiTicker) {
      for (const ticker of uniqueTickers) {
        obj[ticker] = d.perTicker[ticker] || 0
      }
    } else {
      obj['הבשלה בתקופה'] = Object.values(d.perTicker).reduce((s, v) => s + v, 0)
    }
    return obj
  })

  const todayLabel = (() => {
    const entries = Array.from(dateMap.entries())
    const idx = entries.findIndex(([, d]) => !d.isPast)
    if (idx > 0) return entries[idx - 1][1].label
    if (idx === 0) return null
    return entries[entries.length - 1]?.[1].label
  })()

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Vested */}
        <div className="bg-green-50 rounded-xl p-3 border border-green-100">
          <p className="text-xs text-green-500 font-medium mb-0.5">
            הבשילו: {hasAnyPrice && vestedValue > 0 ? fmtUSD(vestedValue) : `${totalGrossVested.toLocaleString('he-IL')} מניות`}
            <span className="opacity-60 mr-1"> · {summary.vestedPercent.toFixed(1)}%</span>
          </p>
          {hasAnyPrice && availableValue > 0 ? (
            <>
              <p className="text-2xl font-bold text-green-800 leading-tight">{fmtUSD(availableValue)}</p>
              <p className="text-xs text-green-600 mt-0.5 font-semibold">
                {totalAvailable.toLocaleString('he-IL')} מניות זמין
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-green-700">{totalAvailable.toLocaleString('he-IL')}</p>
              <p className="text-xs text-green-500">{summary.vestedPercent.toFixed(1)}% מהסך הכל</p>
            </>
          )}
          {multiTicker && (
            <div className="mt-1.5 pt-1.5 border-t border-green-200 space-y-1">
              {tickerSummary.map(t => (
                <div key={t.ticker} className="flex justify-between items-start gap-1">
                  <span className="text-xs font-bold shrink-0" style={{ color: tickerColors[t.ticker] }}>{t.ticker}</span>
                  <span className="text-right">
                    {t.price != null && <span className="text-xs font-semibold text-green-800 block">{fmtUSD(t.available * t.price)} זמין</span>}
                    <span className="text-xs text-green-500 opacity-70">
                      {t.available.toLocaleString('he-IL')}<span className="opacity-60">/{t.grossVested.toLocaleString('he-IL')}</span>
                      {' '}({t.total > 0 ? ((t.grossVested / t.total) * 100).toFixed(0) : 0}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unvested */}
        <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
          <p className="text-xs text-orange-600 font-medium mb-1">לא הבשילו (Unvested)</p>
          {hasAnyPrice && unvestedValue > 0 ? (
            <>
              <p className="text-2xl font-bold text-orange-700 leading-tight">{fmtUSD(unvestedValue)}</p>
              <p className="text-xs text-orange-500 mt-0.5">
                <span className="text-sm font-semibold text-orange-600">{summary.unvestedShares.toLocaleString('he-IL')}</span> מניות · {(100 - summary.vestedPercent).toFixed(1)}% מהסך הכל
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-orange-700">{summary.unvestedShares.toLocaleString('he-IL')}</p>
              <p className="text-xs text-orange-500">{(100 - summary.vestedPercent).toFixed(1)}% מהסך הכל</p>
            </>
          )}
          {multiTicker && (
            <div className="mt-1.5 pt-1.5 border-t border-orange-200 space-y-1">
              {tickerSummary.map(t => (
                <div key={t.ticker} className="flex justify-between items-start gap-1">
                  <span className="text-xs font-bold shrink-0" style={{ color: tickerColors[t.ticker] }}>{t.ticker}</span>
                  <span className="text-right">
                    {t.price != null && <span className="text-xs font-semibold text-orange-700 block">{fmtUSD(t.unvested * t.price)}</span>}
                    <span className="text-xs text-orange-600 opacity-70">
                      {t.unvested.toLocaleString('he-IL')}<span className="opacity-60">/{t.total.toLocaleString('he-IL')}</span>
                      {' '}({t.total > 0 ? ((t.unvested / t.total) * 100).toFixed(0) : 0}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total */}
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <p className="text-xs text-blue-600 font-medium mb-0.5">סך הכל זמין</p>
          {hasAnyPrice && availableValue > 0 ? (
            <>
              <p className="text-2xl font-bold text-blue-700 leading-tight">{fmtUSD(availableValue)}</p>
              <p className="text-xs text-blue-400 mt-0.5">
                לפני מכירות: <span className="font-semibold text-blue-500">{summary.totalShares.toLocaleString('he-IL')}</span> מניות · {grants.length} הענקות
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-blue-700">{totalAvailable.toLocaleString('he-IL')}</p>
              <p className="text-xs text-blue-500">לפני מכירות: {summary.totalShares.toLocaleString('he-IL')} · {grants.length} הענקות</p>
            </>
          )}
          {multiTicker && (
            <div className="mt-1.5 pt-1.5 border-t border-blue-200 space-y-1">
              {tickerSummary.map(t => (
                <div key={t.ticker} className="flex justify-between items-start gap-1">
                  <span className="text-xs font-bold shrink-0" style={{ color: tickerColors[t.ticker] }}>{t.ticker}</span>
                  <span className="text-right">
                    {t.price != null && <span className="text-xs font-semibold text-blue-700 block">{fmtUSD(t.total * t.price)}</span>}
                    <span className="text-xs text-blue-600 opacity-70">{t.total.toLocaleString('he-IL')} מניות</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Next Vesting */}
        <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
          <p className="text-xs text-purple-600 font-medium mb-1">הבשלה הבאה</p>
          {summary.nextVesting ? (
            <>
              <p className="text-sm font-bold text-purple-700">{formatDate(summary.nextVesting.date)}</p>
              {nextVestingValue != null ? (
                <>
                  <p className="text-xl font-bold text-purple-700 leading-tight">{fmtUSD(nextVestingValue)}</p>
                  <p className="text-xs text-purple-500 mt-0.5">+<span className="text-sm font-semibold text-purple-600">{summary.nextVesting.sharesVested.toLocaleString('he-IL')}</span> מניות</p>
                </>
              ) : (
                <p className="text-2xl font-bold text-purple-700">+{summary.nextVesting.sharesVested.toLocaleString('he-IL')}</p>
              )}
            </>
          ) : (
            <p className="text-sm font-bold text-purple-700">הסתיימה</p>
          )}
        </div>
      </div>

      {/* Multi-ticker legend for chart */}
      {multiTicker && (
        <div className="flex flex-wrap gap-3 text-xs">
          {uniqueTickers.map(ticker => (
            <span key={ticker} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: tickerColors[ticker] }} />
              <span className="font-medium text-gray-600">{ticker}</span>
            </span>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="מניות שהבשילו (מצטבר)"
              fill="#86efac"
              stroke="#22c55e"
              fillOpacity={0.6}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="מניות שלא הבשילו"
              fill="#fed7aa"
              stroke="#f97316"
              fillOpacity={0.4}
              strokeWidth={2}
            />
            {multiTicker ? (
              uniqueTickers.map((ticker, i) => (
                <Bar
                  key={ticker}
                  dataKey={ticker}
                  stackId="vesting"
                  fill={tickerColors[ticker]}
                  opacity={0.8}
                  radius={i === uniqueTickers.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))
            ) : (
              <Bar dataKey="הבשלה בתקופה" fill="#93c5fd" opacity={0.7} radius={[4, 4, 0, 0]} />
            )}
            {todayLabel && (
              <ReferenceLine
                x={todayLabel}
                stroke="#6366f1"
                strokeDasharray="4 4"
                label={{ value: 'היום', fill: '#6366f1', fontSize: 11 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
