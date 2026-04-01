/**
 * TIER 1 — AI Tokens Service
 * All AI-themed crypto tokens ranked and scored
 *
 * Sources (free, no auth):
 *   - CoinGecko /coins/markets?category=artificial-intelligence
 */

import axios from "axios";

const CG_BASE = "https://api.coingecko.com/api/v3";

async function fetchAITokens() {
  const { data } = await axios.get(`${CG_BASE}/coins/markets`, {
    params: {
      vs_currency:              "usd",
      category:                 "artificial-intelligence",
      order:                    "market_cap_desc",
      per_page:                 50,
      page:                     1,
      price_change_percentage:  "1h,24h,7d",
    },
    timeout: 12000,
  });
  return Array.isArray(data) ? data : [];
}

function momentumScore(pct1h = 0, pct24h = 0, pct7d = 0, volRatio = 1) {
  let score = 0;
  score += Math.max(-20, Math.min(20, pct24h * 2));
  score += Math.max(-10, Math.min(10, pct7d));
  score += Math.max(-5,  Math.min(5,  pct1h * 5));
  if (volRatio > 2) score += 10;
  if (volRatio > 5) score += 10;
  return Math.round(score);
}

function signalFromScore(score) {
  if (score >= 25)  return "STRONG_BUY";
  if (score >= 10)  return "BUY";
  if (score >= -10) return "HOLD";
  if (score >= -25) return "SELL";
  return "STRONG_SELL";
}

export async function aiTokens(req, res) {
  const raw = await fetchAITokens().catch(() => []);

  const tokens = raw.slice(0, 25).map(t => {
    const pct1h  = t.price_change_percentage_1h_in_currency  || 0;
    const pct24h = t.price_change_percentage_24h              || 0;
    const pct7d  = t.price_change_percentage_7d_in_currency  || 0;
    const volRatio = t.market_cap > 0
      ? (t.total_volume || 0) / (t.market_cap / 30)
      : 1;
    const score  = momentumScore(pct1h, pct24h, pct7d, volRatio);
    return {
      id:          t.id,
      name:        t.name,
      symbol:      t.symbol?.toUpperCase(),
      price:       t.current_price,
      change1h:    +pct1h.toFixed(2),
      change24h:   +pct24h.toFixed(2),
      change7d:    +pct7d.toFixed(2),
      marketCap:   t.market_cap,
      volume24h:   t.total_volume,
      rank:        t.market_cap_rank,
      ath:         t.ath,
      athPct:      t.ath_change_percentage?.toFixed(2),
      momentumScore: score,
      signal:      signalFromScore(score),
    };
  });

  const bullish     = tokens.filter(t => t.signal === "STRONG_BUY" || t.signal === "BUY");
  const bearish     = tokens.filter(t => t.signal === "STRONG_SELL" || t.signal === "SELL");
  const totalMarket = tokens.reduce((a, t) => a + (t.marketCap || 0), 0);
  const totalVol    = tokens.reduce((a, t) => a + (t.volume24h  || 0), 0);

  res.json({
    status: "ok",
    summary: {
      totalAITokens:         tokens.length,
      totalMarketCapUsd:     +totalMarket.toFixed(0),
      totalVolume24hUsd:     +totalVol.toFixed(0),
      bullishCount:          bullish.length,
      bearishCount:          bearish.length,
      sectorMomentum:        bullish.length > bearish.length ? "BULLISH" : bearish.length > bullish.length ? "BEARISH" : "NEUTRAL",
    },
    tokens,
    topMomentum: [...tokens].sort((a, b) => b.momentumScore - a.momentumScore).slice(0, 5),
    meta: {
      sources:     ["api.coingecko.com/api/v3 (category: artificial-intelligence)"],
      generatedAt: new Date().toISOString(),
    },
  });
}
