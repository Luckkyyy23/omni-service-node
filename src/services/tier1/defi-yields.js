/**
 * TIER 1 — DeFi Yields Service
 * Best yield opportunities across DeFi protocols
 *
 * Sources (free, no auth):
 *   - DeFi Llama Yields: https://yields.llama.fi/pools
 */

import axios from "axios";

const YIELDS_URL = "https://yields.llama.fi/pools";

async function fetchAllPools() {
  const { data } = await axios.get(YIELDS_URL, { timeout: 12000 });
  return data?.data || [];
}

function scorePool(pool) {
  let score = 0;
  if (pool.stablecoin)       score += 30;
  if (pool.tvlUsd > 1e8)    score += 20;
  else if (pool.tvlUsd > 1e7) score += 10;
  if (pool.apy > 20)         score += 15;
  else if (pool.apy > 10)    score += 10;
  else if (pool.apy > 5)     score += 5;
  if (pool.ilRisk === "NO")  score += 10;
  if (!pool.outlier)         score += 10;
  return score;
}

export async function defiYields(req, res) {
  const {
    minApy    = "5",
    minTvl    = "1000000",
    stable    = "false",
    chain     = "all",
    limit     = "20",
  } = req.query;

  const all = await fetchAllPools().catch(() => []);

  let filtered = all.filter(p =>
    p.apy   >= Number(minApy) &&
    p.tvlUsd >= Number(minTvl) &&
    !p.outlier
  );

  if (stable === "true") filtered = filtered.filter(p => p.stablecoin);
  if (chain !== "all")   filtered = filtered.filter(p => p.chain?.toLowerCase() === chain.toLowerCase());

  filtered.sort((a, b) => scorePool(b) - scorePool(a));

  const top = filtered.slice(0, Number(limit)).map(p => ({
    pool:       p.pool,
    project:    p.project,
    chain:      p.chain,
    symbol:     p.symbol,
    tvlUsd:     Math.round(p.tvlUsd),
    apy:        +p.apy.toFixed(2),
    apyBase:    p.apyBase  != null ? +p.apyBase.toFixed(2)  : null,
    apyReward:  p.apyReward != null ? +p.apyReward.toFixed(2) : null,
    stablecoin: p.stablecoin,
    ilRisk:     p.ilRisk || "UNKNOWN",
    score:      scorePool(p),
    url:        p.poolMeta || null,
  }));

  const stableYields = top.filter(p => p.stablecoin);
  const bestStable   = stableYields[0];
  const bestRisky    = top.find(p => !p.stablecoin);

  res.json({
    status: "ok",
    summary: {
      totalPoolsFound:   filtered.length,
      returned:          top.length,
      bestStablePool:    bestStable ? `${bestStable.project} ${bestStable.symbol} @ ${bestStable.apy}% APY` : null,
      bestHighYield:     bestRisky  ? `${bestRisky.project} ${bestRisky.symbol} @ ${bestRisky.apy}% APY`   : null,
    },
    pools: top,
    meta: {
      sources:     ["yields.llama.fi"],
      generatedAt: new Date().toISOString(),
    },
  });
}
