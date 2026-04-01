/**
 * TIER 1 — Stablecoin Monitor Service
 * Stablecoin supply, peg health, and depeg alerts
 *
 * Sources (free, no auth):
 *   - DeFi Llama stablecoins: https://stablecoins.llama.fi/stablecoins?includePrices=true
 */

import axios from "axios";

const LLAMA_STABLE = "https://stablecoins.llama.fi/stablecoins?includePrices=true";

const KEY_STABLES = ["USDT","USDC","DAI","FRAX","BUSD","TUSD","USDP","GUSD","LUSD","crvUSD"];

async function fetchStablecoins() {
  const { data } = await axios.get(LLAMA_STABLE, { timeout: 12000 });
  return data?.peggedAssets || [];
}

function pegHealthStatus(price) {
  if (price == null) return "UNKNOWN";
  const dev = Math.abs(price - 1.0);
  if (dev > 0.05)  return "DEPEG_CRITICAL";
  if (dev > 0.02)  return "DEPEG_ALERT";
  if (dev > 0.005) return "WARNING";
  return "HEALTHY";
}

function formatSupply(n) {
  if (!n) return null;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

export async function stablecoinMonitor(req, res) {
  const all = await fetchStablecoins().catch(() => []);

  const stables = all.map(s => {
    const price      = s.price ?? null;
    const circUsd    = s.circulating?.peggedUSD ?? 0;
    const pegStatus  = pegHealthStatus(price);
    return {
      name:            s.name,
      symbol:          s.symbol,
      pegType:         s.pegType || "USD",
      pegMechanism:    s.pegMechanism || "unknown",
      price:           price != null ? +Number(price).toFixed(5) : null,
      deviation:       price != null ? +(Math.abs(price - 1.0) * 100).toFixed(3) + "%" : null,
      circulatingUsd:  +circUsd.toFixed(0),
      circulatingFmt:  formatSupply(circUsd),
      pegStatus,
      isAlert:         ["DEPEG_ALERT","DEPEG_CRITICAL"].includes(pegStatus),
      chains:          s.chains?.length || 0,
    };
  }).sort((a, b) => b.circulatingUsd - a.circulatingUsd);

  const keyStables  = stables.filter(s => KEY_STABLES.includes(s.symbol));
  const alerts      = stables.filter(s => s.isAlert);
  const totalSupply = stables.reduce((a, s) => a + s.circulatingUsd, 0);

  res.json({
    status: "ok",
    summary: {
      totalStablecoinSupplyUsd: +totalSupply.toFixed(0),
      totalFormatted:           formatSupply(totalSupply),
      trackedStablecoins:       stables.length,
      depegAlerts:              alerts.length,
      healthyPegs:              stables.filter(s => s.pegStatus === "HEALTHY").length,
      systemStatus:             alerts.length > 0 ? "ALERT" : "NORMAL",
    },
    alerts,
    keyStablecoins: keyStables,
    allStablecoins: stables.slice(0, 30),
    meta: {
      sources:     ["stablecoins.llama.fi"],
      generatedAt: new Date().toISOString(),
    },
  });
}
