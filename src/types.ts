export type VestingType = 'quarterly' | 'trimesterly' | 'semiannual' | 'annual' | 'asymmetric'

export interface Grant {
  id: string
  ticker: string
  grantDate: string        // ISO date string
  grantPrice: number       // Price per share at grant ($)
  totalShares: number
  durationMonths: number
  vestingType: VestingType
  yearlyPercentages?: number[]    // for asymmetric: % per year, must sum to 100
  yearlyVestingTypes?: VestingType[] // for asymmetric: vesting frequency per year (annual/quarterly/etc.)
  soldEvents?: Record<string, number>  // eventDate (ISO) → shares sold from that event
}

export interface VestingEvent {
  date: string             // ISO date string
  periodLabel: string      // e.g. "Q1 2023"
  sharesVested: number
  cumulativeVested: number
  cumulativeUnvested: number
  isPast: boolean
}

export interface SaleSimulationInput {
  grantId: string
  sharesToSell: number
}

export interface TaxBreakdown {
  grantId: string
  grantLabel: string
  sharesToSell: number
  currentPrice: number
  saleProceeds: number
  yearsFromGrant: number
  isTwoYearsPassed: boolean

  // Base income before this grant (for cumulative bracket display)
  baseIncome: number

  // Ordinary income portion
  ordinaryIncome: number
  ordinaryTax: number

  // Capital gain portion (only if >= 2 years)
  capitalGain: number
  capitalGainTax: number

  totalTax: number
  netProfit: number
  bituachLeumi: number   // National Insurance on ordinary income portion

  // Yisuph (surcharge) — 3% surtax on income above threshold
  yisufhSubjectAmount: number   // marginal amount of THIS grant (ordinary+capgain) above threshold
  yisufhTax: number             // yisufhSubjectAmount * 0.03
  yisufhHoniSubjectAmount: number // marginal capital-gain above threshold (for 2% honi)
  yisufhHoniTax: number           // yisufhHoniSubjectAmount * 0.02
}

export interface TaxSummary {
  totalSaleProceeds: number
  totalOrdinaryTax: number
  totalCapitalGainTax: number
  totalTax: number
  totalBituachLeumi: number
  totalNetProfit: number
  finalTaxableIncome: number
  yisufhNote: number           // total income above threshold (for info)
  totalYisufhTax: number       // 3% portion, already included in totalTax
  totalYisufhHoniTax: number   // 2% honi portion, already included in totalTax
  breakdowns: TaxBreakdown[]
}
