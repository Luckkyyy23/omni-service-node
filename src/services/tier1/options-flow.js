/**
 * TIER 1 — Options Flow Service
 * Unusual options activity — large bets detected by volume/OI ratio
 *
 * Sources (free, no auth):
 *   - Yahoo Finance /v7/finance/options — SPY, QQQ, AAPL, NVDA, TSLA
 */

import axios from "axios";

const YF_OPTIONS = "https://query1.finance.yahoo.com/v7/finance/options";
const TICKERS    = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA"];

async function fetchOptions(ticker) {
  const { data } = await axios.get(`${YF_OPTIONS}/${ticker}`, {
    timeout: 10000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const result = data?.optionChain?.result?.[0];
  if (!result) return { ticker, calls: [], puts: [] };
  const options  = result.options?.[0] || {};
  return {
    ticker,
    currentPrice: result.quote?.regularMarketPrice,
    calls:        options.calls || [],
    puts:         options.puts  || [],
  };
}

function scoreUnusual(contract, type, underlyingPrice) {
  const volume = contract.volume || 0;
  const oi     = contract.openInterest || 1;
  const ratio  = volume / oi;
  if (ratio < 3 || volume < 500) return null;

  const strike    = contract.strike;
  const expiry    = new Date(contract.expiration * 1000).toISOString().split("T")[0];
  const premium   = (contract.lastPrice || 0) * volume * 100;
  const itm       = type === "call" ? strike <= underlyingPrice : strike >= underlyingPrice;
  const signal    = type === "call" ? "BULLISH" : "BEARISH";

  return {
    type:       type.toUpperCase(),
    strike,
    expiry,
    volume,
    openInterest: oi,
    volOiRatio:   +ratio.toFixed(2),
    premium:      +premium.toFixed(0),
    impliedVolatility: contract.impliedVolatility
      ? +(contract.impliedVolatility * 100).toFixed(1) + "%"
      : null,
    inTheMoney: itm,
    signal,
  };
}

export async function optionsFlow(req, res) {
  const results = await Promise.allSettled(TICKERS.map(fetchOptions));

  const unusual = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { ticker, currentPrice, calls, puts } = r.value;
    for (const c of calls) {
      const scored = scoreUnusual(c, "call", currentPrice);
      if (scored) unusual.push({ ticker, ...scored });
    }
    for (const p of puts) {
      const scored = scoreUnusual(p, "put", currentPrice);
      if (scored) unusual.push({ ticker, ...scored });
    }
  }

  unusual.sort((a, b) => b.premium - a.premium);

  const bullishCount = unusual.filter(u => u.signal === "BULLISH").length;
  const bearishCount = unusual.filter(u => u.signal === "BEARISH").length;
  const bias = bullishCount > bearishCount * 1.5 ? "BULLISH"
    : bearishCount > bullishCount * 1.5 ? "BEARISH"
    : "NEUTRAL";

  res.json({
    status: "ok",
    summary: {
      unusualCount:  unusual.length,
      bullishFlows:  bullishCount,
      bearishFlows:  bearishCount,
      marketBias:    bias,
    },
    unusualActivity: unusual.slice(0, 30),
    meta: {
      sources:     ["query1.finance.yahoo.com/v7/finance/options"],
      tickers:     TICKERS,
      generatedAt: new Date().toISOString(),
    },
  });
}
