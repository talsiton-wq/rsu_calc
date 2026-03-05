import type { Grant, VestingEvent, VestingType } from '../types'

export const VESTING_TYPE_LABELS: Record<VestingType, string> = {
  quarterly: 'רבעוני (כל 3 חודשים)',
  semiannual: 'חצי שנתי (כל 6 חודשים)',
  annual: 'שנתי (כל 12 חודשים)',
}

export const VESTING_PERIOD_MONTHS: Record<VestingType, number> = {
  quarterly: 3,
  semiannual: 6,
  annual: 12,
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
  const periodMonths = VESTING_PERIOD_MONTHS[grant.vestingType]
  const numPeriods = Math.floor(grant.durationMonths / periodMonths)

  if (numPeriods === 0) return []

  const baseSharesPerPeriod = Math.floor(grant.totalShares / numPeriods)
  const remainder = grant.totalShares - baseSharesPerPeriod * numPeriods

  const events: VestingEvent[] = []
  let cumulativeVested = 0
  const today = new Date()

  for (let i = 1; i <= numPeriods; i++) {
    const eventDate = addMonths(grant.grantDate, i * periodMonths)
    // Give the last period the remainder shares
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

/**
 * Get summary stats for a grant as of today
 */
export function getVestingSummary(grant: Grant) {
  const events = calculateVestingSchedule(grant)
  const vestedEvents = events.filter(e => e.isPast)
  const vestedShares = vestedEvents.length > 0 ? vestedEvents[vestedEvents.length - 1].cumulativeVested : 0
  const unvestedShares = grant.totalShares - vestedShares
  const nextVesting = events.find(e => !e.isPast)

  return {
    vestedShares,
    unvestedShares,
    totalShares: grant.totalShares,
    vestedPercent: grant.totalShares > 0 ? (vestedShares / grant.totalShares) * 100 : 0,
    nextVesting,
    completedPeriods: vestedEvents.length,
    totalPeriods: events.length,
  }
}
