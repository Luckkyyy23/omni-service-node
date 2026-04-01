/**
 * TIER 1 — Insider Trades Service
 * Recent Form 4 SEC insider buy/sell filings
 *
 * Sources (free, no auth):
 *   - SEC EDGAR EFTS full-text search for Form 4
 *   - SEC EDGAR ATOM feed for recent Form 4 filings
 */

import axios from "axios";

const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index";
const EDGAR_ATOM   = "https://www.sec.gov/cgi-bin/browse-edgar";

async function fetchRecentForm4() {
  const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const endDate   = new Date().toISOString().split("T")[0];
  const { data }  = await axios.get(EDGAR_SEARCH, {
    params: {
      q:         "form 4",
      forms:     "4",
      dateRange: "custom",
      startdt:   startDate,
      enddt:     endDate,
    },
    timeout: 12000,
    headers: {
      "User-Agent": "OmniServiceNode research@omni-service.io",
      "Accept":     "application/json",
    },
  });
  return data.hits?.hits || [];
}

function parseDisplayName(str = "") {
  const parts  = str.split(/\s{2,}\(/);
  const name   = parts[0]?.trim() || str;
  const ticker = str.match(/\(([A-Z]{1,5})\)\s+\(CIK/)?.[1] || null;
  return { name, ticker };
}

function classifyTransaction(description = "") {
  const desc = description.toLowerCase();
  if (desc.includes("purchase") || desc.includes("acqui") || desc.includes("buy"))
    return "BUY";
  if (desc.includes("sale") || desc.includes("sell") || desc.includes("dispos"))
    return "SELL";
  return "OTHER";
}

function parseHits(hits = []) {
  return hits.map(h => {
    const src  = h._source || {};
    const { name: company, ticker } = parseDisplayName(src.display_names?.[0] || "");
    const insiderRaw = src.display_names?.[1] || src.display_names?.[0] || "";
    const { name: insiderName } = parseDisplayName(insiderRaw);
    const txType = classifyTransaction(src.file_description || "");
    const cik    = src.ciks?.[0] || "";
    return {
      filingId:    h._id,
      company,
      ticker,
      insider:     insiderName,
      cik,
      filedAt:     src.file_date,
      transactionType: txType,
      description: src.file_description || null,
      signal:      txType === "BUY" ? "INSIDER_BULLISH" : txType === "SELL" ? "INSIDER_BEARISH" : "NEUTRAL",
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=5`,
    };
  });
}

export async function insiderTrades(req, res) {
  const { type = "all" } = req.query;

  const hits   = await fetchRecentForm4().catch(() => []);
  let trades   = parseHits(hits);

  if (type === "buy")  trades = trades.filter(t => t.transactionType === "BUY");
  if (type === "sell") trades = trades.filter(t => t.transactionType === "SELL");

  const buys  = trades.filter(t => t.transactionType === "BUY").length;
  const sells = trades.filter(t => t.transactionType === "SELL").length;
  const ratio = buys + sells > 0 ? +((buys / (buys + sells)) * 100).toFixed(1) : null;

  res.json({
    status: "ok",
    summary: {
      total:     trades.length,
      buys,
      sells,
      buyRatioPct: ratio,
      insiderSentiment: ratio != null
        ? ratio > 60 ? "BULLISH" : ratio < 40 ? "BEARISH" : "NEUTRAL"
        : "UNKNOWN",
    },
    trades: trades.slice(0, 25),
    meta: {
      sources:     ["SEC EDGAR EFTS search-index", "Form 4 filings"],
      generatedAt: new Date().toISOString(),
    },
  });
}
