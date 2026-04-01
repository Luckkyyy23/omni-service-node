/**
 * TIER 1 — Sentiment Service
 * Real-time AI/crypto market sentiment aggregator
 *
 * Sources (all free, no auth for base):
 *   - Alternative.me Fear & Greed Index
 *   - CoinGecko global market + trending
 *   - CoinGecko asset-specific data
 *   - Virtuals Protocol token (VIRTUAL) price + momentum
 */

import axios from "axios";

const ASSET_IDS = {
  BTC:     "bitcoin",
  ETH:     "ethereum",
  VIRTUAL: "virtual-protocol",
  GOLD:    "pax-gold",
  SOL:     "solana",
  AI:      "fetch-ai",
  NEAR:    "near",
};

// Alternative.me Fear & Greed (real API, no auth)
async function fetchFearGreed() {
  const { data } = await axios.get("https://api.alternative.me/fng/?limit=2&format=json", { timeout: 6000 });
  const [today, yesterday] = data.data || [];
  return {
    value: Number(today?.value || 0),
    classification: today?.value_classification || "Unknown",
    yesterday: Number(yesterday?.value || 0),
    trend: today?.value > yesterday?.value ? "IMPROVING" : today?.value < yesterday?.value ? "DETERIORATING" : "FLAT",
  };
}

// CoinGecko global market data (no auth)
async function fetchGlobalMarket() {
  const { data } = await axios.get("https://api.coingecko.com/api/v3/global", { timeout: 8000 });
  const d = data.data || {};
  return {
    totalMarketCapUsd: d.total_market_cap?.usd,
    totalVolumeUsd:    d.total_volume?.usd,
    btcDominance:      d.market_cap_percentage?.btc?.toFixed(1),
    ethDominance:      d.market_cap_percentage?.eth?.toFixed(1),
    activeCryptocurrencies: d.active_cryptocurrencies,
    marketCapChangePercent24h: d.market_cap_change_percentage_24h_usd?.toFixed(2),
  };
}

// CoinGecko trending (no auth)
async function fetchTrending() {
  const { data } = await axios.get("https://api.coingecko.com/api/v3/search/trending", { timeout: 8000 });
  return (data.coins || []).slice(0, 5).map(c => ({
    name: c.item?.name,
    symbol: c.item?.symbol,
    rank: c.item?.market_cap_rank,
    score: c.item?.score,
    priceChange24h: c.item?.data?.price_change_percentage_24h?.usd?.toFixed(2),
    sparkline: c.item?.data?.sparkline,
  }));
}

// CoinGecko price for requested assets
async function fetchAssetPrices(symbols = []) {
  const ids = symbols
    .map(s => ASSET_IDS[s.toUpperCase()])
    .filter(Boolean)
    .join(",");
  if (!ids) return {};
  const { data } = await axios.get(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
    { timeout: 8000 }
  );
  const result = {};
  for (const [sym, id] of Object.entries(ASSET_IDS)) {
    if (data[id]) {
      result[sym] = {
        price: data[id].usd,
        change24h: data[id].usd_24h_change?.toFixed(2),
        volume24h: data[id].usd_24h_vol,
        marketCap: data[id].usd_market_cap,
        signal: data[id].usd_24h_change > 2 ? "BULLISH" : data[id].usd_24h_change < -2 ? "BEARISH" : "NEUTRAL",
      };
    }
  }
  return result;
}

// Compute overall AI/agent sector sentiment score
function computeSectorScore(fearGreed, global, assetPrices) {
  let score = fearGreed.value; // 0-100
  const change = Number(global.marketCapChangePercent24h || 0);
  score += change * 2;
  if (assetPrices.VIRTUAL?.change24h > 0) score += 5;
  if (assetPrices.AI?.change24h > 0) score += 5;
  score = Math.max(0, Math.min(100, score));
  const label =
    score >= 75 ? "EXTREME GREED" :
    score >= 55 ? "GREED" :
    score >= 45 ? "NEUTRAL" :
    score >= 25 ? "FEAR" :
    "EXTREME FEAR";
  return { score: Math.round(score), label };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function sentiment(req, res) {
  const { assets = "BTC,VIRTUAL,GOLD" } = req.query;
  const requestedSymbols = assets.split(",").map(s => s.trim().toUpperCase());

  const [fearGreed, globalMarket, trending, assetPrices] = await Promise.all([
    fetchFearGreed().catch(() => ({ value: 50, classification: "Neutral", trend: "FLAT" })),
    fetchGlobalMarket().catch(() => ({})),
    fetchTrending().catch(() => []),
    fetchAssetPrices(requestedSymbols).catch(() => ({})),
  ]);

  const sector = computeSectorScore(fearGreed, globalMarket, assetPrices);

  res.json({
    status: "ok",
    fearGreed,
    sector,
    globalMarket,
    assets: assetPrices,
    trending,
    agentRecommendation: {
      signal: sector.score > 60 ? "RISK_ON" : sector.score < 40 ? "RISK_OFF" : "HOLD",
      confidence: Math.abs(sector.score - 50) / 50,
      note: `Market is in ${sector.label} with ${fearGreed.trend} momentum`,
    },
    meta: { sources: ["alternative.me/fng", "coingecko.com/api/v3"], generatedAt: new Date().toISOString() },
  });
}
