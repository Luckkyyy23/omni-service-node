/**
 * TIER 1 — FX Rates Service
 * Live exchange rates for 30+ currency pairs
 *
 * Sources (free, no auth):
 *   - Frankfurter API: https://api.frankfurter.app (ECB data, free)
 *   - Open Exchange Rates free: https://open.er-api.com/v6/latest/USD
 */

import axios from "axios";

const FRANKFURTER = "https://api.frankfurter.app";
const OPEN_ER     = "https://open.er-api.com/v6/latest/USD";

const MAJOR_PAIRS = ["EUR","GBP","JPY","CHF","AUD","CAD","NZD","SEK","NOK","DKK",
                     "SGD","HKD","CNY","MXN","BRL","ZAR","INR","KRW","TRY","PLN"];

async function fetchFrankfurter() {
  const { data } = await axios.get(`${FRANKFURTER}/latest`, {
    params: { base: "USD" },
    timeout: 8000,
  });
  return data;
}

async function fetchOpenER() {
  const { data } = await axios.get(OPEN_ER, { timeout: 8000 });
  return data;
}

function buildCrossPairs(rates) {
  const crosses = {};
  const eur = rates["EUR"];
  const gbp = rates["GBP"];
  if (eur && gbp) {
    crosses["EUR/GBP"] = +(eur / gbp).toFixed(5);
    crosses["GBP/EUR"] = +(gbp / eur).toFixed(5);
  }
  const jpy = rates["JPY"];
  if (eur && jpy) {
    crosses["EUR/JPY"] = +(eur * jpy).toFixed(3);
  }
  if (gbp && jpy) {
    crosses["GBP/JPY"] = +(gbp * jpy).toFixed(3);
  }
  return crosses;
}

function rankCurrencies(rates) {
  const entries = Object.entries(rates)
    .filter(([k]) => MAJOR_PAIRS.includes(k))
    .map(([symbol, rate]) => ({ symbol, rateVsUSD: rate }));

  entries.sort((a, b) => a.rateVsUSD - b.rateVsUSD);
  const strongest = entries.slice(0, 3).map(e => e.symbol);
  const weakest   = entries.slice(-3).map(e => e.symbol);
  return { strongest, weakest };
}

export async function fxRates(req, res) {
  const { base = "USD" } = req.query;

  const [ff, er] = await Promise.all([
    fetchFrankfurter().catch(() => null),
    fetchOpenER().catch(() => null),
  ]);

  const rates = ff?.rates || er?.rates || {};
  const source = ff ? "frankfurter.app" : er ? "open.er-api.com" : "none";

  const majorRates = {};
  for (const pair of MAJOR_PAIRS) {
    if (rates[pair]) majorRates[pair] = +Number(rates[pair]).toFixed(6);
  }

  const crosses   = buildCrossPairs(majorRates);
  const ranking   = rankCurrencies(majorRates);

  res.json({
    status: "ok",
    base:   ff?.base || "USD",
    date:   ff?.date || er?.time_last_update_utc?.split(" ").slice(0,4).join(" ") || new Date().toISOString().split("T")[0],
    rates:  majorRates,
    allRates: rates,
    crossPairs: crosses,
    ranking,
    meta: {
      sources:     [source],
      generatedAt: new Date().toISOString(),
    },
  });
}
