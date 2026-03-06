import type { Grant, TaxBreakdown, TaxSummary, SaleSimulationInput } from '../types'

// Israeli income tax brackets 2025 (annual, in ₪)
export const TAX_BRACKETS = [
  { min: 0,       max: 81_480,    rate: 0.10 },
  { min: 81_480,  max: 116_760,   rate: 0.14 },
  { min: 116_760, max: 187_440,   rate: 0.20 },
  { min: 187_440, max: 260_520,   rate: 0.31 },
  { min: 260_520, max: 542_160,   rate: 0.35 },
  { min: 542_160, max: 698_280,   rate: 0.47 },
  { min: 698_280, max: Infinity,  rate: 0.50 },
]

// Bituach Leumi + Bituach Briut (employee) 2025 (annual, in ₪)
// Low bracket (0–90,264): 3.5% | High bracket (90,264–588,360): 12% | Above ceiling: exempt
export const BL_BRACKETS = [
  { min: 0,       max: 90_264,   rate: 0.035, label: '3.5% (ב"ל 0.4% + בריאות 3.1%)' },
  { min: 90_264,  max: 588_360,  rate: 0.12,  label: '12% (ב"ל 7% + בריאות 5%)' },
  { min: 588_360, max: Infinity, rate: 0,     label: 'פטור (מעל תקרה)' },
]

export const BL_CEILING = 588_360  // annual ceiling

// Additional 3% surtax (mas yisuph) on income above this threshold
export const YISUPH_THRESHOLD = 721_560

export const CAPITAL_GAIN_RATE = 0.25

/**
 * Calculate total income tax on a given annual income (crosses brackets correctly)
 */
export function calculateIncomeTax(income: number): number {
  let tax = 0
  for (const bracket of TAX_BRACKETS) {
    if (income <= bracket.min) break
    const taxableInThisBracket = Math.min(income, bracket.max) - bracket.min
    tax += taxableInThisBracket * bracket.rate
    if (income <= bracket.max) break
  }
  return tax
}

/**
 * Calculate marginal income tax on additional income, given a base income.
 * Correctly handles crossing multiple brackets.
 */
export function calculateMarginalTax(baseIncome: number, additionalIncome: number): number {
  return calculateIncomeTax(baseIncome + additionalIncome) - calculateIncomeTax(baseIncome)
}

/**
 * Calculate total Bituach Leumi + Bituach Briut on a given annual income
 */
export function calculateBituachLeumi(income: number): number {
  const capped = Math.min(income, BL_CEILING)
  let total = 0
  for (const b of BL_BRACKETS) {
    if (capped <= b.min) break
    const taxable = Math.min(capped, b.max) - b.min
    total += taxable * b.rate
    if (capped <= b.max) break
  }
  return total
}

/**
 * Calculate marginal Bituach Leumi on additional income, given a base income.
 * Only applies to the ordinary income portion (not capital gain).
 */
export function calculateMarginalBL(baseIncome: number, additionalIncome: number): number {
  return calculateBituachLeumi(baseIncome + additionalIncome) - calculateBituachLeumi(baseIncome)
}

/**
 * Returns the effective marginal tax rate for the next shekel of income
 */
export function getMarginalRate(income: number): number {
  for (const bracket of TAX_BRACKETS) {
    if (income < bracket.max) return bracket.rate
  }
  return 0.50
}

/**
 * Calculate the tax breakdown for selling shares from a single grant.
 * Income tax marginal calculation crosses multiple brackets automatically.
 */
