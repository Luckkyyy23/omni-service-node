/**
 * TIER 2 — Job Pivots Service
 * Tracks companies hiring for AI/agentic roles — the #1 buyer signal
 *
 * Sources (all free, no auth):
 *   - Greenhouse public job board API
 *   - Lever public job board API
 *   - HackerNews Algolia search ("Who is Hiring" threads)
 *   - Remotive.com open API (remote AI jobs)
 */

import axios from "axios";

// Known companies with public Greenhouse boards
const GREENHOUSE_BOARDS = [
  "openai", "anthropic", "cohere", "mistral", "deepmind", "databricks",
  "scale-ai", "huggingface", "weights-biases", "modal-labs", "together-ai",
  "replit", "cursor", "linear", "vercel", "cloudflare", "coinbase",
  "salesforce", "microsoft", "google", "amazon", "meta", "apple",
];

// Known Lever boards
const LEVER_BOARDS = [
  "netflix", "stripe", "shopify", "figma", "notion", "airtable",
  "asana", "atlassian", "twilio", "sendgrid",
];

const AI_ROLE_PATTERNS = [
  /agentic/i, /ai agent/i, /autonomous/i, /llm/i, /large language/i,
  /generative ai/i, /gen.?ai/i, /machine learning/i, /ml engineer/i,
  /ai safety/i, /ai security/i, /ai infrastructure/i, /model/i,
  /prompt engineer/i, /rag/i, /vector/i, /embedding/i,
];

// Score a job posting for AI/agentic relevance
function scoreJob(title = "", description = "") {
  const text = `${title} ${description}`.toLowerCase();
  let score = 0;
  for (const pattern of AI_ROLE_PATTERNS) {
    if (pattern.test(text)) score += 10;
  }
  if (/agentic/i.test(text)) score += 20;
  if (/ai agent/i.test(text) || /autonomous agent/i.test(text)) score += 20;
  return Math.min(100, score);
}

// Fetch jobs from a Greenhouse board
async function fetchGreenhouseJobs(board) {
  try {
    const { data } = await axios.get(
      `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
      { timeout: 8000 }
    );
    return (data.jobs || []).map(j => ({
      company: board,
      title: j.title,
      location: j.location?.name,
      url: j.absolute_url,
      updatedAt: j.updated_at,
      score: scoreJob(j.title, j.content || ""),
      source: "greenhouse",
    }));
  } catch {
    return [];
  }
}

// Fetch jobs from a Lever board
async function fetchLeverJobs(company) {
  try {
    const { data } = await axios.get(
      `https://api.lever.co/v0/postings/${company}?mode=json`,
      { timeout: 8000 }
    );
    return (data || []).map(j => ({
      company,
      title: j.text,
      location: j.categories?.location,
      team: j.categories?.team,
      url: j.hostedUrl,
      updatedAt: new Date(j.createdAt).toISOString(),
      score: scoreJob(j.text, j.description || j.descriptionPlain || ""),
      source: "lever",
    }));
  } catch {
    return [];
  }
}

// Search HackerNews "Who is Hiring" threads via Algolia
async function fetchHNHiring(roles = []) {
  try {
    const query = roles.length ? roles.join(" OR ") : "AI agent agentic autonomous LLM";
    const { data } = await axios.get("https://hn.algolia.com/api/v1/search", {
      params: {
        query,
        tags: "comment,ask_hn",
        hitsPerPage: 20,
        numericFilters: `created_at_i>${Math.floor(Date.now() / 1000) - 86400 * 60}`,
      },
      timeout: 8000,
    });
    return (data.hits || [])
      .filter(h => h.story_title?.toLowerCase().includes("who is hiring"))
      .map(h => ({
        company: "HackerNews",
        excerpt: h.comment_text?.replace(/<[^>]*>/g, "").slice(0, 200),
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        score: scoreJob(h.comment_text || "", ""),
        source: "hackernews",
      }))
      .filter(j => j.score >= 10);
  } catch {
    return [];
  }
}

// Remotive public API (remote AI/tech jobs)
async function fetchRemotiveJobs(category = "software-dev") {
  try {
    const { data } = await axios.get(`https://remotive.com/api/remote-jobs?category=${category}&limit=30`, {
      timeout: 8000,
    });
    return (data.jobs || [])
      .map(j => ({
        company: j.company_name,
        title: j.title,
        location: j.candidate_required_location,
        url: j.url,
        salary: j.salary,
        updatedAt: j.publication_date,
        score: scoreJob(j.title, j.description || ""),
        source: "remotive",
      }))
      .filter(j => j.score >= 10);
  } catch {
    return [];
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function jobPivots(req, res) {
  const {
    roles = [],
    companies = [],
    minScore = 20,
    sources = ["greenhouse", "lever", "remotive", "hackernews"],
  } = req.body || {};

  const roleList = Array.isArray(roles) ? roles : [roles];
  const companyList = Array.isArray(companies) ? companies : [companies];

  // Pick boards to query
  const ghBoards = companyList.length > 0
    ? companyList.map(c => c.toLowerCase().replace(/[^a-z0-9-]/g, ""))
    : GREENHOUSE_BOARDS.slice(0, 8); // limit for speed

  const lvBoards = companyList.length > 0
    ? companyList.map(c => c.toLowerCase().replace(/[^a-z0-9-]/g, ""))
    : LEVER_BOARDS.slice(0, 5);

  const fetchTasks = [];
  if (sources.includes("greenhouse")) {
    fetchTasks.push(...ghBoards.map(b => fetchGreenhouseJobs(b)));
  }
  if (sources.includes("lever")) {
    fetchTasks.push(...lvBoards.map(b => fetchLeverJobs(b)));
  }
  if (sources.includes("remotive")) {
    fetchTasks.push(fetchRemotiveJobs("software-dev"));
  }
  if (sources.includes("hackernews")) {
    fetchTasks.push(fetchHNHiring(roleList));
  }

  const results = await Promise.all(fetchTasks);
  const allJobs = results.flat();

  const filtered = allJobs
    .filter(j => j.score >= Number(minScore))
    .sort((a, b) => b.score - a.score);

  // Group by company
  const byCompany = {};
  for (const job of filtered) {
    const key = job.company || "unknown";
    if (!byCompany[key]) byCompany[key] = { company: key, jobs: [], maxScore: 0, sources: new Set() };
    byCompany[key].jobs.push(job);
    byCompany[key].maxScore = Math.max(byCompany[key].maxScore, job.score);
    byCompany[key].sources.add(job.source);
  }

  const companies_output = Object.values(byCompany)
    .map(c => ({ ...c, sources: [...c.sources] }))
    .sort((a, b) => b.maxScore - a.maxScore)
    .slice(0, 20);

  res.json({
    status: "ok",
    query: { roles: roleList, minScore: Number(minScore) },
    summary: {
      totalJobs:    filtered.length,
      companies:    companies_output.length,
      hotCompanies: companies_output.filter(c => c.maxScore >= 60).map(c => c.company),
    },
    companies: companies_output,
    jobs: filtered.slice(0, 30),
    buyerSignal: {
      topHires: companies_output.slice(0, 5).map(c => c.company),
      interpretation: "Companies hiring for agentic/AI roles = immediate spend authority for AI tools",
    },
    meta: {
      sources: sources,
      boardsQueried: { greenhouse: ghBoards.length, lever: lvBoards.length },
      generatedAt: new Date().toISOString(),
    },
  });
}
