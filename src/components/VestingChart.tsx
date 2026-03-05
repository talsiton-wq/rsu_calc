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
import { calculateVestingSchedule, formatDate, getVestingSummary } from '../utils/vestingCalculator'

interface Props {
  grant: Grant
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

export default function VestingChart({ grant }: Props) {
  const events = calculateVestingSchedule(grant)
  const summary = getVestingSummary(grant)

  const chartData = events.map(e => ({
    label: e.periodLabel,
    date: e.date,
    'מניות שהבשילו (מצטבר)': e.cumulativeVested,
    'מניות שלא הבשילו': e.cumulativeUnvested,
    'הבשלה בתקופה': e.sharesVested,
    isPast: e.isPast,
  }))

  const todayLabel = (() => {
    const todayIdx = events.findIndex(e => !e.isPast)
    if (todayIdx > 0) return events[todayIdx - 1].periodLabel
    if (todayIdx === 0) return null
    return events[events.length - 1]?.periodLabel
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
          <p className="text-2xl font-bold text-blue-700">{grant.totalShares.toLocaleString('he-IL')}</p>
          <p className="text-xs text-blue-500">
            {summary.completedPeriods}/{summary.totalPeriods} תקופות
          </p>
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