export function calculateGrantTax(
  grant: Grant,
  sharesToSell: number,
  currentPrice: number,
  annualIncome: number
): TaxBreakdown {
  const today = new Date()
  const grantDate = new Date(grant.grantDate)
  const twoYearsAfterGrant = new Date(grantDate)
  twoYearsAfterGrant.setFullYear(twoYearsAfterGrant.getFullYear() + 2)

  const msPerYear = 1000 * 60 * 60 * 24 * 365.25
  const yearsFromGrant = (today.getTime() - grantDate.getTime()) / msPerYear
  const isTwoYearsPassed = today >= twoYearsAfterGrant

  const saleProceeds = sharesToSell * currentPrice

  let ordinaryIncome: number
  let capitalGain: number
  let ordinaryTax: number
  let capitalGainTax: number

  if (!isTwoYearsPassed) {
    // Less than 2 years: all proceeds are ordinary income (מס פירותי)
    ordinaryIncome = saleProceeds
    capitalGain = 0
    ordinaryTax = calculateMarginalTax(annualIncome, ordinaryIncome)
    capitalGainTax = 0
  } else {
    // 2+ years: split — up to grant price is ordinary income, above is capital gain.
    // If currentPrice < grantPrice, entire proceeds are ordinary income (no capital gain).
    ordinaryIncome = sharesToSell * Math.min(currentPrice, grant.grantPrice)
    capitalGain = Math.max(0, sharesToSell * (currentPrice - grant.grantPrice))
    ordinaryTax = calculateMarginalTax(annualIncome, ordinaryIncome)
    capitalGainTax = capitalGain * CAPITAL_GAIN_RATE
  }

  // Bituach Leumi applies only to the ordinary income portion
  const bituachLeumi = calculateMarginalBL(annualIncome, ordinaryIncome)

  const totalTax = ordinaryTax + capitalGainTax
  const netProfit = saleProceeds - totalTax - bituachLeumi

  // Calculate amount subject to yisuph surcharge
  const totalIncomeAfterSale = annualIncome + ordinaryIncome
  const yisufhSubjectAmount = Math.max(0, totalIncomeAfterSale - YISUPH_THRESHOLD)

  return {
    grantId: grant.id,
    grantLabel: grant.ticker ?? grant.grantDate,
    sharesToSell,
    currentPrice,
    saleProceeds,
    yearsFromGrant,
    isTwoYearsPassed,
    ordinaryIncome,
    ordinaryTax,
    capitalGain,
    capitalGainTax,
    totalTax,
    bituachLeumi,
    netProfit,
    yisufhSubjectAmount,
  }
}

/**
 * Calculate full tax summary for all grants being sold
 */
export function calculateTaxSummary(
  grants: Grant[],
  saleInputs: SaleSimulationInput[],
  currentPrice: number,
  annualIncome: number
): TaxSummary {
  const breakdowns: TaxBreakdown[] = []
  let runningIncome = annualIncome

  for (const input of saleInputs) {
    if (input.sharesToSell <= 0) continue
    const grant = grants.find(g => g.id === input.grantId)
    if (!grant) continue

    const breakdown = calculateGrantTax(grant, input.sharesToSell, currentPrice, runningIncome)
    breakdowns.push(breakdown)

    // Stack ordinary income for next grant calculation (conservative approach)
    runningIncome += breakdown.ordinaryIncome
  }

  const totalSaleProceeds = breakdowns.reduce((s, b) => s + b.saleProceeds, 0)
  const totalOrdinaryTax = breakdowns.reduce((s, b) => s + b.ordinaryTax, 0)
  const totalCapitalGainTax = breakdowns.reduce((s, b) => s + b.capitalGainTax, 0)
  const totalBituachLeumi = breakdowns.reduce((s, b) => s + b.bituachLeumi, 0)
  const totalTax = totalOrdinaryTax + totalCapitalGainTax
  const totalNetProfit = totalSaleProceeds - totalTax - totalBituachLeumi
  const finalTaxableIncome = runningIncome

  const yisufhNote = Math.max(0, finalTaxableIncome - YISUPH_THRESHOLD)

  return {
    totalSaleProceeds,
    totalOrdinaryTax,
    totalCapitalGainTax,
    totalBituachLeumi,
    totalTax,
    totalNetProfit,
    finalTaxableIncome,
    yisufhNote,
    breakdowns,
  }
}
