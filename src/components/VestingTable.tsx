import type { Grant } from '../types'
import { mergeVestingSchedules, formatDate } from '../utils/vestingCalculator'

interface Props {
  grants: Grant[]
  tickerPrices?: Record<string, number>
}

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function VestingTable({ grants, tickerPrices = {} }: Props) {
  const events = mergeVestingSchedules(grants)
  const totalShares = grants.reduce((s, g) => s + g.totalShares, 0)
  const hasPrice = Object.keys(tickerPrices).length > 0

  // Build grantId -> price map
  const grantPrice: Record<string, number> = {}
  for (const g of grants) {
    if (tickerPrices[g.ticker]) grantPrice[g.id] = tickerPrices[g.ticker]
  }

  const multiGrant = grants.length > 1

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-right py-2 px-3 font-semibold text-gray-600">תאריך הבשלה</th>
            {multiGrant && (
              <th className="text-right py-2 px-3 font-semibold text-gray-600">הענקה</th>
            )}
            <th className="text-right py-2 px-3 font-semibold text-gray-600">תקופה</th>
            <th className="text-left py-2 px-3 font-semibold text-gray-600">מניות בתקופה</th>
            {hasPrice && (
              <th className="text-left py-2 px-3 font-semibold text-blue-600">שווי הבשלה</th>
            )}
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
          {events.map((event, idx) => {
            const price = grantPrice[event.grantId]
            return (
              <tr
                key={idx}
                className={`border-b border-gray-50 transition-colors ${
                  event.isPast ? 'bg-green-50/40' : 'hover:bg-gray-50'
                }`}
              >
                <td className="py-2 px-3 text-gray-700">{formatDate(event.date)}</td>
                {multiGrant && (
                  <td className="py-2 px-3 text-gray-500 text-xs">{event.grantLabel}</td>
                )}
                <td className="py-2 px-3 text-gray-500">{event.periodLabel}</td>
                <td className="py-2 px-3 text-left font-medium text-blue-700">
                  +{event.sharesVested.toLocaleString('he-IL')}
                </td>
                {hasPrice && (
                  <td className="py-2 px-3 text-left font-medium text-blue-600">
                    {price ? fmt(event.sharesVested * price) : '—'}
                  </td>
                )}
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
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-50">
            <td colSpan={multiGrant ? 3 : 2} className="py-2 px-3 font-semibold text-gray-700">סך הכל</td>
            <td className="py-2 px-3 text-left font-bold text-blue-700">
              {totalShares.toLocaleString('he-IL')}
            </td>
            <td colSpan={hasPrice ? 7 : 3} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
