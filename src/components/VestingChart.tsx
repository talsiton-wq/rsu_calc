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
import { mergeVestingSchedules, getCombinedSummary, formatDate } from '../utils/vestingCalculator'

interface Props {
  grants: Grant[]
}

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

export default function VestingChart({ grants }: Props) {
  const merged = mergeVestingSchedules(grants)
  const summary = getCombinedSummary(grants)

  // Aggregate same-date events for chart bars
  const dateMap = new Map<string, { label: string, sharesVested: number, cumulativeVested: number, cumulativeUnvested: number, isPast: boolean }>()
  for (const e of merged) {
    if (dateMap.has(e.date)) {
      const existing = dateMap.get(e.date)!
      existing.sharesVested += e.sharesVested
      existing.cumulativeVested = e.cumulativeVested
      existing.cumulativeUnvested = e.cumulativeUnvested
    } else {
      dateMap.set(e.date, {
        label: e.periodLabel,
        sharesVested: e.sharesVested,
        cumulativeVested: e.cumulativeVested,
        cumulativeUnvested: e.cumulativeUnvested,
        isPast: e.isPast,
      })
    }
  }

  const chartData = Array.from(dateMap.values()).map(d => ({
    label: d.label,
    'מניות שהבשילו (מצטבר)': d.cumulativeVested,
    'מניות שלא הבשילו': d.cumulativeUnvested,
    'הבשלה בתקופה': d.sharesVested,
    isPast: d.isPast,
  }))

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
        <div className="bg-green-50 rounded-xl p-3 border border-green-100">
          <p className="text-xs text-green-600 font-medium mb-1">הבשילו (Vested)</p>
          <p className="text-2xl font-bold text-green-700">{summary.vestedShares.toLocaleString('he-IL')}</p>
          <p className="text-xs text-green-500">{summary.vestedPercent.toFixed(1)}% מהסך הכל</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
          <p className="text-xs text-orange-600 font-medium mb-1">לא הבשילו (Unvested)</p>
          <p className="text-2xl font-bold text-orange-700">{summary.unvestedShares.toLocaleString('he-IL')}</p>
          <p className="text-xs text-orange-500">{(100 - summary.vestedPercent).toFixed(1)}% מהסך הכל</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <p className="text-xs text-blue-600 font-medium mb-1">סך הכל מניות</p>
          <p className="text-2xl font-bold text-blue-700">{summary.totalShares.toLocaleString('he-IL')}</p>
          <p className="text-xs text-blue-500">{grants.length} הענקות</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
          <p className="text-xs text-purple-600 font-medium mb-1">הבשלה הבאה</p>
          {summary.nextVesting ? (
            <>
              <p className="text-sm font-bold text-purple-700">{formatDate(summary.nextVesting.date)}</p>
              <p className="text-xs text-purple-500">+{summary.nextVesting.sharesVested.toLocaleString('he-IL')} מניות</p>
            </>
          ) : (
            <p className="text-sm font-bold text-purple-700">הסתיימה</p>
          )}
        </div>
      </div>

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
            <Bar
              dataKey="הבשלה בתקופה"
              fill="#93c5fd"
              opacity={0.7}
              radius={[4, 4, 0, 0]}
            />
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
