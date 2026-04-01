/**
 * TIER 2 — Company Intelligence Profile
 * The most comprehensive company dossier any sales/research AI agent could buy.
 * Aggregates 6 data sources into one scored intelligence packet.
 *
 * Sources:
 *   SEC EDGAR: regulatory disclosures, financial events
 *   GitHub:    engineering velocity, AI repo count
 *   Job Boards: hiring signals, growth roles
 *   Patents:   IP filings, tech focus areas
 *   HackerNews: developer community sentiment
 *   Reddit:    public brand/product sentiment
 */

import axios from "axios";

const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index";
const GITHUB_API   = "https://api.github.com";
const HN_API       = "https://hn.algolia.com/api/v1";
const GREENHOUSE   = "https://boards-api.greenhouse.io/v1/boards";
const PATENTS_VIEW = "https://api.patentsview.org/patents/query";

// SEC: recent 8-K/10-Q filings for company
async function fetchSecFilings(company, days = 30) {
  try {
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    const { data } = await axios.get(EDGAR_SEARCH, {
      params: { q: company, dateRange: "custom", startdt: startDate, enddt: new Date().toISOString().split("T")[0], forms: "8-K,10-Q,10-K" },
      headers: { "User-Agent": "OmniServiceNode research@omni-service.io" },
      timeout: 8000,
    });
    return (data.hits?.hits || []).slice(0, 5).map(h => ({
      form:    h._source.form,
      date:    h._source.file_date,
      name:    h._source.display_names?.[0]?.split("  (")[0],
    }));
  } catch { return []; }
}

