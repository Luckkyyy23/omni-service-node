/**
 * TIER 2 — SEC EDGAR AI Filings Service
 * Real-time 8-K filings from Fortune 500 mentioning AI/agentic pivots
 *
 * Source: SEC EDGAR Full-Text Search API (completely free, no auth)
 *   https://efts.sec.gov/LATEST/search-index
 *
 * Actual field names discovered from live API:
 *   display_names, ciks, adsh, file_date, form, root_forms, items, file_description
 */

import axios from "axios";

const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index";

// Extract company name, ticker from EDGAR display_names entry
// e.g. "UiPath, Inc.  (PATH)  (CIK 0001734722)" → { name: "UiPath, Inc.", ticker: "PATH" }
function parseDisplayName(displayName = "") {
  const parts = displayName.split(/\s{2,}\(/);
  const name   = parts[0]?.trim() || displayName;
  const ticker = displayName.match(/\(([A-Z]{1,5})\)\s+\(CIK/)?.[1] || null;
  return { name, ticker };
}

// Build EDGAR filing browse URL from CIK + accession number
function buildFilingUrl(cik, adsh) {
  const cikClean  = String(parseInt(cik, 10));           // strip leading zeros
  const adshClean = adsh?.replace(/-/g, "") || "";
  if (!cikClean || !adshClean) return null;
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikClean}&type=8-K&dateb=&owner=include&count=5`;
}

// Build direct filing URL from hit _id (format: "adsh:filename")
function buildDirectUrl(hitId = "", cik = "") {
  const [adsh, filename] = hitId.split(":");
  if (!adsh || !filename) return null;
  const cikNum    = String(parseInt(cik, 10));
  const adshClean = adsh.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${adshClean}/${filename}`;
}

// Score filing relevance for AI/agentic content using available fields
// (EDGAR search-index does not return file_text in responses)
function scoreFilingForAI(src, esScore = 0) {
  let score = 0;

  // Elasticsearch relevance score (normalized, max 20 pts)
  score += Math.min(20, esScore);

  // Item 8.01 = "Other Events" — major strategic announcements
  const items = src.items || [];
  if (items.includes("8.01")) score += 15;
  if (items.includes("8.02")) score += 5;

  // Description keyword matching
  const desc = (src.file_description || "").toLowerCase();
  if (desc.includes("agentic"))              score += 15;
  if (desc.includes("artificial intelligence")) score += 10;
  if (desc.includes("autonomous"))           score += 10;
  if (desc.includes("ai strategy"))          score += 8;
  if (desc.includes("machine learning"))     score += 6;
  if (desc.includes("llm") || desc.includes("large language")) score += 8;
  if (desc.includes("copilot"))              score += 5;
  if (desc.includes("generative"))           score += 8;

  // Tech SIC codes more likely to have AI content
  const sics = src.sics || [];
  if (sics.some(s => ["7372", "7371", "7379", "3674", "7374"].includes(s))) score += 5;

  return Math.min(100, Math.round(score));
}

// SEC EDGAR full-text search (real API, no auth required)
async function searchEdgar(query, forms = "8-K", days = 7) {
  const startDate = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  const endDate   = new Date().toISOString().split("T")[0];

  const { data } = await axios.get(EDGAR_SEARCH, {
    params: {
      // No quotes = keyword search (much broader recall than exact-phrase)
      q: query,
      dateRange: "custom",
      startdt: startDate,
      enddt:   endDate,
      forms,
    },
    timeout: 12000,
    headers: {
      // EDGAR requires a descriptive User-Agent; generic agents are blocked
      "User-Agent": "OmniServiceNode research@omni-service.io",
      "Accept": "application/json",
    },
  });

  return data.hits?.hits || [];
}

// Parse a raw EDGAR hit into a clean filing object
function parseHit(hit) {
  const src  = hit._source || {};
  const cik  = src.ciks?.[0] || "";
  const { name: company, ticker } = parseDisplayName(src.display_names?.[0] || "");

  return {
    filingId:    hit._id,
    company,
    ticker,
    cik,
    formType:    src.form || src.root_forms?.[0],
    filedAt:     src.file_date,
    description: src.file_description,
    items:       src.items || [],
    location:    src.biz_locations?.[0] || null,
    url:         buildDirectUrl(hit._id, cik),
    browseUrl:   buildFilingUrl(cik, src.adsh),
    aiScore:     scoreFilingForAI(src, hit._score),
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function secFilings(req, res) {
  const {
    query    = "agentic AI autonomous",
    days     = "7",
    forms    = "8-K",
    minScore = "0",
  } = req.query;

  // Run two queries in parallel: specific agentic + broader AI strategy
  const [agenticHits, strategyHits] = await Promise.all([
    searchEdgar("agentic AI autonomous agent", forms, Number(days)).catch(() => []),
    searchEdgar("artificial intelligence strategy investment", forms, Number(days)).catch(() => []),
  ]);

  // Deduplicate by filing ID
  const seen    = new Set();
  const allHits = [...agenticHits, ...strategyHits].filter(h => {
    if (seen.has(h._id)) return false;
    seen.add(h._id);
    return true;
  });

  const filings = allHits
    .map(parseHit)
    .filter(f => f.aiScore >= Number(minScore))
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, 20);

  // Company-level summary
  const topCompanies = [...new Set(filings.map(f => f.company).filter(Boolean))]
    .slice(0, 10)
    .map(name => {
      const co = filings.filter(f => f.company === name);
      return {
        name,
        ticker: co[0]?.ticker || null,
        filingCount: co.length,
        maxAiScore:  Math.max(...co.map(f => f.aiScore)),
        latestFiling: co[0]?.filedAt,
      };
    })
    .sort((a, b) => b.maxAiScore - a.maxAiScore);

  res.json({
    status:  "ok",
    query:   { query, forms, days: Number(days) },
    summary: {
      totalFilings:  filings.length,
      highRelevance: filings.filter(f => f.aiScore >= 20).length,
      topCompanies,
    },
    filings,
    meta: {
      source:      "SEC EDGAR Full-Text Search API",
      edgarSearch: "https://efts.sec.gov/LATEST/search-index",
      generatedAt: new Date().toISOString(),
    },
  });
}
