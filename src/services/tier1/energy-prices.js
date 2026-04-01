/**
 * TIER 1 — Energy Prices Service
 * WTI crude, Brent, natural gas, gasoline, heating oil — 5-day price + change.
 * Critical context for macro traders, inflation models, and energy sector analysis.
 *
 * Sources (free, no auth):
 *   Yahoo Finance chart API — https://query1.finance.yahoo.com/
 */
import axios from "axios";

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

const ENERGY_SYMBOLS = {
  "CL=F": { name: "WTI Crude Oil", unit: "USD/bbl" },
  "BZ=F": { name: "Brent Crude Oil", unit: "USD/bbl" },
  "NG=F": { name: "Natural Gas", unit: "USD/MMBtu" },
  "RB=F": { name: "RBOB Gasoline", unit: "USD/gal" },
  "HO=F": { name: "Heating Oil", unit: "USD/gal" },
};

async function fetchEnergyPrice(symbol) {
  try {
    const { data } = await axios.get(`${YF_BASE}/${encodeURIComponent(symbol)}`, {
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
    const timestamps = result.timestamp || [];

    // Filter out null closes
    const validCloses = closes
      .map((c, i) => ({ close: c, ts: timestamps[i] }))
      .filter(x => x.close != null && x.close > 0);

    if (validCloses.length === 0) return null;

    const latest = validCloses[validCloses.length - 1];
    const oldest = validCloses[0];
    const change5d = latest.close - oldest.close;
    const changePct5d = oldest.close > 0 ? (change5d / oldest.close) * 100 : 0;

    return {
      symbol,
      name: ENERGY_SYMBOLS[symbol]?.name,
      unit: ENERGY_SYMBOLS[symbol]?.unit,
      price: parseFloat(latest.close.toFixed(3)),
      currency: meta.currency || "USD",
      change5d: parseFloat(change5d.toFixed(3)),
      changePct5d: parseFloat(changePct5d.toFixed(2)),
      priceDate: new Date(latest.ts * 1000).toISOString().split("T")[0],
      history5d: validCloses.map(x => ({
        date: new Date(x.ts * 1000).toISOString().split("T")[0],
        close: parseFloat(x.close.toFixed(3)),
      })),
      marketState: meta.marketState,
    };
  } catch {
    return null;
  }
}

function deriveEnergySignal(wti, brent, natgas) {
  if (!wti && !brent) return "DATA_UNAVAILABLE";
  const crude = wti?.price || brent?.price || 0;
  const change = wti?.changePct5d || brent?.changePct5d || 0;
  if (crude > 100 && change > 2) return "ENERGY_SUPPLY_SHOCK";
  if (crude > 90 && change > 1) return "ELEVATED_INFLATIONARY_PRESSURE";
  if (crude < 60 || change < -5) return "DEMAND_CONTRACTION";
  if (change > 3) return "BULLISH_BREAKOUT";
  if (change < -3) return "BEARISH_BREAKDOWN";
  return "CONSOLIDATING";
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function energyPrices(req, res) {
  const symbols = Object.keys(ENERGY_SYMBOLS);
  const results = await Promise.allSettled(symbols.map(s => fetchEnergyPrice(s)));

  const priceMap = {};
  results.forEach((r, i) => {
    const sym = symbols[i];
    priceMap[sym] = r.status === "fulfilled" ? r.value : null;
  });

  const wti = priceMap["CL=F"];
  const brent = priceMap["BZ=F"];
  const natgas = priceMap["NG=F"];
  const gasoline = priceMap["RB=F"];
  const heatOil = priceMap["HO=F"];

  const signal = deriveEnergySignal(wti, brent, natgas);

  // Crack spread proxy (gasoline - crude, simplified)
  const crackSpread =
    wti && gasoline
      ? parseFloat(((gasoline.price * 42) - wti.price).toFixed(2))
      : null;

  res.json({
    status: "ok",
    summary: {
      signal,
      wtiCrude: wti?.price ?? null,
      brentCrude: brent?.price ?? null,
      naturalGas: natgas?.price ?? null,
      gasoline: gasoline?.price ?? null,
      heatingOil: heatOil?.price ?? null,
      wtiChange5d: wti?.changePct5d ?? null,
      brentChange5d: brent?.changePct5d ?? null,
      crackSpreadProxy: crackSpread,
    },
    prices: {
      wti,
      brent,
      naturalGas: natgas,
      gasoline,
      heatingOil: heatOil,
    },
    analysis: {
      oilSpread: wti && brent ? parseFloat((brent.price - wti.price).toFixed(3)) : null,
      oilSpreadNote: "Brent-WTI spread — widening = supply stress in Europe/Asia",
      inflation: {
        oilInflationaryAbove: 90,
        natgasInflationaryAbove: 4,
        currentOilLevel: wti?.price || brent?.price || null,
        inflationary: (wti?.price || 0) > 90 || (brent?.price || 0) > 90,
      },
    },
    meta: {
      sources: ["Yahoo Finance (CL=F, BZ=F, NG=F, RB=F, HO=F)"],
      generatedAt: new Date().toISOString(),
    },
  });
}