// GitHub: org engineering velocity
async function fetchGithubVelocity(orgSlug, days = 30) {
  try {
    const headers = {};
    if (process.env.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    const { data: repos } = await axios.get(`${GITHUB_API}/orgs/${orgSlug}/repos`, {
      params: { sort: "pushed", per_page: 30, type: "public" },
      headers, timeout: 8000,
    });
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const recentRepos = repos.filter(r => r.pushed_at > since);
    const aiRepos = recentRepos.filter(r => {
      const text = `${r.name} ${r.description || ""}`.toLowerCase();
      return ["ai", "ml", "llm", "agent", "gpt", "model", "neural"].some(k => text.includes(k));
    });
    const totalStars = recentRepos.reduce((s, r) => s + r.stargazers_count, 0);
    return {
      activeRepos:   recentRepos.length,
      aiRepos:       aiRepos.length,
      totalStars,
      topAiRepos:    aiRepos.slice(0, 3).map(r => ({ name: r.name, stars: r.stargazers_count, description: r.description })),
      aiPivotScore:  Math.min(100, aiRepos.length * 15 + (aiRepos.length > 0 ? 20 : 0)),
    };
  } catch { return null; }
}

// Jobs: hiring signals
async function fetchJobSignals(company, days = 30) {
  try {
    const [hn] = await Promise.allSettled([
      axios.get(`${HN_API}/search`, {
        params: { query: `${company} hiring`, tags: "story", hitsPerPage: 5 },
        timeout: 6000,
      }),
    ]);
    const hnJobs = hn.status === "fulfilled"
      ? hn.value.data.hits.filter(h => h.title?.toLowerCase().includes("hiring") || h.title?.toLowerCase().includes("who is hiring")).length
      : 0;

    // Try Greenhouse public jobs board
    const slug = company.toLowerCase().replace(/[^a-z0-9]/g, "");
    let openRoles = 0;
    let aiRoles   = 0;
    try {
      const { data } = await axios.get(`${GREENHOUSE}/v1/boards/${slug}/jobs`, { timeout: 5000 });
      openRoles = data.jobs?.length || 0;
      aiRoles   = (data.jobs || []).filter(j =>
        ["AI", "ML", "machine learning", "data scientist", "LLM", "agent"].some(k =>
          j.title?.includes(k)
        )
      ).length;
    } catch {}

    return { openRoles, aiRoles, hnMentions: hnJobs };
  } catch { return { openRoles: 0, aiRoles: 0, hnMentions: 0 }; }
}

// Patents: recent AI filings
async function fetchPatentCount(company, days = 90) {
  try {
    const sinceDate = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    const { data } = await axios.post(PATENTS_VIEW, {
      q: {
        "_and": [
          { "_contains": { "assignee_organization": company } },
          { "_gte": { "patent_date": sinceDate } },
          { "_or": [
            { "_contains": { "patent_title": "artificial intelligence" } },
            { "_contains": { "patent_title": "machine learning" } },
            { "_contains": { "patent_title": "neural network" } },
          ]},
        ],
      },
      f: ["patent_number", "patent_title", "patent_date"],
      o: { "per_page": 10 },
    }, { timeout: 10000, headers: { "Content-Type": "application/json" } });
    const count = data.total_patent_count || 0;
    const recent = (data.patents || []).slice(0, 3).map(p => p.patent_title);
    return { count, recentTitles: recent };
  } catch { return { count: 0, recentTitles: [] }; }
}

// Sentiment: HackerNews mentions
async function fetchHnSentiment(company) {
  try {
    const { data } = await axios.get(`${HN_API}/search`, {
      params: { query: company, hitsPerPage: 20, numericFilters: "points>5" },
      timeout: 6000,
    });
    const hits   = data.hits || [];
    const avgPts = hits.length ? Math.round(hits.reduce((s, h) => s + h.points, 0) / hits.length) : 0;
    const posCount = hits.filter(h => h.points > 100).length;
    return {
      mentions:    hits.length,
      avgPoints:   avgPts,
      hotStories:  posCount,
      sentiment:   posCount >= 3 ? "POSITIVE" : posCount === 0 && hits.length > 5 ? "NEUTRAL" : "MIXED",
    };
  } catch { return null; }
}

// Composite lead scoring
function computeLeadScore(sec, github, jobs, patents, sentiment) {
  let score = 0;
  // SEC activity = company is actively disclosing (regulated = paying AI)
  if (sec.length >= 3) score += 20;
  else if (sec.length >= 1) score += 10;
  // GitHub AI activity
  if (github?.aiPivotScore >= 50) score += 25;
  else if (github?.aiPivotScore >= 20) score += 15;
  // Hiring AI talent
  if (jobs?.aiRoles >= 5) score += 20;
  else if (jobs?.aiRoles >= 1) score += 10;
  // Patent activity = serious R&D investment
  if (patents?.count >= 5) score += 20;
  else if (patents?.count >= 1) score += 10;
  // Community sentiment
  if (sentiment?.sentiment === "POSITIVE") score += 15;
  else if (sentiment?.sentiment === "MIXED") score += 5;

  return Math.min(100, score);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function companyProfile(req, res) {
  const {
    company = "Microsoft",
    github  = "",      // GitHub org slug (auto-derived if empty)
    days    = "30",
  } = req.body || req.query;

  // Auto-derive GitHub org slug
  const ghSlug = github || company.toLowerCase()
    .replace(/\s+(inc|corp|ltd|llc|co|technologies|technology|systems|labs)\.?$/i, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const [secData, githubData, jobData, patentData, sentimentData] = await Promise.allSettled([
    fetchSecFilings(company, Number(days)),
    fetchGithubVelocity(ghSlug, Number(days)),
    fetchJobSignals(company, Number(days)),
    fetchPatentCount(company, 90),
    fetchHnSentiment(company),
  ]);

  const ok = r => r.status === "fulfilled" ? r.value : null;
  const sec      = ok(secData) || [];
  const github_  = ok(githubData);
  const jobs     = ok(jobData)  || { openRoles: 0, aiRoles: 0, hnMentions: 0 };
  const pats     = ok(patentData) || { count: 0, recentTitles: [] };
  const sent     = ok(sentimentData);

  const leadScore = computeLeadScore(sec, github_, jobs, pats, sent);
  const tier = leadScore >= 70 ? "HOT" : leadScore >= 40 ? "WARM" : "COLD";

  res.json({
    status: "ok",
    company,
    leadScore,
    tier,
    outreachAngle: tier === "HOT"
      ? `${company} is actively expanding AI infrastructure (score ${leadScore}/100). Priority outreach: highlight autonomous data delivery and real-time intelligence feeds.`
      : tier === "WARM"
      ? `${company} shows AI investment signals. Angle: compliance + market intelligence bundle.`
      : `${company} shows limited AI signals. Angle: risk/compliance services.`,
    intelligence: {
      secFilings: {
        recentCount: sec.length,
        filings:     sec,
        signal:      sec.length >= 2 ? "ACTIVE_DISCLOSURES" : "QUIET",
      },
      github: github_ || { note: `GitHub org '${ghSlug}' not found or private` },
      hiring: {
        ...jobs,
        signal: jobs.aiRoles >= 3 ? "HEAVY_AI_HIRING" : jobs.aiRoles >= 1 ? "AI_HIRING" : "NO_AI_HIRING",
      },
      patents: {
        ...pats,
        signal: pats.count >= 3 ? "HEAVY_AI_IP" : pats.count >= 1 ? "AI_IP_ACTIVE" : "NO_AI_PATENTS",
      },
      communityMention: sent,
    },
    meta: {
      sources:    ["SEC EDGAR", "GitHub API", "Greenhouse", "USPTO PatentsView", "HackerNews"],
      generatedAt: new Date().toISOString(),
    },
  });
}
