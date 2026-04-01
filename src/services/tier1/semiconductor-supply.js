/**
 * TIER 1 — Semiconductor Supply Chain Intelligence
 * AI chip demand signals from SOXX + key semiconductor equity prices.
 * Supply/demand thesis derived from price action across the value chain.
 *
 * Sources (free, no auth):
 *   Yahoo Finance chart API — https://query1.finance.yahoo.com/
 */
import axios from "axios";

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

const SEMI_UNIVERSE = {
  "SOXX": { name: "iShares Semiconductor ETF", role: "sector", type: "etf" },
  "NVDA": { name: "NVIDIA", role: "ai_gpu", type: "stock" },
  "AMD":  { name: "Advanced Micro Devices", role: "ai_gpu_cpu", type: "stock" },
  "INTC": { name: "Intel", role: "legacy_cpu", type: "stock" },
  "TSM":  { name: "Taiwan Semiconductor (TSMC)", role: "foundry", type: "stock" },
  "ASML": { name: "ASML Holding", role: "lithography_equipment", type: "stock" },
  "QCOM": { name: "Qualcomm", role: "mobile_ai", type: "stock" },
  "AMAT": { name: "Applied Materials", role: "wafer_equipment", type: "stock" },
};

async function fetchSymbolData(symbol) {
  try {
    const { data } = await axios.get(`${YF_BASE}/${symbol}`, {
      params: { interval: "1d", range: "5d" },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OmniServiceNode/1.0)",
        "Accept": "application/json",
      },
      timeout: 10000,
    });

    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    const timestamps = result.timestamp || [];

    const valid = closes
      .map((c, i) => ({ close: c, volume: volumes[i], ts: timestamps[i] }))
      .filter(x => x.close != null && x.close > 0);

    if (valid.length === 0) return null;

    const latest = valid[valid.length - 1];
    const oldest = valid[0];
    const change5d = latest.close - oldest.close;
    const changePct5d = oldest.close > 0 ? (change5d / oldest.close) * 100 : 0;
    const avgVol = valid.reduce((s, x) => s + (x.volume || 0), 0) / valid.length;

    return {
      symbol,
      name: SEMI_UNIVERSE[symbol]?.name,
      role: SEMI_UNIVERSE[symbol]?.role,
      price: parseFloat(latest.close.toFixed(2)),
      change5d: parseFloat(change5d.toFixed(2)),
      changePct5d: parseFloat(changePct5d.toFixed(2)),
      avgVolume5d: Math.round(avgVol),
      marketCap: meta.marketCap ?? null,
      currency: meta.currency || "USD",
      marketState: meta.marketState,
    };
  } catch {
    return null;
  }
}

function deriveSupplyThesis(stocks) {
  const nvda = stocks.find(s => s?.symbol === "NVDA");
  const tsm = stocks.find(s => s?.symbol === "TSM");
  const asml = stocks.find(s => s?.symbol === "ASML");
  const soxx = stocks.find(s => s?.symbol === "SOXX");
  const intc = stocks.find(s => s?.symbol === "INTC");

  const aiLeadersUp = [nvda, asml].filter(s => s && s.changePct5d > 0).length;
  const foundryUp = tsm && tsm.changePct5d > 0;
  const legacyDown = intc && intc.changePct5d < 0;
  const sectorTrend = soxx?.changePct5d ?? 0;

  let aiDemandSignal = "NEUTRAL";
  if (nvda && nvda.changePct5d > 3) aiDemandSignal = "STRONG_AI_DEMAND";
  else if (nvda && nvda.changePct5d > 0 && foundryUp) aiDemandSignal = "AI_DEMAND_BUILDING";
  else if (nvda && nvda.changePct5d < -3) aiDemandSignal = "AI_DEMAND_COOLING";

  let supplySignal = "BALANCED";
  if (asml && asml.changePct5d > 2 && foundryUp) supplySignal = "SUPPLY_EXPANSION";
  else if (asml && asml.changePct5d < -2) supplySignal = "EQUIPMENT_DEMAND_FALLING";

  return {
    aiDemandSignal,
    supplySignal,
    sectorMomentum: sectorTrend > 1 ? "BULLISH" : sectorTrend < -1 ? "BEARISH" : "NEUTRAL",
    aiVsLegacyRotation: aiLeadersUp >= 1 && legacyDown ? "ROTATING_TO_AI" : "MIXED",
    thesis:
      aiDemandSignal === "STRONG_AI_DEMAND"
        ? "AI hyperscaler capex driving outsized GPU/HBM demand. TSMC advanced nodes fully allocated."
        : aiDemandSignal === "AI_DEMAND_COOLING"
        ? "Potential AI spending plateau. Watch for guidance cuts from hyperscalers."
        : "Semiconductor cycle in normalization. AI segment outperforming legacy compute.",
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function semiconductorSupply(req, res) {
  const symbols = Object.keys(SEMI_UNIVERSE);
  const results = await Promise.allSettled(symbols.map(s => fetchSymbolData(s)));
  const stocks = results.map(r => (r.status === "fulfilled" ? r.value : null));
  const validStocks = stocks.filter(Boolean);

  const thesis = deriveSupplyThesis(validStocks);

  // Sort by 5-day performance
  const byPerformance = [...validStocks].sort((a, b) => (b.changePct5d || 0) - (a.changePct5d || 0));

  const sectorAvgChange = validStocks.length > 0
    ? parseFloat(
        (validStocks.reduce((s, x) => s + (x.changePct5d || 0), 0) / validStocks.length).toFixed(2)
      )
    : null;

  res.json({
    status: "ok",
    summary: {
      signal: thesis.aiDemandSignal,
      supplySignal: thesis.supplySignal,
      sectorMomentum: thesis.sectorMomentum,
      aiVsLegacyRotation: thesis.aiVsLegacyRotation,
      sectorAvgChange5d: sectorAvgChange,
      symbolsTracked: validStocks.length,
    },
    thesis: thesis.thesis,
    stocks: validStocks,
    topPerformers: byPerformance.slice(0, 3),
    laggards: byPerformance.slice(-3).reverse(),
    keyMetrics: {
      nvdaPrice: validStocks.find(s => s.symbol === "NVDA")?.price ?? null,
      nvdaChange5d: validStocks.find(s => s.symbol === "NVDA")?.changePct5d ?? null,
      tsmPrice: validStocks.find(s => s.symbol === "TSM")?.price ?? null,
      soxxPrice: validStocks.find(s => s.symbol === "SOXX")?.price ?? null,
      soxxChange5d: validStocks.find(s => s.symbol === "SOXX")?.changePct5d ?? null,
    },
    meta: {
      sources: ["Yahoo Finance (SOXX, NVDA, AMD, INTC, TSM, ASML, QCOM, AMAT)"],
      generatedAt: new Date().toISOString(),
    },
  });
}
