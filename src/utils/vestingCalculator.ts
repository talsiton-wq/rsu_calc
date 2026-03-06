import type { Grant, VestingEvent, VestingType } from '../types'

export function grantLabel(grant: Grant): string {
  const d = new Date(grant.grantDate).toLocaleDateString('he-IL', { year: 'numeric', month: 'short' })
  return grant.ticker ? `${grant.ticker} — ${d}` : d
}

export const VESTING_TYPE_LABELS: Record<VestingType, string> = {
  quarterly:    'רבעוני (כל 3 חודשים)',
  trimesterly:  'שלישוני (כל 4 חודשים)',
  semiannual:   'חצי שנתי (כל 6 חודשים)',
  annual:       'שנתי (כל 12 חודשים)',
  asymmetric:   'לא סימטרי (% שונה לכל שנה)',
}

export const VESTING_PERIOD_MONTHS: Partial<Record<VestingType, number>> = {
  quarterly:   3,
  trimesterly: 4,
  semiannual:  6,
  annual:      12,
}

/**
 * Add months to a date string and return ISO date string
 */
function addMonths(dateStr: string, months: number): string {
  const date = new Date(dateStr)
  date.setMonth(date.getMonth() + months)
  return date.toISOString().split('T')[0]
}

/**
 * Format a date string for display
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Generate period label (e.g. "Q1 2023", "H1 2023", "2023")
 */
function getPeriodLabel(dateStr: string, vestingType: VestingType, periodIndex: number): string {
  const date = new Date(dateStr)
  const year = date.getFullYear()

  if (vestingType === 'quarterly') {
    const quarter = Math.floor(date.getMonth() / 3) + 1
    return `Q${quarter} ${year}`
  }
  if (vestingType === 'trimesterly') {
    const third = Math.floor(date.getMonth() / 4) + 1
    return `T${third} ${year}`
  }
  if (vestingType === 'semiannual') {
    const half = date.getMonth() < 6 ? 'H1' : 'H2'
    return `${half} ${year}`
  }
  return `שנה ${periodIndex} (${year})`
}

/**
 * Calculate the full vesting schedule for a grant
 */
export function calculateVestingSchedule(grant: Grant): VestingEvent[] {
  const today = new Date()

  // --- Asymmetric vesting ---
  if (grant.vestingType === 'asymmetric') {
    const years = Math.floor(grant.durationMonths / 12)
    const percentages = grant.yearlyPercentages ?? Array(years).fill(100 / years)
    const yearlyTypes = grant.yearlyVestingTypes ?? Array(years).fill('annual')
    const events: VestingEvent[] = []
    let cumulativeVested = 0

    for (let y = 0; y < years; y++) {
      const pct = percentages[y] ?? 0
      const yearShares = Math.round((pct / 100) * grant.totalShares)
      const yearStartDate = addMonths(grant.grantDate, y * 12)
      const yvt: VestingType = yearlyTypes[y] ?? 'annual'
      const periodMonths = VESTING_PERIOD_MONTHS[yvt] ?? 12
      const numPeriods = Math.floor(12 / periodMonths)
      const basePerPeriod = Math.floor(yearShares / numPeriods)
      const rem = yearShares - basePerPeriod * numPeriods

      for (let p = 1; p <= numPeriods; p++) {
        const sharesThisPeriod = p === numPeriods ? basePerPeriod + rem : basePerPeriod
        cumulativeVested += sharesThisPeriod
        const eventDate = addMonths(yearStartDate, p * periodMonths)

        let periodLabel: string
        if (numPeriods === 1) {
          periodLabel = `שנה ${y + 1} (${pct.toFixed(0)}%)`
        } else {
          periodLabel = getPeriodLabel(eventDate, yvt, p)
          periodLabel += ` — שנה ${y + 1}`
        }

        events.push({
          date: eventDate,
          periodLabel,
          sharesVested: sharesThisPeriod,
          cumulativeVested,
          cumulativeUnvested: grant.totalShares - cumulativeVested,
          isPast: new Date(eventDate) <= today,
        })
      }
    }

    // Fix rounding: adjust last event to match totalShares exactly
    if (events.length > 0) {
      const diff = grant.totalShares - events[events.length - 1].cumulativeVested
      if (diff !== 0) {
        const last = events[events.length - 1]
        last.sharesVested += diff
        last.cumulativeVested += diff
        last.cumulativeUnvested = 0
      }
    }

    return events
  }

  // --- Regular vesting ---
  const periodMonths = VESTING_PERIOD_MONTHS[grant.vestingType] ?? 3
  const numPeriods = Math.floor(grant.durationMonths / periodMonths)

  if (numPeriods === 0) return []

  const baseSharesPerPeriod = Math.floor(grant.totalShares / numPeriods)
  const remainder = grant.totalShares - baseSharesPerPeriod * numPeriods

  const events: VestingEvent[] = []
  let cumulativeVested = 0

  for (let i = 1; i <= numPeriods; i++) {
    const eventDate = addMonths(grant.grantDate, i * periodMonths)
    const sharesThisPeriod = i === numPeriods ? baseSharesPerPeriod + remainder : baseSharesPerPeriod
    cumulativeVested += sharesThisPeriod

    events.push({
      date: eventDate,
      periodLabel: getPeriodLabel(eventDate, grant.vestingType, i),
      sharesVested: sharesThisPeriod,
      cumulativeVested,
      cumulativeUnvested: grant.totalShares - cumulativeVested,
      isPast: new Date(eventDate) <= today,
    })
  }

  return events
}

