/**
 * TIER 1 — Virtuals Protocol Service
 * Virtuals Protocol AI agent token ecosystem data
 *
 * Sources (free, no auth):
 *   - CoinGecko /coins/virtual-protocol
 *   - CoinGecko /coins/markets?category=virtuals-protocol-ecosystem
 */

import axios from "axios";

const CG_BASE = "https://api.coingecko.com/api/v3";

async function fetchVirtualToken() {
  const { data } = await axios.get(`${CG_BASE}/coins/virtual-protocol`, {
    params: {
      localization: false,
      tickers:      false,
      market_data:  true,
      community_data: true,
      developer_data: false,
    },
    timeout: 10000,
  });
  return data;
}

async function fetchEcosystemTokens() {
  const { data } = await axios.get(`${CG_BASE}/coins/markets`, {
    params: {
      vs_currency: "usd",
      category:    "virtuals-protocol-ecosystem",
      order:       "market_cap_desc",
      per_page:    25,
      page:        1,
      price_change_percentage: "24h,7d",
    },
    timeout: 10000,
  });
  return Array.isArray(data) ? data : [];
}

function momentumLabel(pct24h, pct7d) {
  if (pct24h > 10 && pct7d > 20) return "STRONG_BULL";
  if (pct24h > 3  || pct7d > 8)  return "BULLISH";
  if (pct24h < -10 && pct7d < -20) return "STRONG_BEAR";
  if (pct24h < -3  || pct7d < -8)  return "BEARISH";
  return "NEUTRAL";
}

export async function virtualsProtocol(req, res) {
  const [virtual, ecosystem] = await Promise.all([
    fetchVirtualToken().catch(() => null),
    fetchEcosystemTokens().catch(() => []),
  ]);

  const md = virtual?.market_data || {};

  const virtualSummary = virtual ? {
    id:             virtual.id,
    name:           virtual.name,
    symbol:         virtual.symbol?.toUpperCase(),
    price:          md.current_price?.usd,
    change24h:      md.price_change_percentage_24h?.toFixed(2),
    change7d:       md.price_change_percentage_7d?.toFixed(2),
    marketCap:      md.market_cap?.usd,
    volume24h:      md.total_volume?.usd,
    circulatingSupply: md.circulating_supply,
    ath:            md.ath?.usd,
    athChangePercent: md.ath_change_percentage?.usd?.toFixed(2),
    momentum:       momentumLabel(
      md.price_change_percentage_24h,
      md.price_change_percentage_7d
    ),
    description:    virtual.description?.en?.slice(0, 300) || null,
  } : null;

  const agentTokens = ecosystem.map(t => ({
    id:          t.id,
    name:        t.name,
    symbol:      t.symbol?.toUpperCase(),
    price:       t.current_price,
    change24h:   t.price_change_percentage_24h?.toFixed(2),
    change7d:    t.price_change_percentage_7d_in_currency?.toFixed(2),
    marketCap:   t.market_cap,
    volume24h:   t.total_volume,
    rank:        t.market_cap_rank,
    momentum:    momentumLabel(t.price_change_percentage_24h, t.price_change_percentage_7d_in_currency),
  }));

  const totalEcoVol = agentTokens.reduce((a, t) => a + (t.volume24h || 0), 0);
  const trending    = agentTokens.filter(t => t.momentum === "BULLISH" || t.momentum === "STRONG_BULL");

  res.json({
    status: "ok",
    virtual: virtualSummary,
    ecosystem: {
      totalTokens:       agentTokens.length,
      totalVolume24hUsd: +totalEcoVol.toFixed(0),
      trendingCount:     trending.length,
      tokens:            agentTokens,
      topTrending:       trending.slice(0, 5),
    },
    meta: {
      sources:     ["api.coingecko.com/api/v3 (virtual-protocol, virtuals-protocol-ecosystem)"],
      generatedAt: new Date().toISOString(),
    },
  });
}
