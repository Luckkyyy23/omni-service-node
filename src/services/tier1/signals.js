/**
 * TIER 1 — Market Signals Service
 * Real-time directional signals: Gold, BTC, ETH, FX pairs
 *
 * Sources (free, no auth):
 *   - Yahoo Finance unofficial API (Gold, BTC, FX)
 *   - CoinGecko (crypto OHLCV)
 *   - Frankfurter.app (FX rates — ECB data)
 *   - Alternative.me (market sentiment context)
 */

import axios from "axios";

const YAHOO_SYMBOLS = {
  XAUUSD: "GC=F",    // Gold Futures
  XAGUSD: "SI=F",    // Silver Futures
  BTCUSD: "BTC-USD",
  ETHUSD: "ETH-USD",
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "JPY=X",
  US500:  "^GSPC",
  DXY:    "DX-Y.NYB",
};

// Fetch Yahoo Finance chart data (unofficial but stable)
async function fetchYahooChart(ticker, interval = "5m", range = "1d") {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includeAdjustedClose=true`;
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const chart = data?.chart?.result?.[0];
    if (!chart) return null;
    const meta = chart.meta;
    const quotes = chart.indicators?.quote?.[0];
    const timestamps = chart.timestamp || [];
    if (!quotes || !timestamps.length) return null;

    const closes = quotes.close || [];
    const highs  = quotes.high  || [];
    const lows   = quotes.low   || [];
    const volumes = quotes.volume || [];
    const valid  = closes.map((c, i) => ({ c, h: highs[i], l: lows[i], v: volumes[i], t: timestamps[i] }))
                         .filter(x => x.c != null);

    return {
      symbol:      meta.symbol,
      currentPrice: meta.regularMarketPrice || valid[valid.length - 1]?.c,
      previousClose: meta.previousClose || meta.chartPreviousClose,
      currency:     meta.currency,
      candles:      valid.slice(-50),
    };
  } catch {
    return null;
  }
}

// CoinGecko OHLCV for crypto (no auth)
async function fetchCoinGeckoOHLCV(coinId, days = 1) {
  try {
    const { data } = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`,
      { timeout: 8000 }
    );
    return data; // [[timestamp, open, high, low, close], ...]
  } catch {
    return [];
  }
}

// Frankfurter ECB FX rates (completely free, no auth)
async function fetchFXRates(base = "USD") {
  try {
    const { data } = await axios.get(`https://api.frankfurter.app/latest?from=${base}`, { timeout: 6000 });
    return data.rates || {};
  } catch {
    return {};
  }
}

// Simple technical analysis — RSI, EMA, trend
function analyze(candles) {
  if (!candles || candles.length < 10) return { signal: "INSUFFICIENT_DATA", confidence: 0 };

  const closes = candles.map(c => c.c).filter(Boolean);
  const n = closes.length;

  // EMA calculation
  const ema = (period) => {
    const k = 2 / (period + 1);
    let e = closes[0];
    for (let i = 1; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
    return e;
  };

  // RSI
  const gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  const ema9  = ema(9);
  const ema21 = ema(21);
  const price = closes[n - 1];
  const prev  = closes[n - 2];

  // ATR
  const trValues = candles.slice(-14).map((c, i, arr) => {
    if (i === 0) return Math.abs((c.h || c.c) - (c.l || c.c));
    const prev = arr[i - 1];
    return Math.max(
      Math.abs((c.h || c.c) - (c.l || c.c)),
      Math.abs((c.h || c.c) - prev.c),
      Math.abs((c.l || c.c) - prev.c)
    );
  });
  const atr = trValues.reduce((a, b) => a + b, 0) / trValues.length;

  // Signal logic
  let signal = "HOLD";
  let confidence = 0.5;
  const conditions = { bullish: 0, bearish: 0 };

  if (ema9 > ema21) conditions.bullish++;  else conditions.bearish++;
  if (price > ema9)  conditions.bullish++;  else conditions.bearish++;
  if (rsi < 30)      { conditions.bullish += 2; }
  if (rsi > 70)      { conditions.bearish += 2; }
  if (price > prev)  conditions.bullish++;  else conditions.bearish++;

  if (conditions.bullish >= 3) { signal = "BUY";  confidence = 0.5 + conditions.bullish * 0.08; }
  if (conditions.bearish >= 3) { signal = "SELL"; confidence = 0.5 + conditions.bearish * 0.08; }
  confidence = Math.min(0.95, confidence);

  return {
    signal,
    confidence: Math.round(confidence * 100) / 100,
    rsi: Math.round(rsi * 10) / 10,
    ema9:  Math.round(ema9 * 100) / 100,
    ema21: Math.round(ema21 * 100) / 100,
    atr:   Math.round(atr * 100) / 100,
    entry: price,
    stopLoss:    signal === "BUY"  ? Math.round((price - atr * 1.5) * 100) / 100 :
                 signal === "SELL" ? Math.round((price + atr * 1.5) * 100) / 100 : null,
    takeProfit:  signal === "BUY"  ? Math.round((price + atr * 2.5) * 100) / 100 :
                 signal === "SELL" ? Math.round((price - atr * 2.5) * 100) / 100 : null,
    rrRatio:     2.5 / 1.5,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function signals(req, res) {
  const { symbol = "XAUUSD", tf = "5m" } = req.query;
  const symbolUpper = symbol.toUpperCase();
  const yahooTicker = YAHOO_SYMBOLS[symbolUpper] || symbolUpper;

  const [chart, fxRates] = await Promise.all([
    fetchYahooChart(yahooTicker, tf, tf === "1d" ? "5d" : "1d"),
    fetchFXRates("USD").catch(() => ({})),
  ]);

  if (!chart) {
    return res.status(502).json({ error: "Price data unavailable", symbol: symbolUpper });
  }

  const ta = analyze(chart.candles);

  res.json({
    status: "ok",
    symbol: symbolUpper,
    timeframe: tf,
    price: {
      current:       chart.currentPrice,
      previousClose: chart.previousClose,
      change:        chart.currentPrice && chart.previousClose
        ? Math.round((chart.currentPrice - chart.previousClose) * 100) / 100
        : null,
      changePct:     chart.currentPrice && chart.previousClose
        ? Math.round(((chart.currentPrice - chart.previousClose) / chart.previousClose) * 10000) / 100
        : null,
      currency: chart.currency || "USD",
    },
    signal: {
      direction:  ta.signal,
      confidence: ta.confidence,
      grade:      ta.confidence >= 0.85 ? "A" : ta.confidence >= 0.7 ? "B" : ta.confidence >= 0.55 ? "C" : "D",
      entry:      ta.entry,
      stopLoss:   ta.stopLoss,
      takeProfit: ta.takeProfit,
      rrRatio:    ta.rrRatio,
    },
    indicators: { rsi: ta.rsi, ema9: ta.ema9, ema21: ta.ema21, atr: ta.atr },
    fxContext: { EURUSD: fxRates.EUR, GBPUSD: fxRates.GBP, USDJPY: fxRates.JPY },
    meta: {
      candlesAnalyzed: chart.candles.length,
      sources: ["Yahoo Finance", "Frankfurter ECB"],
      generatedAt: new Date().toISOString(),
    },
  });
}
