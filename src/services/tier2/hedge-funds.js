/**
 * TIER 2 — Hedge Fund Positions Service
 * Latest 13F filings for major funds' tech/AI holdings
 *
 * Sources (free, no auth):
 *   - SEC EDGAR full-text search for 13F-HR filings
 */

import axios from "axios";

const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index";

// Well-known AI/tech-focused hedge funds and asset managers
const MAJOR_FUNDS = [
  "Bridgewater","Renaissance Technologies","Two Sigma","Citadel","Point72",
  "D.E. Shaw","Tiger Global","Coatue","Andreessen","Viking Global",
  "Lone Pine","Soros Fund","Baupost","Third Point","Pershing Square",
];

async function fetchRecent13F() {
  const startDate = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
  const endDate   = new Date().toISOString().split("T")[0];
  const { data }  = await axios.get(EDGAR_SEARCH, {
    params: {
      q:         "artificial intelligence NVIDIA Microsoft Alphabet technology",
      forms:     "13F-HR",
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
  return data?.hits?.hits || [];
}

async function fetchFundSearch(fundName) {
  const startDate = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
  const { data }  = await axios.get(EDGAR_SEARCH, {
    params: {
      q:         fundName,
      forms:     "13F-HR",
      dateRange: "custom",
      startdt:   startDate,
    },
    timeout: 10000,
    headers: {
      "User-Agent": "OmniServiceNode research@omni-service.io",
      "Accept":     "application/json",
    },
  });
  return (data?.hits?.hits || []).slice(0, 2);
}

function parseDisplayName(str = "") {
  const parts  = str.split(/\s{2,}\(/);
  const name   = parts[0]?.trim() || str;
  const ticker = str.match(/\(([A-Z]{1,5})\)\s+\(CIK/)?.[1] || null;
  return { name, ticker };
}

function parseFiling(hit) {
  const src  = hit._source || {};
  const { name } = parseDisplayName(src.display_names?.[0] || "");
  const cik   = src.ciks?.[0] || "";
  return {
    fund:        name,
    cik,
    filedAt:     src.file_date,
    formType:    src.form || "13F-HR",
    description: src.file_description || null,
    browseUrl:   `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=13F&dateb=&owner=include&count=5`,
    edgarUrl:    hit._id
      ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=13F-HR&dateb=&owner=include&count=5`
      : null,
  };
}

export async function hedgeFunds(req, res) {
  const { fund } = req.query;

  let hits = [];
  if (fund) {
    hits = await fetchFundSearch(fund).catch(() => []);
  } else {
    hits = await fetchRecent13F().catch(() => []);
  }

  const filings = hits.map(parseFiling);

  // Deduplicate by fund name
  const seen = new Set();
  const unique = filings.filter(f => {
    if (seen.has(f.fund)) return false;
    seen.add(f.fund);
    return true;
  });

  res.json({
    status: "ok",
    summary: {
      filingsFound:       unique.length,
      period:             "Last 90 days",
      note:               "13F filings are quarterly. Holdings data is inside the filing document at SEC EDGAR.",
      keyAIStocksWatched: ["NVDA","MSFT","GOOGL","META","AMZN","TSLA","AMD","ORCL","CRM","PLTR"],
    },
    filings: unique.slice(0, 20),
    knownMajorFunds: MAJOR_FUNDS,
    meta: {
      sources:     ["efts.sec.gov (13F-HR)"],
      generatedAt: new Date().toISOString(),
    },
  });
}
