const SHEETS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1-KZraAgxgWBBsgcWhqa5HAq7FZ1LKygIN4YplchdW5Y/export?format=csv'

export interface SheetsData {
  usdRate: number
  prices: Record<string, number> // ticker -> USD price
}

/** Clean a raw CSV cell: strip \r, whitespace, surrounding quotes */
function csvCell(raw = ''): string {
  return raw.replace(/\r/g, '').trim().replace(/^"(.*)"$/, '$1').trim()
}

/**
 * Fetch live prices + USD/ILS rate from the Google Sheet.
 * Sheet layout:
 *   Row 1 (index 0): headers — A=Ticker, B=Price, C=<label>
 *   Row 2 (index 1): first data row — C2 = USD/ILS rate
 *   Rows 3+ (index 2+): ticker rows — A=ticker, B=price USD
 *
 * Routes through allorigins.win proxy to avoid CORS issues.
 */
export async function fetchGoogleSheetsData(): Promise<SheetsData> {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(SHEETS_CSV_URL)}`
  const res = await fetch(proxyUrl, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sheets fetch failed: ${res.status}`)
  const text = await res.text()
  const rows = text.split('\n').map(r => r.split(',').map(csvCell))

  // USD rate is in C2 → rows[1][2]
  const usdRate = parseFloat(rows[1]?.[2] ?? '')
  if (isNaN(usdRate) || usdRate <= 0) {
    const preview = rows.slice(0, 3).map(r => r.join(' | ')).join(' // ')
    throw new Error(`לא נמצא שער דולר (C2). תצוגה: ${preview}`)
  }

  const prices: Record<string, number> = {}
  // Ticker rows start from row 2 (index 2) — but also check row 1 in case it has a ticker
  for (let i = 1; i < rows.length; i++) {
    const ticker = rows[i][0].toUpperCase()
    const price = parseFloat(rows[i][1])
    if (ticker && ticker.length > 0 && !isNaN(price) && price > 0) {
      prices[ticker] = price
    }
  }

  return { usdRate, prices }
}

/**
 * Fetch USD/ILS exchange rate — Frankfurter first, Google Sheet fallback.
 */
export async function fetchUsdIlsRate(): Promise<number> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=ILS')
    if (res.ok) {
      const data = await res.json()
      const rate = data?.rates?.ILS
      if (typeof rate === 'number' && rate > 0) return rate
    }
  } catch { /* fall through */ }

  return fetchStockPrice('USDILS=X')
}

/**
 * Fetch current stock price from Yahoo Finance via a CORS proxy.
 * Yahoo Finance blocks direct browser requests (CORS), so we route through allorigins.win.
 */
export async function fetchStockPrice(ticker: string): Promise<number> {
  const symbol = ticker.trim().toUpperCase()

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`

  let response: Response
  try {
    response = await fetch(proxyUrl)
  } catch {
    throw new Error(`שגיאת רשת בשליפת מחיר ${symbol}. בדוק את החיבור לאינטרנט.`)
  }

  if (!response.ok) {
    throw new Error(`שגיאה בשליפת מחיר עבור ${symbol} (HTTP ${response.status})`)
  }

  let data: any
  try {
    data = await response.json()
  } catch {
    throw new Error(`תגובה לא תקינה עבור ${symbol}`)
  }

  const price =
    data?.chart?.result?.[0]?.meta?.regularMarketPrice ??
    data?.chart?.result?.[0]?.meta?.previousClose

  if (!price || typeof price !== 'number') {
    throw new Error(`לא נמצא מחיר עבור הסימול ${symbol} — בדוק שהטיקר נכון`)
  }

  return price
}
