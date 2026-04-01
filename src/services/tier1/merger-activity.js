/**
 * TIER 1 — M&A and Merger Activity Service
 * Recent merger, acquisition, and activist investor activity from SEC EDGAR filings.
 * SC 13D = activist/5%+ stake, SC 13G = passive large holder, DEFC14A = proxy fights.
 *
 * Sources (free, no auth):
 *   SEC EDGAR Full-Text Search — https://efts.sec.gov/
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

async function fetchEdgarFilings(forms, query = "") {
  try {
    const params = {
      forms,
      dateRange: "custom",
      startdt: daysAgo(7),
      enddt: today(),
    };
    if (query) params.q = query;

    const { data } = await axios.get(EDGAR_SEARCH, {
      params,
      headers: EDGAR_HEADERS,
      timeout: 12000,
    });

    const hits = data?.hits?.hits || [];
    return hits.map(h => ({
      filingId: h._id,
      formType: h._source?.form_type,
      company: h._source?.entity_name || h._source?.company_name,
      filedAt: h._source?.file_date,
      period: h._source?.period_of_report,
      description: h._source?.period_of_report,
      url: h._source?.file_num
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum=${h._source.file_num}`
        : null,
      accessionNumber: h._source?.accession_no,
    }));
  } catch {
    return [];
  }
}

async function fetchMergerFilings() {
  try {
    const { data } = await axios.get(EDGAR_SEARCH, {
      params: {
        q: '"merger" "acquisition"',
        forms: "SC 13D",
        dateRange: "custom",
        startdt: daysAgo(7),
        enddt: today(),
      },
      headers: EDGAR_HEADERS,
      timeout: 12000,
    });
    return data?.hits?.hits || [];
  } catch {
    return [];
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function mergerActivity(req, res) {
  const [sc13dResult, sc13gResult, proxyResult, mergerResult] = await Promise.allSettled([
    fetchEdgarFilings("SC 13D"),
    fetchEdgarFilings("SC 13G"),
    fetchEdgarFilings("DEFC14A"),
    fetchMergerFilings(),
  ]);

  const sc13d = sc13dResult.status === "fulfilled" ? sc13dResult.value : [];
  const sc13g = sc13gResult.status === "fulfilled" ? sc13gResult.value : [];
  const proxy = proxyResult.status === "fulfilled" ? proxyResult.value : [];
  const mergerMentions = mergerResult.status === "fulfilled" ? mergerResult.value : [];

  const totalActivity = sc13d.length + sc13g.length + proxy.length;

  let signal = "LOW_ACTIVITY";
  if (sc13d.length >= 5 && proxy.length >= 2) signal = "HIGH_MA_ACTIVITY";
  else if (sc13d.length >= 3 || proxy.length >= 1) signal = "ELEVATED_ACTIVIST_ACTIVITY";
  else if (totalActivity >= 2) signal = "MODERATE_ACTIVITY";

  // Extract company names for activist targets
  const activistTargets = sc13d
    .filter(f => f.company)
    .map(f => f.company)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 10);

  res.json({
    status: "ok",
    summary: {
      signal,
      sc13dFilings: sc13d.length,
      sc13gFilings: sc13g.length,
      proxyFightFilings: proxy.length,
      mergerMentionFilings: mergerMentions.length,
      totalFilings7d: totalActivity,
      activistTargets: activistTargets.length,
    },
    activistPositions: {
      sc13d: sc13d.slice(0, 10),
      description: "SC 13D = activist or 5%+ owner with intent to influence management",
    },
    passivePositions: {
      sc13g: sc13g.slice(0, 10),
      description: "SC 13G = passive 5%+ holder (index funds, institutional)",
    },
    proxyFights: {
      filings: proxy,
      description: "DEFC14A = definitive proxy contest / shareholder activism",
    },
    mergerMentions: mergerMentions.slice(0, 10).map(h => ({
      company: h._source?.entity_name,
      filed: h._source?.file_date,
      form: h._source?.form_type,
    })),
    activistTargets,
    dealActivityThesis:
      signal === "HIGH_MA_ACTIVITY"
        ? "Elevated M&A and activist pressure — expect bid premiums and board changes"
        : signal === "ELEVATED_ACTIVIST_ACTIVITY"
        ? "Activists circling targets — monitor for schedule 13D filers building positions"
        : "Normal background level of M&A activity — no unusual concentration",
    meta: {
      sources: [
        "SEC EDGAR full-text search (SC 13D, SC 13G, DEFC14A)",
        "EDGAR URL: https://efts.sec.gov/LATEST/search-index",
      ],
      lookbackDays: 7,
      generatedAt: new Date().toISOString(),
    },
  });
}
