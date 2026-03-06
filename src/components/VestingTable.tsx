import type { Grant } from '../types'
import { mergeVestingSchedules, formatDate } from '../utils/vestingCalculator'

interface Props {
  grants: Grant[]
  tickerPrices?: Record<string, number>
}

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const TICKER_PALETTE = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444']

export default function VestingTable({ grants, tickerPrices = {} }: Props) {
  const events = mergeVestingSchedules(grants)
  const totalShares = grants.reduce((s, g) => s + g.totalShares, 0)
  const hasPrice = Object.keys(tickerPrices).length > 0

  const grantPrice: Record<string, number> = {}
  for (const g of grants) {
    if (tickerPrices[g.ticker]) grantPrice[g.id] = tickerPrices[g.ticker]
  }

  const uniqueTickers = [...new Set(grants.map(g => g.ticker))]
  const multiTicker = uniqueTickers.length > 1
  const tickerColors: Record<string, string> = {}
  uniqueTickers.forEach((t, i) => { tickerColors[t] = TICKER_PALETTE[i % TICKER_PALETTE.length] })

  // When multi-ticker: group by ticker then sort by date within each group
  const renderEvents = multiTicker
    ? uniqueTickers.flatMap(ticker => events.filter(e => e.ticker === ticker))
    : events

  // Total column count for colSpan calculations
  const colCount = 1 + (hasPrice ? 1 : 0) + 1 + 1 + 1 + (hasPrice ? 1 : 0) + 1 + (hasPrice ? 1 : 0) + 1

  return (
    <div className="overflow-x-auto">
      {/* Ticker legend */}
      {multiTicker && (
        <div className="flex flex-wrap gap-3 mb-3 text-xs">
          {uniqueTickers.map(ticker => (
            <span key={ticker} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: tickerColors[ticker] }} />
              <span className="font-semibold text-gray-700">{ticker}</span>
            </span>
          ))}
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-right py-2 px-3 font-semibold text-gray-600">תאריך הבשלה</th>
            {hasPrice && (
              <th className="text-left py-2 px-3 font-semibold text-blue-600">שווי הבשלה</th>
            )}
            <th className="text-left py-2 px-3 font-semibold text-gray-600">מניות בתקופה</th>
            <th className="text-right py-2 px-3 font-semibold text-gray-600">תקופה</th>
            <th className="text-left py-2 px-3 font-semibold text-gray-600">מצטבר Vested</th>
            {hasPrice && (
              <th className="text-left py-2 px-3 font-semibold text-green-700">שווי Vested</th>
            )}
            <th className="text-left py-2 px-3 font-semibold text-gray-600">נותר Unvested</th>
            {hasPrice && (
              <th className="text-left py-2 px-3 font-semibold text-orange-600">שווי Unvested</th>
            )}
            <th className="text-center py-2 px-3 font-semibold text-gray-600">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          {renderEvents.map((event, idx) => {
            const isNewTicker = multiTicker && (idx === 0 || renderEvents[idx - 1].ticker !== event.ticker)
            const price = grantPrice[event.grantId]
            const borderColor = multiTicker ? tickerColors[event.ticker] : undefined

            return (
              <>
                {isNewTicker && (
                  <tr key={`ticker-header-${event.ticker}`}>
                    <td
                      colSpan={colCount}
                      className="py-1.5 px-3 font-bold text-sm"
                      style={{
                        backgroundColor: tickerColors[event.ticker] + '18',
                        borderLeft: `4px solid ${tickerColors[event.ticker]}`,
                        color: tickerColors[event.ticker],
                      }}
                    >
                      {event.ticker}
                    </td>
                  </tr>
                )}
                <tr
                  key={idx}
                  style={borderColor ? { borderLeft: `3px solid ${borderColor}` } : {}}
                  className={`border-b border-gray-50 transition-colors ${
                    event.isPast ? 'bg-green-50/40' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="py-2 px-3 text-gray-700">{formatDate(event.date)}</td>
                  {hasPrice && (
                    <td className="py-2 px-3 text-left font-medium text-blue-600">
                      {price ? fmt(event.sharesVested * price) : '—'}
                    </td>
                  )}
                  <td className="py-2 px-3 text-left font-medium text-blue-700">
                    +{event.sharesVested.toLocaleString('he-IL')}
                  </td>
                  <td className="py-2 px-3 text-gray-500">{event.periodLabel}</td>
                  <td className="py-2 px-3 text-left font-semibold text-green-700">
                    {event.cumulativeVested.toLocaleString('he-IL')}
                  </td>
                  {hasPrice && (
                    <td className="py-2 px-3 text-left font-semibold text-green-700">
                      {price ? fmt(event.cumulativeVested * price) : '—'}
                    </td>
                  )}
                  <td className="py-2 px-3 text-left text-orange-600">
                    {event.cumulativeUnvested.toLocaleString('he-IL')}
                  </td>
                  {hasPrice && (
                    <td className="py-2 px-3 text-left text-orange-500">
                      {price ? fmt(event.cumulativeUnvested * price) : '—'}
                    </td>
                  )}
                  <td className="py-2 px-3 text-center">
                    {event.isPast ? (
                      <span className="tag-green">הבשיל ✓</span>
                    ) : (
                      <span className="tag-orange">עתידי</span>
                    )}
                  </td>
                </tr>
              </>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-50">
            <td colSpan={hasPrice ? 2 : 1} className="py-2 px-3 font-semibold text-gray-700">סך הכל</td>
            <td className="py-2 px-3 text-left font-bold text-blue-700">
              {totalShares.toLocaleString('he-IL')}
            </td>
            <td colSpan={hasPrice ? 6 : 4} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
