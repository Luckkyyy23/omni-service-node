/**
 * TIER 1 — NFT Market Service
 * Top NFT collections and market overview
 *
 * Sources (free, no auth):
 *   - CoinGecko /nfts/list + /nfts/{id}
 */

import axios from "axios";

const CG_BASE = "https://api.coingecko.com/api/v3";

async function fetchNFTList() {
  const { data } = await axios.get(`${CG_BASE}/nfts/list`, {
    params: { per_page: 30, page: 1 },
    timeout: 10000,
  });
  return Array.isArray(data) ? data : [];
}

async function fetchNFTDetail(id) {
  const { data } = await axios.get(`${CG_BASE}/nfts/${id}`, {
    timeout: 8000,
  });
  return data;
}

function summarizeNFT(detail) {
  if (!detail) return null;
  const fp    = detail.floor_price?.usd ?? null;
  const vol   = detail.volume_24h?.usd  ?? null;
  const cap   = detail.market_cap?.usd  ?? null;
  const ch24h = detail.floor_price_24h_percentage_change?.usd ?? null;
  return {
    id:              detail.id,
    name:            detail.name,
    symbol:          detail.symbol,
    blockchain:      detail.asset_platform_id,
    floorPriceUsd:   fp   != null ? +fp.toFixed(2)   : null,
    volume24hUsd:    vol  != null ? +vol.toFixed(0)  : null,
    marketCapUsd:    cap  != null ? +cap.toFixed(0)  : null,
    change24hPct:    ch24h != null ? +ch24h.toFixed(2) : null,
    totalSupply:     detail.total_supply ?? null,
    uniqueAddresses: detail.number_of_unique_addresses ?? null,
    signal:          ch24h != null
      ? ch24h > 5 ? "HOT" : ch24h < -5 ? "COOLING" : "STABLE"
      : "UNKNOWN",
  };
}

export async function nftMarket(req, res) {
  const list = await fetchNFTList().catch(() => []);

  // Fetch details for top 8 collections by list order (rate-limit friendly)
  const TOP_IDS = list.slice(0, 8).map(n => n.id);

  const details = await Promise.allSettled(TOP_IDS.map(fetchNFTDetail));

  const collections = details
    .map(r => r.status === "fulfilled" ? summarizeNFT(r.value) : null)
    .filter(Boolean);

  const totalVol = collections.reduce((a, c) => a + (c.volume24hUsd || 0), 0);
  const hotCollections = collections.filter(c => c.signal === "HOT").length;

  res.json({
    status: "ok",
    summary: {
      trackedCollections: collections.length,
      totalVolume24hUsd:  +totalVol.toFixed(0),
      hotCollections,
      marketSentiment:    hotCollections > collections.length / 2 ? "BULLISH" : "BEARISH",
    },
    collections,
    meta: {
      sources:     ["api.coingecko.com/api/v3/nfts"],
      generatedAt: new Date().toISOString(),
    },
  });
}
