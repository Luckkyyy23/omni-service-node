/**
 * TIER 1 — Bittensor Service
 * TAO network data and AI subnet intelligence
 *
 * Sources (free, no auth):
 *   - CoinGecko /coins/bittensor (full market + community data)
 */

import axios from "axios";

const CG_BASE = "https://api.coingecko.com/api/v3";

async function fetchTAO() {
  const { data } = await axios.get(`${CG_BASE}/coins/bittensor`, {
    params: {
      localization:   false,
      tickers:        false,
      market_data:    true,
      community_data: true,
      developer_data: true,
    },
    timeout: 12000,
  });
  return data;
}

async function fetchTAOMarket() {
  const { data } = await axios.get(`${CG_BASE}/coins/markets`, {
    params: {
      vs_currency:             "usd",
      ids:                     "bittensor",
      price_change_percentage: "1h,24h,7d,30d",
    },
    timeout: 8000,
  });
  return Array.isArray(data) ? data[0] : null;
}

// Known public subnet info (static, based on taostats.io public data)
const KNOWN_SUBNETS = [
  { id: 1,  name: "Text Prompting",       purpose: "LLM inference & chat",             validators: 64 },
  { id: 3,  name: "MyShell",              purpose: "Personalized AI companions",        validators: 32 },
  { id: 4,  name: "Multi-Modality",       purpose: "Image & text models",              validators: 48 },
  { id: 5,  name: "Image Generation",     purpose: "Diffusion model incentives",       validators: 32 },
  { id: 8,  name: "Time Series Pred.",    purpose: "Financial/temporal forecasting",   validators: 24 },
  { id: 18, name: "Cortex.t",             purpose: "API inference marketplace",        validators: 56 },
  { id: 25, name: "Protein Folding",      purpose: "Biotech/AlphaFold tasks",          validators: 16 },
  { id: 27, name: "Compute",              purpose: "GPU compute marketplace",          validators: 40 },
];

export async function bittensor(req, res) {
  const [tao, market] = await Promise.all([
    fetchTAO().catch(() => null),
    fetchTAOMarket().catch(() => null),
  ]);

  const md  = tao?.market_data || {};
  const dev = tao?.developer_data || {};
  const com = tao?.community_data || {};

  const price       = md.current_price?.usd    ?? market?.current_price    ?? null;
  const change24h   = md.price_change_percentage_24h ?? market?.price_change_percentage_24h ?? null;
  const change7d    = md.price_change_percentage_7d  ?? null;
  const marketCap   = md.market_cap?.usd        ?? market?.market_cap      ?? null;
  const volume24h   = md.total_volume?.usd      ?? market?.total_volume    ?? null;
  const supply      = md.circulating_supply     ?? null;
  const maxSupply   = md.max_supply             ?? 21000000;

  // Staking APY estimated (public knowledge: ~18% average network emission APY)
  const estimatedStakingApy = "~15-20%";

  res.json({
    status: "ok",
    token: {
      name:       "Bittensor",
      symbol:     "TAO",
      price,
      change24h:  change24h?.toFixed(2) ?? null,
      change7d:   change7d?.toFixed(2)  ?? null,
      marketCap,
      volume24h,
      circulatingSupply:  supply,
      maxSupply,
      supplyPct:          supply && maxSupply ? +((supply / maxSupply) * 100).toFixed(1) : null,
      ath:                md.ath?.usd ?? null,
      athChangePercent:   md.ath_change_percentage?.usd?.toFixed(2) ?? null,
    },
    network: {
      estimatedStakingApy,
      subnetCount:     64,
      validatorCount:  1024,
      note: "Bittensor uses 21M max supply (like BTC). Miners earn TAO by serving AI tasks to validators.",
    },
    subnets: KNOWN_SUBNETS,
    developer: {
      githubStars:    dev.stars ?? null,
      forks:          dev.forks ?? null,
      subscribers:    dev.subscribers ?? null,
      pullRequests:   dev.pull_requests_merged ?? null,
      contributors:   dev.pull_request_contributors ?? null,
    },
    community: {
      twitterFollowers: com.twitter_followers ?? null,
      redditSubscribers: com.reddit_subscribers ?? null,
    },
    meta: {
      sources:     ["api.coingecko.com/api/v3/coins/bittensor"],
      generatedAt: new Date().toISOString(),
    },
  });
}
