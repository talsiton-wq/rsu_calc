/**
 * Fetch current stock price from Yahoo Finance (unofficial endpoint).
 * Note: This is an unofficial API and may break if Yahoo changes it.
 */
export async function fetchStockPrice(ticker: string): Promise<number> {
  const symbol = ticker.trim().toUpperCase()

  // Use a CORS proxy since Yahoo Finance doesn't allow direct browser requests
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  })

  if (!response.ok) {
    throw new Error(`שגיאה בשליפת מחיר עבור ${symbol} (HTTP ${response.status})`)
  }

  const data = await response.json()

  const price =
    data?.chart?.result?.[0]?.meta?.regularMarketPrice ??
    data?.chart?.result?.[0]?.meta?.previousClose

  if (!price || typeof price !== 'number') {
    throw new Error(`לא נמצא מחיר עבור הסימול ${symbol}`)
  }

  return price
}
