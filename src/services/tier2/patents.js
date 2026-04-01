/**
 * TIER 2 — Patent Intelligence
 * Real AI/agentic patent filings from Fortune 500 and startups
 *
 * Sources (all free, no auth):
 *   USPTO PatentsView: full patent database query API
 *     https://api.patentsview.org/patents/query
 *   EPO Patent API (European Patent Office) via OPS
 *   Google Patents RSS feeds (public)
 */

import axios from "axios";

// PatentsView v2 API — GET-based REST API (old POST endpoint is 410 Gone)
const PATENTS_VIEW = "https://search.patentsview.org/api/v1/patent/";

async function searchPatentsView(query, assignees = [], days = 90) {
  const sinceDate = new Date(Date.now() - days * 86400000)
    .toISOString().split("T")[0];

  // v2 uses _text_any for keyword search across title+abstract
  const qFilter = { "_and": [
    { "_gte": { "patent_date": sinceDate } },
    { "_text_any": { "patent_title": query, "patent_abstract": query } },
  ]};
  if (assignees.length > 0) {
    qFilter["_and"].push({
      "_or": assignees.map(a => ({ "_contains": { "assignee_organization": a } })),
    });
  }

  const { data } = await axios.get(PATENTS_VIEW, {
    params: {
      q: JSON.stringify(qFilter),
      f: JSON.stringify([
        "patent_id", "patent_title", "patent_abstract",
        "patent_date", "patent_type",
        "assignee_organization", "assignee_country",
        "inventor_last_name", "inventor_first_name",
        "cpc_group_id",
      ]),
      s: JSON.stringify([{ "patent_date": "desc" }]),
      per_page: 25,
    },
    timeout: 15000,
    headers: { "User-Agent": "OmniServiceNode research@omni-service.io" },
  });

  return data.patents || [];
}

// Score a patent for AI/agentic relevance
function scorePatent(patent) {
  const text = `${patent.patent_title || ""} ${patent.patent_abstract || ""}`.toLowerCase();
  let score  = 0;

  const signals = [
    ["autonomous agent",   20], ["multi-agent",        18], ["agentic",           18],
    ["large language model", 15], ["neural network",   10], ["machine learning",   8],
    ["reinforcement learning", 12], ["generative",     10], ["transformer",        10],
    ["natural language",    8], ["computer vision",   8], ["deep learning",       8],
    ["artificial intelligence", 6], ["model training", 6], ["inference",           5],
    ["chatbot",             5], ["recommendation",     4], ["prediction",          4],
    ["knowledge graph",     8], ["embedding",          6], ["fine-tuning",         8],
  ];

  for (const [kw, pts] of signals) {
    if (text.includes(kw)) score += pts;
  }

  // IPC class bonuses (G06N = AI, G06F = computing)
  const ipcs = Array.isArray(patent.ipc_class_id) ? patent.ipc_class_id : [patent.ipc_class_id];
  if (ipcs.some(c => c?.startsWith("G06N"))) score += 15; // Neural networks / AI
  if (ipcs.some(c => c?.startsWith("G06F"))) score += 5;  // General computing

  return Math.min(100, score);
}

// Parse patent into clean object
function parsePatent(p) {
  const assignees = Array.isArray(p.assignees) ? p.assignees : [];
  const inventors = Array.isArray(p.inventors) ? p.inventors : [];

  return {
    patentNumber:  p.patent_number,
    title:         p.patent_title,
    abstract:      p.patent_abstract?.slice(0, 400),
    filedDate:     p.patent_date,
    assignees:     assignees.map(a => a.assignee_organization).filter(Boolean).slice(0, 3),
    inventors:     inventors.map(i => `${i.inventor_first_name} ${i.inventor_last_name}`.trim()).slice(0, 3),
    ipc:           Array.isArray(p.ipc_class_id) ? p.ipc_class_id.slice(0, 3) : [p.ipc_class_id].filter(Boolean),
    url:           `https://patents.google.com/patent/US${p.patent_number}`,
    aiScore:       0, // filled in after
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function patents(req, res) {
  const {
    query     = "artificial intelligence agentic",
    companies = "",   // comma-separated company names to filter
    days      = "90",
    minScore  = "10",
  } = req.query;

  const assigneeList = companies
    ? companies.split(",").map(c => c.trim()).filter(Boolean)
    : [];

  const rawPatents = await searchPatentsView(query, assigneeList, Number(days));

  const scored = rawPatents
    .map(p => {
      const parsed = parsePatent(p);
      parsed.aiScore = scorePatent(p);
      return parsed;
    })
    .filter(p => p.aiScore >= Number(minScore))
    .sort((a, b) => b.aiScore - a.aiScore);

  // Company-level aggregation
  const companyActivity = {};
  scored.forEach(p => {
    p.assignees.forEach(a => {
      if (!companyActivity[a]) companyActivity[a] = { count: 0, maxScore: 0, patents: [] };
      companyActivity[a].count++;
      companyActivity[a].maxScore = Math.max(companyActivity[a].maxScore, p.aiScore);
      if (companyActivity[a].patents.length < 3) companyActivity[a].patents.push(p.patentNumber);
    });
  });

  const topAssignees = Object.entries(companyActivity)
    .sort(([,a],[,b]) => b.count - a.count)
    .slice(0, 10)
    .map(([name, d]) => ({ name, patentCount: d.count, maxAiScore: d.maxScore, topPatents: d.patents }));

  res.json({
    status: "ok",
    query: { query, days: Number(days), minScore: Number(minScore) },
    summary: {
      totalPatents:   scored.length,
      highAiRelevance: scored.filter(p => p.aiScore >= 30).length,
      topAssignees,
    },
    patents: scored.slice(0, 25),
    meta: {
      source:      "USPTO PatentsView API (patentsview.org)",
      daysBack:    Number(days),
      generatedAt: new Date().toISOString(),
    },
  });
}
