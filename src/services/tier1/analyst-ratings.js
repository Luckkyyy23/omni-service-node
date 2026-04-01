/**
 * TIER 1 — Analyst Ratings Service
 * Recent upgrades/downgrades for major AI/tech stocks
 *
 * Sources (free, demo key):
 *   - Financial Modeling Prep upgrades-downgrades
 */

import axios from "axios";

const FMP_BASE = "https://financialmodelingprep.com/api/v3";
const FMP_KEY  = "demo";

const AI_TECH_SYMBOLS = new Set([
  "NVDA","MSFT","GOOGL","GOOG","META","AAPL","AMZN","TSLA","AMD","INTC",
  "ORCL","CRM","ADBE","NOW","PLTR","AI","PATH","UiPath","SNOW","DDOG",
  "MDB","CRWD","ZS","NET","OKTA","PANW","ABNB","UBER","LYFT","COIN",
]);

async function fetchRatings(symbol) {
  const { data } = await axios.get(`${FMP_BASE}/upgrades-downgrades`, {
    params: { symbol, apikey: FMP_KEY },
    timeout: 10000,
  });
  return Array.isArray(data) ? data : [];
}

async function fetchGeneralRatings() {
  const { data } = await axios.get(`${FMP_BASE}/upgrades-downgrades`, {
    params: { apikey: FMP_KEY },
    timeout: 10000,
  });
  return Array.isArray(data) ? data : [];
}

function classifyAction(item) {
  const newG = (item.newGrade || "").toLowerCase();
  const oldG = (item.previousGrade || item.priceWhen || "").toLowerCase();
  if (!item.action) {
    if (newG.includes("buy") || newG.includes("outperform") || newG.includes("overweight"))
      return "upgrade";
    if (newG.includes("sell") || newG.includes("underperform") || newG.includes("underweight"))
      return "downgrade";
    return "reiterate";
  }
  return (item.action || "").toLowerCase();
}

export async function analystRatings(req, res) {
  const { symbol } = req.query;

  let raw = [];
  if (symbol) {
    raw = await fetchRatings(symbol.toUpperCase()).catch(() => []);
  } else {
    raw = await fetchGeneralRatings().catch(() => []);
  }

  const ratings = raw
    .filter(r => !symbol || AI_TECH_SYMBOLS.has(r.symbol))
    .slice(0, 40)
    .map(r => ({
      symbol:     r.symbol,
      company:    r.companyName || r.symbol,
      action:     classifyAction(r),
      fromGrade:  r.previousGrade || null,
      toGrade:    r.newGrade || null,
      analyst:    r.gradingCompany || r.analystName || "Unknown",
      date:       r.publishedDate || r.date,
      priceTarget: r.priceTarget || null,
      signal: classifyAction(r) === "upgrade"   ? "POSITIVE"
             : classifyAction(r) === "downgrade" ? "NEGATIVE"
             : "NEUTRAL",
    }));

  const upgrades   = ratings.filter(r => r.action === "upgrade").length;
  const downgrades = ratings.filter(r => r.action === "downgrade").length;

  res.json({
    status: "ok",
    summary: {
      total:       ratings.length,
      upgrades,
      downgrades,
      reiterations: ratings.length - upgrades - downgrades,
      analystSentiment: upgrades > downgrades ? "BULLISH" : downgrades > upgrades ? "BEARISH" : "NEUTRAL",
    },
    ratings,
    meta: {
      sources:     ["financialmodelingprep.com (demo)"],
      generatedAt: new Date().toISOString(),
    },
  });
}
