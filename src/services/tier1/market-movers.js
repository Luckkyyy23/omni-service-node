/**
 * TIER 1 — Market Movers Service
 * Top gainers, losers, and most active stocks
 *
 * Sources (free, no auth):
 *   - Yahoo Finance predefined screeners: day_gainers, day_losers, most_actives
 */

import axios from "axios";

const YF_SCREENER = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved";

async function fetchScreener(scrId, count = 10) {
  const { data } = await axios.get(YF_SCREENER, {
    params: { scrIds: scrId, count },
    timeout: 10000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const quotes = data?.finance?.result?.[0]?.quotes || [];
  return quotes.map(q => ({
    symbol:        q.symbol,
    name:          q.shortName || q.longName || q.symbol,
    price:         q.regularMarketPrice,
    change:        +( q.regularMarketChange || 0).toFixed(2),
    changePct:     +( q.regularMarketChangePercent || 0).toFixed(2),
    volume:        q.regularMarketVolume,
    avgVolume:     q.averageDailyVolume3Month,
    marketCap:     q.marketCap || null,
    exchange:      q.exchange || null,
    sector:        q.sector || null,
  }));
}

function computeVolumeSurge(movers) {
  return movers
    .filter(m => m.avgVolume && m.volume > m.avgVolume * 2)
    .map(m => ({
      symbol:       m.symbol,
      volumeSurge:  +((m.volume / m.avgVolume) * 100 - 100).toFixed(0) + "%",
      volume:       m.volume,
    }))
    .sort((a, b) => parseFloat(b.volumeSurge) - parseFloat(a.volumeSurge));
}

export async function marketMovers(req, res) {
  const [gainers, losers, active] = await Promise.all([
    fetchScreener("day_gainers", 10).catch(() => []),
    fetchScreener("day_losers",  10).catch(() => []),
    fetchScreener("most_actives", 10).catch(() => []),
  ]);

  const allMovers   = [...gainers, ...losers, ...active];
  const volumeSurge = computeVolumeSurge(allMovers);

  const topGainer = gainers[0];
  const topLoser  = losers[0];

  res.json({
    status: "ok",
    summary: {
      topGainer:       topGainer ? `${topGainer.symbol} +${topGainer.changePct}%` : null,
      topLoser:        topLoser  ? `${topLoser.symbol} ${topLoser.changePct}%`    : null,
      marketBias:      gainers.length > losers.length ? "BULLISH" : "BEARISH",
    },
    gainers,
    losers,
    mostActive: active,
    volumeSurges: volumeSurge.slice(0, 5),
    meta: {
      sources:     ["query1.finance.yahoo.com screener"],
      generatedAt: new Date().toISOString(),
    },
  });
}
