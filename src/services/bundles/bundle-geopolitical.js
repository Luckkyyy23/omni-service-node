/**
 * BUNDLE — Geopolitical War Room Intelligence
 * Price: $200 USDC
 *
 * Everything an AI agent needs to trade the Iran-Israel conflict,
 * Trump policy moves, sanctions escalation, and oil supply disruption.
 *
 * Combines: geopolitical-crisis + sanctions + energy-prices + commodities
 *           + fx-rates + macro + signals + onchain
 */

import { geopoliticalCrisis } from "../tier2/geopolitical-crisis.js";
import { sanctions }           from "../tier1/sanctions.js";
import { energyPrices }        from "../tier1/energy-prices.js";
import { commodities }         from "../tier1/commodities.js";
import { fxRates }             from "../tier1/fx-rates.js";
import { macro }               from "../tier1/macro.js";
import { signals }             from "../tier1/signals.js";
import { onchain }             from "../tier1/onchain.js";
import { fearIndex }           from "../tier1/fear-index.js";

async function callService(handler, query = {}, body = {}) {
  return new Promise((resolve) => {
    const mockReq = { query, body };
    const mockRes = {
      json: (data) => resolve(data),
      status: () => ({ json: (data) => resolve(data) }),
    };
    Promise.resolve(handler(mockReq, mockRes)).catch(() => resolve({ status: "error" }));
  });
}

export async function bundleGeopolitical(req, res) {
  const startedAt = Date.now();

  const [
    crisis,
    energyData,
    commodsData,
    fxData,
    macroData,
    signalsData,
    onchainData,
    fearData,
  ] = await Promise.all([
    callService(geopoliticalCrisis),
    callService(energyPrices),
    callService(commodities),
    callService(fxRates),
    callService(macro),
    callService(signals, { symbol: "XAUUSD", tf: "1h" }),
    callService(onchain),
    callService(fearIndex),
  ]);

  // Crisis-aware composite signal
  const crisisLevel = crisis?.crisis?.level || "UNKNOWN";
  const crisisScore = crisis?.crisis?.score || 50;
  const fearScore   = fearData?.fearGreed?.value || 50;

  let compositeSignal = "NEUTRAL";
  let tradingThesis   = "";

  if (crisisLevel === "CRITICAL" || crisisScore >= 80) {
    compositeSignal = "RISK_OFF_MAXIMUM";
    tradingThesis   = "CRITICAL escalation detected. Buy gold, sell oil on supply shock, long USD, short equities. Watch LMT/RTX defense plays.";
  } else if (crisisLevel === "HIGH" || crisisScore >= 65) {
    compositeSignal = "RISK_OFF";
    tradingThesis   = "High geopolitical risk premium. Gold safe haven active. Oil elevated. Monitor Hormuz news flow for inflection.";
  } else if (fearScore < 25) {
    compositeSignal = "EXTREME_FEAR_BUY";
    tradingThesis   = "Geopolitical fear at extreme levels. Contrarian opportunity forming. Watch for ceasefire catalysts.";
  } else {
    compositeSignal = "ELEVATED_WATCH";
    tradingThesis   = "Geopolitical tensions elevated but not critical. Maintain risk controls. Monitor GDELT tone for escalation.";
  }

  res.json({
    status:  "ok",
    bundle:  "geopolitical-war-room",
    price:   "$200 USDC",
    elapsed: `${Date.now() - startedAt}ms`,

    warRoomBrief: {
      compositeSignal,
      tradingThesis,
      crisisLevel,
      crisisScore,
      fearGreedIndex: fearScore,
      immediateActions: crisis?.marketImpact || {},
    },

    data: {
      geopoliticalCrisis:  crisis,
      energyMarkets:        energyData,
      commodities:          commodsData,
      forexRates:           fxData,
      globalMacro:          macroData,
      tradingSignals:       signalsData,
      cryptoOnchain:        onchainData,
      fearGreed:            fearData,
    },

    meta: {
      bundle:      "geopolitical-war-room",
      servicesRan: 8,
      generatedAt: new Date().toISOString(),
    },
  });
}
