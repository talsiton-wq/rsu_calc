export type VestingType = 'quarterly' | 'trimesterly' | 'semiannual' | 'annual' | 'asymmetric'

export interface Grant {
  id: string
  ticker: string
  grantDate: string        // ISO date string
  grantPrice: number       // Price per share at grant ($)
  totalShares: number
  durationMonths: number
  vestingType: VestingType
  yearlyPercentages?: number[]  // for asymmetric: % per year, must sum to 100
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

  // Ordinary income portion
  ordinaryIncome: number
  ordinaryTax: number

  // Capital gain portion (only if >= 2 years)
  capitalGain: number
  capitalGainTax: number

  totalTax: number
  netProfit: number

  // Yisuph (surcharge) note
  yisufhSubjectAmount: number   // amount above threshold subject to extra 3%
}

export interface TaxSummary {
  totalSaleProceeds: number
  totalOrdinaryTax: number
  totalCapitalGainTax: number
  totalTax: number
  totalNetProfit: number
  finalTaxableIncome: number
  yisufhNote: number
  breakdowns: TaxBreakdown[]
}
