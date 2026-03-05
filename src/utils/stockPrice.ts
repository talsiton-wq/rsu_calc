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
