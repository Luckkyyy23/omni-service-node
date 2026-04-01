/**
 * TIER 1 — Crypto Derivatives Service
 * Funding rates, open interest, and derivatives market overview
 *
 * Sources (free, no auth):
 *   - CoinGecko /derivatives — funding rates, OI per contract
 *   - CoinGecko /derivatives/exchanges — exchange-level data
 */

import axios from "axios";

const CG_BASE = "https://api.coingecko.com/api/v3";

async function fetchDerivatives() {
  const { data } = await axios.get(`${CG_BASE}/derivatives`, {
    params: { per_page: 100 },
    timeout: 10000,
  });
  return Array.isArray(data) ? data : [];
}

async function fetchDerivativeExchanges() {
  const { data } = await axios.get(`${CG_BASE}/derivatives/exchanges`, {
    params: { order: "open_interest_btc_desc", per_page: 10 },
    timeout: 10000,
  });
  return Array.isArray(data) ? data : [];
}

function extractFunding(contracts, baseSymbol) {
  const relevant = contracts.filter(c =>
    c.base?.toUpperCase() === baseSymbol.toUpperCase() &&
    c.contract_type === "perpetual"
  );
  if (!relevant.length) return null;
  const avgFunding = relevant.reduce((a, c) => a + (Number(c.funding_rate) || 0), 0) / relevant.length;
  const avgOI      = relevant.reduce((a, c) => a + (Number(c.open_interest_usd) || 0), 0);
  return {
    symbol:       baseSymbol,
    avgFundingRatePct: +(avgFunding * 100).toFixed(4),
    annualizedFundingPct: +(avgFunding * 100 * 3 * 365).toFixed(2),
    totalOpenInterestUsd: +avgOI.toFixed(0),
    contracts:    relevant.length,
    bias:         avgFunding > 0.01  ? "LONG_HEAVY"
                : avgFunding < -0.01 ? "SHORT_HEAVY"
                : "NEUTRAL",
  };
}

export async function cryptoDerivatives(req, res) {
  const [contracts, exchanges] = await Promise.all([
    fetchDerivatives().catch(() => []),
    fetchDerivativeExchanges().catch(() => []),
  ]);

  const btc = extractFunding(contracts, "BTC");
  const eth = extractFunding(contracts, "ETH");
  const sol = extractFunding(contracts, "SOL");

  const totalOI = exchanges.reduce((a, e) => a + (Number(e.open_interest_btc) || 0), 0);

  const topExchanges = exchanges.slice(0, 8).map(e => ({
    name:           e.name,
    openInterestBtc: e.open_interest_btc,
    tradeVolume24hBtc: e.trade_volume_24h_btc,
    perpetualPairs: e.number_of_perpetual_pairs || null,
    yearVolumeChange: e.trade_volume_24h_btc_normalized ? +e.trade_volume_24h_btc_normalized.toFixed(2) : null,
  }));

  const overallBias = [btc?.bias, eth?.bias, sol?.bias].filter(Boolean);
  const longHeavy   = overallBias.filter(b => b === "LONG_HEAVY").length;
  const shortHeavy  = overallBias.filter(b => b === "SHORT_HEAVY").length;
  const marketBias  = longHeavy > shortHeavy ? "LONG_HEAVY"
    : shortHeavy > longHeavy ? "SHORT_HEAVY"
    : "NEUTRAL";

  res.json({
    status: "ok",
    summary: {
      totalOpenInterestBtc: +totalOI.toFixed(2),
      marketBias,
      note: marketBias === "LONG_HEAVY"
        ? "Funding positive — longs paying shorts. Squeeze risk if price drops."
        : marketBias === "SHORT_HEAVY"
        ? "Funding negative — shorts paying longs. Squeeze risk if price rises."
        : "Funding neutral — balanced positioning.",
    },
    fundingRates: { btc, eth, sol },
    exchanges: topExchanges,
    meta: {
      sources:     ["api.coingecko.com/api/v3/derivatives"],
      generatedAt: new Date().toISOString(),
    },
  });
}
