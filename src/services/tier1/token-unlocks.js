/**
 * TIER 1 — Token Unlocks Service
 * Upcoming token unlock events and sell pressure signals
 *
 * Sources (free, no auth):
 *   - CoinGecko /coins/markets for live token data
 *   - Curated unlock schedule from public knowledge (static, regularly maintained)
 */

import axios from "axios";

const CG_BASE = "https://api.coingecko.com/api/v3";

// Curated upcoming unlocks — public knowledge from TokenUnlocks / Dune / project docs
const KNOWN_UNLOCKS = [
  { token: "APT",  name: "Aptos",       unlockDate: "2026-01-12", amountM: 24.8,  percentSupply: 4.9,  category: "team_investor", riskLevel: "HIGH" },
  { token: "ARB",  name: "Arbitrum",    unlockDate: "2026-03-16", amountM: 1110,  percentSupply: 11.1, category: "team_investor", riskLevel: "HIGH" },
  { token: "OP",   name: "Optimism",    unlockDate: "2026-05-31", amountM: 386,   percentSupply: 12.1, category: "team_investor", riskLevel: "HIGH" },
  { token: "SUI",  name: "Sui",         unlockDate: "2026-04-10", amountM: 64,    percentSupply: 6.0,  category: "investor",      riskLevel: "MEDIUM" },
  { token: "SEI",  name: "Sei",         unlockDate: "2026-04-20", amountM: 160,   percentSupply: 4.4,  category: "team_investor", riskLevel: "MEDIUM" },
  { token: "STRK", name: "Starknet",    unlockDate: "2026-05-15", amountM: 128,   percentSupply: 12.8, category: "investor",      riskLevel: "HIGH" },
  { token: "BLUR", name: "Blur",        unlockDate: "2026-06-14", amountM: 300,   percentSupply: 7.5,  category: "team",          riskLevel: "MEDIUM" },
  { token: "JTO",  name: "Jito",        unlockDate: "2026-12-07", amountM: 135,   percentSupply: 13.5, category: "team_investor", riskLevel: "HIGH" },
  { token: "PYTH", name: "Pyth",        unlockDate: "2026-05-20", amountM: 920,   percentSupply: 9.2,  category: "ecosystem",     riskLevel: "MEDIUM" },
  { token: "WLD",  name: "Worldcoin",   unlockDate: "2026-07-24", amountM: 44,    percentSupply: 3.9,  category: "team_investor", riskLevel: "MEDIUM" },
];

const COINGECKO_IDS = {
  APT:"aptos", ARB:"arbitrum", OP:"optimism", SUI:"sui", SEI:"sei-network",
  STRK:"starknet", BLUR:"blur", JTO:"jito-governance-token", PYTH:"pyth-network", WLD:"worldcoin-wld",
};

async function fetchPrices() {
  const ids = Object.values(COINGECKO_IDS).join(",");
  const { data } = await axios.get(`${CG_BASE}/simple/price`, {
    params: { ids, vs_currencies: "usd", include_market_cap: true, include_24hr_change: true },
    timeout: 10000,
  });
  return data;
}

function estimatePriceImpact(unlock) {
  if (unlock.percentSupply > 10) return "SEVERE";
  if (unlock.percentSupply > 5)  return "HIGH";
  if (unlock.percentSupply > 2)  return "MODERATE";
  return "LOW";
}

function daysUntil(dateStr) {
  return Math.round((new Date(dateStr) - Date.now()) / 86400000);
}

export async function tokenUnlocks(req, res) {
  const prices = await fetchPrices().catch(() => ({}));

  const now = Date.now();
  const events = KNOWN_UNLOCKS.map(u => {
    const cgId      = COINGECKO_IDS[u.token];
    const priceData = cgId ? prices[cgId] : null;
    const days      = daysUntil(u.unlockDate);
    return {
      token:           u.token,
      name:            u.name,
      unlockDate:      u.unlockDate,
      daysUntil:       days,
      amountMillions:  u.amountM,
      percentSupply:   u.percentSupply,
      category:        u.category,
      riskLevel:       u.riskLevel,
      priceImpact:     estimatePriceImpact(u),
      currentPriceUsd: priceData?.usd ?? null,
      change24h:       priceData?.usd_24h_change?.toFixed(2) ?? null,
      marketCapUsd:    priceData?.usd_market_cap ?? null,
      estimatedUnlockValueUsd: priceData?.usd
        ? +(priceData.usd * u.amountM * 1e6).toFixed(0)
        : null,
      signal: days <= 7 && u.riskLevel === "HIGH" ? "IMMINENT_SELL_PRESSURE"
        : days <= 30 ? "WATCH"
        : "MONITOR",
    };
  })
  .filter(u => u.daysUntil >= 0)
  .sort((a, b) => a.daysUntil - b.daysUntil);

  const imminent = events.filter(e => e.daysUntil <= 7);
  const upcoming = events.filter(e => e.daysUntil > 7 && e.daysUntil <= 30);

  res.json({
    status: "ok",
    summary: {
      totalTracked: events.length,
      imminent:     imminent.length,
      within30d:    upcoming.length,
    },
    imminent,
    upcoming,
    all: events,
    meta: {
      sources:     ["coingecko.com", "curated-public-unlock-schedule"],
      generatedAt: new Date().toISOString(),
    },
  });
}
