/**
 * TIER 1 — Commodities Prices Service
 * Real-time commodity prices via Yahoo Finance unofficial chart API
 *
 * Sources (free, no auth):
 *   - Yahoo Finance /v8/finance/chart — GC=F, CL=F, NG=F, ZW=F, ZC=F, SI=F, HG=F
 *   - Frankfurter API for USD base rates context
 */

import axios from "axios";

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

const COMMODITIES = {
  gold:       { symbol: "GC=F",  name: "Gold",          unit: "USD/oz" },
  silver:     { symbol: "SI=F",  name: "Silver",        unit: "USD/oz" },
  oil_wti:    { symbol: "CL=F",  name: "Crude Oil WTI", unit: "USD/bbl" },
  natgas:     { symbol: "NG=F",  name: "Natural Gas",   unit: "USD/MMBtu" },
  wheat:      { symbol: "ZW=F",  name: "Wheat",         unit: "USc/bu" },
  corn:       { symbol: "ZC=F",  name: "Corn",          unit: "USc/bu" },
  copper:     { symbol: "HG=F",  name: "Copper",        unit: "USD/lb" },
};

async function fetchYahooPrice(symbol) {
  const { data } = await axios.get(`${YF_BASE}/${encodeURIComponent(symbol)}`, {
    params: { interval: "1d", range: "5d" },
    timeout: 8000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const result = data?.chart?.result?.[0];
  if (!result) return null;
  const meta   = result.meta || {};
  const closes = result.indicators?.quote?.[0]?.close || [];
  const prev   = closes.filter(Boolean);
  const latest = meta.regularMarketPrice ?? prev[prev.length - 1];
  const prevClose = meta.chartPreviousClose ?? prev[prev.length - 2];
  const changePct = latest && prevClose
    ? +(((latest - prevClose) / prevClose) * 100).toFixed(2)
    : null;
  return {
    price:      latest ? +latest.toFixed(4) : null,
    prevClose:  prevClose ? +prevClose.toFixed(4) : null,
    changePct,
    currency:   meta.currency || "USD",
    marketState: meta.marketState || "unknown",
  };
}

export async function commodities(req, res) {
  const results = await Promise.allSettled(
    Object.entries(COMMODITIES).map(async ([key, cfg]) => {
      const d = await fetchYahooPrice(cfg.symbol);
      return [key, { ...cfg, ...d }];
    })
  );

  const prices = {};
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      const [key, val] = r.value;
      prices[key] = val;
    }
  }

  const signals = Object.entries(prices)
    .filter(([, v]) => v.changePct != null)
    .map(([key, v]) => ({
      commodity: key,
      signal: v.changePct > 1.5 ? "BULLISH" : v.changePct < -1.5 ? "BEARISH" : "NEUTRAL",
      changePct: v.changePct,
    }));

  res.json({
    status: "ok",
    prices,
    signals,
    meta: {
      sources:     ["query1.finance.yahoo.com"],
      generatedAt: new Date().toISOString(),
    },
  });
}
