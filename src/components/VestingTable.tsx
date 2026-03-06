import { useState, useEffect } from 'react'
import type { Grant } from '../types'
import { mergeVestingSchedules, formatDate } from '../utils/vestingCalculator'

interface Props {
  grants: Grant[]
  tickerPrices?: Record<string, number>
  onSold?: (grantId: string, eventDate: string, sold: number) => void
}

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const TICKER_PALETTE = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444']

export default function VestingTable({ grants, tickerPrices = {}, onSold }: Props) {
  const events = mergeVestingSchedules(grants)
  const totalShares = grants.reduce((s, g) => s + g.totalShares, 0)
  const hasPrice = Object.keys(tickerPrices).length > 0

  const grantPrice: Record<string, number> = {}
  for (const g of grants) {
    if (tickerPrices[g.ticker]) grantPrice[g.id] = tickerPrices[g.ticker]
  }

  // Total available = grossVested - sold across all grants
  const totalAvailable = grants.reduce((sum, g) => {
    const sold = Object.values(g.soldEvents ?? {}).reduce((a, b) => a + b, 0)
    const grossVested = events
      .filter(e => e.grantId === g.id && e.isPast)
      .reduce((max, e) => Math.max(max, e.cumulativeVested), 0)
    return sum + Math.max(0, grossVested - sold)
  }, 0)

  // soldEvents per grant, keyed by grantId → eventDate → sold
  const soldByGrant: Record<string, Record<string, number>> = {}
  for (const g of grants) {
    soldByGrant[g.id] = g.soldEvents ?? {}
  }

  const uniqueTickers = [...new Set(grants.map(g => g.ticker))]
  const multiTicker = uniqueTickers.length > 1
  const tickerColors: Record<string, string> = {}
  uniqueTickers.forEach((t, i) => { tickerColors[t] = TICKER_PALETTE[i % TICKER_PALETTE.length] })

  // Expand/collapse state per ticker
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(() => new Set(uniqueTickers))
  // Per ticker: which sub-sections are open
  const [expandedSections, setExpandedSections] = useState<Record<string, { vested: boolean; unvested: boolean }>>(() =>
    Object.fromEntries(uniqueTickers.map(t => [t, { vested: true, unvested: true }]))
  )

  const toggleTicker = (ticker: string) => {
    setExpandedTickers(prev => {
      const next = new Set(prev)
      next.has(ticker) ? next.delete(ticker) : next.add(ticker)
      return next
    })
  }

  const toggleSection = (ticker: string, section: 'vested' | 'unvested') => {
    setExpandedSections(prev => ({
      ...prev,
      [ticker]: { ...prev[ticker], [section]: !prev[ticker]?.[section] },
    }))
  }

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
          {uniqueTickers.map(ticker => {
            const tickerEvents = events.filter(e => e.ticker === ticker)
            const vestedEvents = tickerEvents.filter(e => e.isPast)
            const unvestedEvents = tickerEvents.filter(e => !e.isPast)
            const color = tickerColors[ticker]
            const isTickerOpen = expandedTickers.has(ticker)
            const sections = expandedSections[ticker] ?? { vested: true, unvested: true }

            return (
              <>
                {/* Ticker header row — always shown in multi-ticker; acts as collapse toggle */}
                {multiTicker && (
                  <tr
                    key={`ticker-header-${ticker}`}
                    className="cursor-pointer select-none"
                    onClick={() => toggleTicker(ticker)}
                  >
                    <td
                      colSpan={colCount}
                      className="py-1.5 px-3 font-bold text-sm"
                      style={{
                        backgroundColor: color + '18',
                        borderLeft: `4px solid ${color}`,
                        color,
                      }}
                    >
                      <span className="mr-1">{isTickerOpen ? '▾' : '▸'}</span>
                      {ticker}
                      <span className="ml-3 text-xs font-normal opacity-60">
                        {vestedEvents.length} הבשיל · {unvestedEvents.length} עתידי
                      </span>
                    </td>
                  </tr>
                )}

                {/* Inner rows — only when ticker is expanded (or single ticker) */}
                {(isTickerOpen || !multiTicker) && (
                  <>
                    {/* Vested sub-header */}
                    {vestedEvents.length > 0 && (
                      <>
                        <tr
                          key={`vested-header-${ticker}`}
                          className="cursor-pointer select-none"
                          onClick={() => toggleSection(ticker, 'vested')}
                        >
                          <td
                            colSpan={colCount}
                            className="py-1.5 px-4 text-xs font-semibold text-green-700 bg-green-50/80 border-b border-green-100"
                            style={multiTicker ? { borderLeft: `3px solid ${color}` } : {}}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded flex items-center justify-center bg-green-200 text-green-800 font-bold leading-none">
                                {sections.vested ? '−' : '+'}
                              </span>
                              הבשיל ✓
                              <span className="font-normal opacity-60">({vestedEvents.length} אירועים)</span>
                            </span>
                          </td>
                        </tr>
                        {sections.vested && vestedEvents.map((event, idx) => (
                          <EventRow
                            key={`vested-${ticker}-${idx}`}
                            event={event}
                            price={grantPrice[event.grantId]}
                            hasPrice={hasPrice}
                            borderColor={multiTicker ? color : undefined}
                            sold={soldByGrant[event.grantId]?.[event.date] ?? 0}
                            onSold={onSold ? (sold) => onSold(event.grantId, event.date, sold) : undefined}
                          />
                        ))}
                      </>
                    )}

                    {/* Unvested sub-header */}
                    {unvestedEvents.length > 0 && (
                      <>
                        <tr
                          key={`unvested-header-${ticker}`}
                          className="cursor-pointer select-none"
                          onClick={() => toggleSection(ticker, 'unvested')}
                        >
                          <td
                            colSpan={colCount}
                            className="py-1.5 px-4 text-xs font-semibold text-orange-600 bg-orange-50/80 border-b border-orange-100"
                            style={multiTicker ? { borderLeft: `3px solid ${color}` } : {}}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded flex items-center justify-center bg-orange-200 text-orange-800 font-bold leading-none">
                                {sections.unvested ? '−' : '+'}
                              </span>
                              עתידי
                              <span className="font-normal opacity-60">({unvestedEvents.length} אירועים)</span>
                            </span>
                          </td>
                        </tr>
                        {sections.unvested && unvestedEvents.map((event, idx) => (
                          <EventRow
                            key={`unvested-${ticker}-${idx}`}
                            event={event}
                            price={grantPrice[event.grantId]}
                            hasPrice={hasPrice}
                            borderColor={multiTicker ? color : undefined}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
              </>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-50">
            <td colSpan={hasPrice ? 2 : 1} className="py-2 px-3 font-semibold text-gray-700">סך הכל</td>
            <td className="py-2 px-3 text-left">
              <div className="font-bold text-green-700 text-base">
                {totalAvailable.toLocaleString('he-IL')} <span className="text-xs font-normal text-green-600">זמינות</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                סה"כ {totalShares.toLocaleString('he-IL')}
              </div>
            </td>
            <td colSpan={hasPrice ? 6 : 4} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── extracted row component ──────────────────────────────────────────────────

function fmt2(n: number) {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

interface EventRowProps {
  event: ReturnType<typeof mergeVestingSchedules>[number]
  price: number | undefined
  hasPrice: boolean
  borderColor: string | undefined
  sold?: number
  onSold?: (sold: number) => void
}

function EventRow({ event, price, hasPrice, borderColor, sold = 0, onSold }: EventRowProps) {
  const [inputVal, setInputVal] = useState(sold > 0 ? String(sold) : '')
  const [justSaved, setJustSaved] = useState(false)

  // Sync input if parent resets sold to 0 (e.g. after import)
  useEffect(() => {
    setInputVal(sold > 0 ? String(sold) : '')
  }, [sold])

  const commit = (val: string) => {
    const n = Math.max(0, parseInt(val) || 0)
    onSold!(n)
    setInputVal(n > 0 ? String(n) : '')
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1200)
  }

  const currentVal = parseInt(inputVal) || sold
  const inHand = event.sharesVested - currentVal
  const isOverSold = currentVal > event.sharesVested
  return (
    <tr
      style={borderColor ? { borderLeft: `3px solid ${borderColor}` } : {}}
      className={`border-b border-gray-50 transition-colors ${
        event.isPast ? 'bg-green-50/40' : 'hover:bg-gray-50'
      }`}
    >
      <td className="py-2 px-3 text-gray-700">{formatDate(event.date)}</td>
      {hasPrice && (
        <td className="py-2 px-3 text-left font-medium text-blue-600">
          {price ? fmt2(event.sharesVested * price) : '—'}
        </td>
      )}
      <td className="py-2 px-3 text-left font-medium text-blue-700">
        <div>+{event.sharesVested.toLocaleString('he-IL')}</div>
        {event.isPast && onSold && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <span className="text-xs text-gray-400">מכרתי:</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={inputVal}
              placeholder="0"
              onChange={e => setInputVal(e.target.value.replace(/[^\d]/g, ''))}
              onBlur={() => commit(inputVal)}
              onKeyDown={e => e.key === 'Enter' && (e.currentTarget.blur(), commit(inputVal))}
              style={{ direction: 'ltr', textAlign: 'left' }}
              className={`w-16 text-xs border rounded px-1.5 py-0.5 focus:outline-none ${
                isOverSold ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-blue-400'
              }`}
            />
            {isOverSold ? (
              <span className="text-xs text-red-600 font-semibold">
                לא ניתן למכור יותר מ-{event.sharesVested.toLocaleString('he-IL')}
              </span>
            ) : (
              <span className={`text-sm font-bold px-1.5 py-0.5 rounded transition-colors ${
                justSaved ? 'bg-green-200 text-green-800' : inHand > 0 ? 'text-green-700' : 'text-gray-400'
              }`}>
                ✓ זמין: {inHand.toLocaleString('he-IL')}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="py-2 px-3 text-gray-500">{event.periodLabel}</td>
      <td className="py-2 px-3 text-left font-semibold text-green-700">
        {event.cumulativeVested.toLocaleString('he-IL')}
      </td>
      {hasPrice && (
        <td className="py-2 px-3 text-left font-semibold text-green-700">
          {price ? fmt2(event.cumulativeVested * price) : '—'}
        </td>
      )}
      <td className="py-2 px-3 text-left text-orange-600">
        {event.cumulativeUnvested.toLocaleString('he-IL')}
      </td>
      {hasPrice && (
        <td className="py-2 px-3 text-left text-orange-500">
          {price ? fmt2(event.cumulativeUnvested * price) : '—'}
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
}