export interface MergedVestingEvent extends VestingEvent {
  grantId: string
  grantLabel: string
  ticker: string
}

/**
 * Merge vesting schedules from multiple grants into a single chronological timeline.
 * Cumulative columns reflect totals across ALL grants.
 */
export function mergeVestingSchedules(grants: Grant[]): MergedVestingEvent[] {
  const totalShares = grants.reduce((s, g) => s + g.totalShares, 0)
  const raw: MergedVestingEvent[] = []

  for (const grant of grants) {
    const events = calculateVestingSchedule(grant)
    const label = grantLabel(grant)
    for (const e of events) {
      raw.push({ ...e, grantId: grant.id, grantLabel: label, ticker: grant.ticker })
    }
  }

  raw.sort((a, b) => a.date.localeCompare(b.date))

  let cum = 0
  for (const e of raw) {
    cum += e.sharesVested
    e.cumulativeVested = cum
    e.cumulativeUnvested = totalShares - cum
  }

  return raw
}

/**
 * Combined summary across all grants
 */
export function getCombinedSummary(grants: Grant[]) {
  const totalShares = grants.reduce((s, g) => s + g.totalShares, 0)
  let vestedShares = 0
  let earliestDate: string | undefined

  for (const grant of grants) {
    const s = getVestingSummary(grant)
    vestedShares += s.vestedShares
    if (s.nextVesting && (!earliestDate || s.nextVesting.date < earliestDate)) {
      earliestDate = s.nextVesting.date
    }
  }

  // Sum shares from ALL grants that vest on the same earliest date
  let nextVesting: VestingEvent | undefined
  if (earliestDate) {
    let combinedShares = 0
    let cumulativeVested = 0
    for (const grant of grants) {
      const events = calculateVestingSchedule(grant)
      for (const e of events) {
        if (e.date === earliestDate && !e.isPast) {
          combinedShares += e.sharesVested
        }
      }
    }
    // Use vestedShares + combinedShares as a rough cumulative
    cumulativeVested = vestedShares + combinedShares
    nextVesting = {
      date: earliestDate,
      sharesVested: combinedShares,
      periodLabel: '',
      cumulativeVested,
      cumulativeUnvested: totalShares - cumulativeVested,
      isPast: false,
    }
  }

  return {
    vestedShares,
    unvestedShares: totalShares - vestedShares,
    totalShares,
    vestedPercent: totalShares > 0 ? (vestedShares / totalShares) * 100 : 0,
    nextVesting,
  }
}

/**
 * Get summary stats for a grant as of today
 */
export function getVestingSummary(grant: Grant) {
  const events = calculateVestingSchedule(grant)
  const vestedEvents = events.filter(e => e.isPast)
  const grossVested = vestedEvents.length > 0 ? vestedEvents[vestedEvents.length - 1].cumulativeVested : 0
  const totalSold = Object.values(grant.soldEvents ?? {}).reduce((s, n) => s + n, 0)
  const vestedShares = Math.max(0, grossVested - totalSold)  // net available in hand
  const unvestedShares = grant.totalShares - grossVested
  const nextVesting = events.find(e => !e.isPast)

  return {
    vestedShares,       // net: after subtracting sold shares
    grossVested,        // gross: total that have vested to date
    totalSold,
    unvestedShares,
    totalShares: grant.totalShares,
    vestedPercent: grant.totalShares > 0 ? (grossVested / grant.totalShares) * 100 : 0,
    nextVesting,
    completedPeriods: vestedEvents.length,
    totalPeriods: events.length,
  }
}
