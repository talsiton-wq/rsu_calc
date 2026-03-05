import React, { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Grant, VestingType } from '../types'
import { VESTING_TYPE_LABELS } from '../utils/vestingCalculator'

interface Props {
  onAdd: (grant: Grant) => void
}

const defaultForm = {
  name: '',
  grantDate: new Date().toISOString().split('T')[0],
  grantPrice: '',
  totalShares: '',
  durationMonths: '48',
  vestingType: 'quarterly' as VestingType,
}

export default function GrantForm({ onAdd }: Props) {
  const [form, setForm] = useState(defaultForm)
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const grantPrice = parseFloat(form.grantPrice)
    const totalShares = parseInt(form.totalShares)
    const durationMonths = parseInt(form.durationMonths)

    if (!form.name.trim()) return setError('יש להזין שם להענקה')
    if (isNaN(grantPrice) || grantPrice <= 0) return setError('מחיר הענקה חייב להיות מספר חיובי')
    if (isNaN(totalShares) || totalShares <= 0) return setError('מספר מניות חייב להיות מספר חיובי')
    if (isNaN(durationMonths) || durationMonths <= 0) return setError('משך הענקה חייב להיות מספר חיובי')

    onAdd({
      id: uuidv4(),
      name: form.name.trim(),
      grantDate: form.grantDate,
      grantPrice,
      totalShares,
      durationMonths,
      vestingType: form.vestingType,
    })

    setForm(defaultForm)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">שם ההענקה</label>
          <input
            className="input"
            placeholder="לדוגמה: Grant 2023"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
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
          <label className="label">מחיר הענקה למניה (₪)</label>
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
            onChange={e => setForm(f => ({ ...f, vestingType: e.target.value as VestingType }))}
          >
            {Object.entries(VESTING_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </div>

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
