/**
 * TIER 1 — Private Equity & Venture Capital Activity
 * SEC EDGAR Form D filings = private placements / VC & PE fundraising.
 * Form D must be filed within 15 days of first sale in a private offering.
 *
 * Sources (free, no auth):
 *   SEC EDGAR Full-Text Search — https://efts.sec.gov/
 *   SEC EDGAR EFTS — https://efts.sec.gov/LATEST/search-index?forms=D
 */
import axios from "axios";

const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index";
const EDGAR_HEADERS = {
  "User-Agent": "OmniServiceNode research@omni-service.io",
  "Accept": "application/json",
};

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().split("T")[0];
}

const today = () => new Date().toISOString().split("T")[0];

// Sector keyword detection from company/offering descriptions
const SECTOR_KEYWORDS = {
  "AI/ML": ["artificial intelligence", "machine learning", "neural", "llm", "generative", "ai"],
  "FinTech": ["fintech", "payments", "lending", "banking", "cryptocurrency", "blockchain"],
  "HealthTech": ["health", "medical", "pharma", "biotech", "clinical", "therapeutic"],
  "SaaS/Cloud": ["software", "saas", "cloud", "platform", "api", "developer"],
  "CleanTech": ["clean energy", "solar", "wind", "battery", "ev", "climate"],
  "Real Estate": ["real estate", "reit", "property", "mortgage", "housing"],
  "Defense/Gov": ["defense", "government", "military", "federal", "cyber"],
  "Consumer": ["consumer", "retail", "ecommerce", "marketplace", "brand"],
};

function classifySector(text) {
  if (!text) return "Other";
  const lower = text.toLowerCase();
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return sector;
  }
  return "Other";
}

async function fetchFormDFilings(lookbackDays = 7) {
  try {
    const { data } = await axios.get(EDGAR_SEARCH, {
      params: {
        forms: "D",
        dateRange: "custom",
        startdt: daysAgo(lookbackDays),
        enddt: today(),
      },
      headers: EDGAR_HEADERS,
      timeout: 15000,
    });

    const hits = data?.hits?.hits || [];
    const total = data?.hits?.total?.value || hits.length;

    return { hits, total };
  } catch {
    return { hits: [], total: 0 };
  }
}

async function fetchFormDWithKeyword(keyword, lookbackDays = 7) {
  try {
    const { data } = await axios.get(EDGAR_SEARCH, {
      params: {
        q: `"${keyword}"`,
        forms: "D",
        dateRange: "custom",
        startdt: daysAgo(lookbackDays),
        enddt: today(),
      },
      headers: EDGAR_HEADERS,
      timeout: 12000,
    });
    return data?.hits?.total?.value || 0;
  } catch {
    return 0;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function privateEquity(req, res) {
  const { days = 7 } = req.query;
  const lookback = Math.min(30, Math.max(1, parseInt(days) || 7));

  const [formDResult, aiCountResult, fintechCountResult, healthCountResult] = await Promise.allSettled([
    fetchFormDFilings(lookback),
    fetchFormDWithKeyword("artificial intelligence", lookback),
    fetchFormDWithKeyword("fintech", lookback),
    fetchFormDWithKeyword("biotech", lookback),
  ]);

  const formD = formDResult.status === "fulfilled" ? formDResult.value : { hits: [], total: 0 };
  const aiCount = aiCountResult.status === "fulfilled" ? aiCountResult.value : 0;
  const fintechCount = fintechCountResult.status === "fulfilled" ? fintechCountResult.value : 0;
  const healthCount = healthCountResult.status === "fulfilled" ? healthCountResult.value : 0;

  // Process filings
  const filings = formD.hits.map(h => {
    const source = h._source || {};
    return {
      id: h._id,
      company: source.entity_name || source.company_name || "Unknown",
      filedAt: source.file_date,
      period: source.period_of_report,
      formType: source.form_type,
      accession: source.accession_no,
      sector: classifySector(source.entity_name || source.company_name || ""),
    };
  });

  // Sector breakdown from classified filings
  const sectorBreakdown = {};
  for (const f of filings) {
    sectorBreakdown[f.sector] = (sectorBreakdown[f.sector] || 0) + 1;
  }

  const topSectors = Object.entries(sectorBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([sector, count]) => ({ sector, filingCount: count }));

  // AI velocity signal
  const aiVelocity =
    aiCount > 20 ? "ACCELERATING" : aiCount > 10 ? "ELEVATED" : aiCount > 3 ? "ACTIVE" : "LOW";

  res.json({
    status: "ok",
    summary: {
      totalFormDFilings: formD.total,
      filingsReturned: filings.length,
      lookbackDays: lookback,
      aiRelatedFilings: aiCount,
      fintechFilings: fintechCount,
      healthFilings: healthCount,
      aiVelocity,
      signal:
        formD.total > 500
          ? "HIGH_DEPLOYMENT_VELOCITY"
          : formD.total > 200
          ? "ACTIVE_PE_VC_MARKET"
          : "MODERATE_ACTIVITY",
    },
    recentFilings: filings.slice(0, 20),
    sectorBreakdown: topSectors,
    sectorKeywordCounts: {
      "AI/ML": aiCount,
      FinTech: fintechCount,
      HealthTech: healthCount,
    },
    analysis: {
      mostActiveDay: filings.length > 0
        ? filings.reduce((acc, f) => {
            acc[f.filedAt] = (acc[f.filedAt] || 0) + 1;
            return acc;
          }, {})
        : {},
      topSector: topSectors[0]?.sector ?? "Unknown",
      aiThesis:
        aiVelocity === "ACCELERATING"
          ? "AI/ML startups absorbing significant private capital — bull case for AI infrastructure"
          : aiVelocity === "ELEVATED"
          ? "Sustained AI investment activity — sector remains top VC destination"
          : "AI deals present but not dominating flow — watch for cooling",
    },
    meta: {
      sources: ["SEC EDGAR Form D filings", "https://efts.sec.gov/LATEST/search-index?forms=D"],
      note: "Form D = private placement exemption filing; must file within 15 days of first sale",
      generatedAt: new Date().toISOString(),
    },
  });
}
