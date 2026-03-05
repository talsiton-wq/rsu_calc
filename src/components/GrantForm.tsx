import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Grant, VestingType } from '../types'
import { VESTING_TYPE_LABELS } from '../utils/vestingCalculator'

interface Props {
  onAdd: (grant: Grant) => void
}

const defaultForm = {
  ticker: '',
  grantDate: new Date().toISOString().split('T')[0],
  grantPrice: '',
  totalShares: '',
  durationMonths: '48',
  vestingType: 'quarterly' as VestingType,
}

function makeEqualPercentages(years: number): number[] {
  const base = parseFloat((100 / years).toFixed(2))
  const arr = Array(years).fill(base)
  // Fix floating point: adjust last to ensure sum = 100
  const sum = parseFloat((base * years).toFixed(2))
  arr[years - 1] = parseFloat((arr[years - 1] + (100 - sum)).toFixed(2))
  return arr
}

export default function GrantForm({ onAdd }: Props) {
  const [form, setForm] = useState(defaultForm)
  const [error, setError] = useState('')
  const [yearlyPct, setYearlyPct] = useState<number[]>([])

  const years = Math.max(1, Math.floor(parseInt(form.durationMonths) / 12) || 1)

  // Rebuild yearlyPct when years or vestingType changes
  useEffect(() => {
    if (form.vestingType === 'asymmetric') {
      setYearlyPct(prev => {
        if (prev.length === years) return prev
        if (prev.length < years) {
          const added = years - prev.length
          const extra = makeEqualPercentages(added)
          return [...prev, ...extra]
        }
        return prev.slice(0, years)
      })
    }
  }, [years, form.vestingType])

  function handleVestingTypeChange(vt: VestingType) {
    setForm(f => ({ ...f, vestingType: vt }))
    if (vt === 'asymmetric') {
      setYearlyPct(makeEqualPercentages(years))
    }
  }

  function setPct(index: number, value: string) {
    const num = parseFloat(value)
    if (isNaN(num)) return
    setYearlyPct(prev => {
      const next = [...prev]
      next[index] = num
      return next
    })
  }

  const pctSum = yearlyPct.reduce((a, b) => a + b, 0)
  const pctSumRounded = parseFloat(pctSum.toFixed(2))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const grantPrice = parseFloat(form.grantPrice)
    const totalShares = parseInt(form.totalShares)
    const durationMonths = parseInt(form.durationMonths)

    if (isNaN(grantPrice) || grantPrice <= 0) return setError('מחיר הענקה חייב להיות מספר חיובי')
    if (isNaN(totalShares) || totalShares <= 0) return setError('מספר מניות חייב להיות מספר חיובי')
    if (isNaN(durationMonths) || durationMonths <= 0) return setError('משך הענקה חייב להיות מספר חיובי')

    if (form.vestingType === 'asymmetric') {
      if (Math.abs(pctSum - 100) > 0.1)
        return setError(`אחוזי ההבשלה חייבים לסכם ל-100% (כרגע: ${pctSumRounded}%)`)
    }

    onAdd({
      id: uuidv4(),
      ticker: form.ticker.trim().toUpperCase(),
      grantDate: form.grantDate,
      grantPrice,
      totalShares,
      durationMonths,
      vestingType: form.vestingType,
      yearlyPercentages: form.vestingType === 'asymmetric' ? [...yearlyPct] : undefined,
    })

    setForm(defaultForm)
    setYearlyPct([])
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">סימול מניה (Ticker)</label>
          <input
            className="input"
            placeholder="לדוגמה: AAPL"
            value={form.ticker}
            onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
          />
        </div>

        <div>
          <label className="label">תאריך הענקה</label>
          <input
            type="date"
            className="input"
            value={form.grantDate}
            onChange={e => setForm(f => ({ ...f, grantDate: e.target.value }))}
          />
        </div>

        <div>
          <label className="label">מחיר הענקה למניה ($)</label>
          <input
            type="number"
            className="input"
            placeholder="100"
            min="0"
            step="0.01"
            value={form.grantPrice}
            onChange={e => setForm(f => ({ ...f, grantPrice: e.target.value }))}
          />
        </div>

        <div>
          <label className="label">מספר מניות כולל</label>
          <input
            type="number"
            className="input"
            placeholder="1000"
            min="1"
            step="1"
            value={form.totalShares}
            onChange={e => setForm(f => ({ ...f, totalShares: e.target.value }))}
          />
        </div>

        <div>
          <label className="label">משך הענקה (חודשים)</label>
          <select
            className="input"
            value={form.durationMonths}
            onChange={e => setForm(f => ({ ...f, durationMonths: e.target.value }))}
          >
            <option value="12">12 חודש (שנה)</option>
            <option value="24">24 חודשים (שנתיים)</option>
            <option value="36">36 חודשים (3 שנים)</option>
            <option value="48">48 חודשים (4 שנים)</option>
            <option value="60">60 חודשים (5 שנים)</option>
          </select>
        </div>

        <div>
          <label className="label">אופן הבשלה</label>
          <select
            className="input"
            value={form.vestingType}
            onChange={e => handleVestingTypeChange(e.target.value as VestingType)}
          >
            {Object.entries(VESTING_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Asymmetric vesting: per-year percentages */}
      {form.vestingType === 'asymmetric' && yearlyPct.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">אחוז הבשלה לכל שנה</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              Math.abs(pctSumRounded - 100) < 0.1
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}>
              סה"כ: {pctSumRounded}%
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {yearlyPct.map((pct, i) => (
              <div key={i}>
                <label className="label text-xs">שנה {i + 1}</label>
                <div className="relative">
                  <input
                    type="number"
                    className="input pl-8"
                    min="0"
                    max="100"
                    step="0.01"
                    value={pct}
                    onChange={e => setPct(i, e.target.value)}
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onClick={() => setYearlyPct(makeEqualPercentages(years))}
          >
            פזר שווה בשווה
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary w-full sm:w-auto">
        + הוסף הענקה
      </button>
    </form>
  )
}
