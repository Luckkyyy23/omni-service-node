/**
 * TIER 1 — ArXiv AI Research Intelligence
 * Latest AI/ML research papers — what every R&D agent needs
 *
 * Source: ArXiv API (completely free, no auth)
 *   http://export.arxiv.org/api/query
 *
 * Returns: latest papers, trending topics, breakthrough signals,
 *          author velocity, institution activity
 */

import axios from "axios";

const ARXIV_API = "http://export.arxiv.org/api/query";

// ArXiv category codes
const CATEGORY_MAP = {
  ai:      "cat:cs.AI",
  ml:      "cat:cs.LG",
  nlp:     "cat:cs.CL",
  cv:      "cat:cs.CV",
  robotics:"cat:cs.RO",
  agents:  "cat:cs.MA",           // Multi-agent systems
  crypto:  "cat:cs.CR",           // Cryptography/security
  all:     "cat:cs.AI OR cat:cs.LG OR cat:cs.CL",
};

// Parse ArXiv Atom XML response
function parseAtomXML(xml) {
  const papers = [];
  const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];

  for (const entry of entries) {
    const get  = (tag) => entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() || "";
    const getAll = (tag) => [...entry.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g"))].map(m => m[1].trim());

    const id      = get("id").split("/abs/").pop();
    const title   = get("title").replace(/\s+/g, " ");
    const summary = get("summary").replace(/\s+/g, " ").slice(0, 400);
    const authors = getAll("name").slice(0, 5);
    const categories = [...entry.matchAll(/term="([^"]+)"/g)].map(m => m[1]);
    const published  = get("published").split("T")[0];
    const updated    = get("updated").split("T")[0];

    if (id && title) {
      papers.push({ id, title, summary, authors, categories, published, updated,
        url: `https://arxiv.org/abs/${id}`,
        pdfUrl: `https://arxiv.org/pdf/${id}`,
      });
    }
  }
  return papers;
}

// Score a paper for breakthrough/impact signal
function scorePaper(paper) {
  const text = `${paper.title} ${paper.summary}`.toLowerCase();
  let score  = 0;

  const signals = [
    ["state of the art", 20], ["novel", 10], ["outperforms", 15],
    ["breakthrough", 20], ["autonomous agent", 15], ["self-improving", 20],
    ["gpt", 8], ["llm", 8], ["transformer", 6], ["foundation model", 10],
    ["reasoning", 8], ["code generation", 8], ["multimodal", 8],
    ["alignment", 12], ["safety", 10], ["reward", 6],
    ["open source", 6], ["benchmark", 5], ["zero-shot", 8],
    ["agentic", 15], ["tool use", 10], ["function calling", 8],
    ["mcp", 12], ["retrieval", 6], ["rag", 8],
  ];
  for (const [kw, pts] of signals) {
    if (text.includes(kw)) score += pts;
  }

  // Multi-agent research gets extra boost
  if (paper.categories.some(c => c.startsWith("cs.MA"))) score += 10;

  return Math.min(100, score);
}

// Extract trending topics from paper titles
function extractTopics(papers) {
  const allText = papers.map(p => p.title.toLowerCase()).join(" ");
  const topics  = [
    "agent", "reasoning", "multimodal", "vision", "code", "alignment",
    "safety", "rag", "retrieval", "benchmark", "transformer", "llm",
    "autonomous", "reward", "fine-tuning", "instruction", "tool",
    "planning", "memory", "evaluation", "robustness",
  ];
  return topics
    .map(t => ({ topic: t, count: (allText.match(new RegExp(`\\b${t}\\b`, "g")) || []).length }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function arxiv(req, res) {
  const {
    category = "all",   // ai | ml | nlp | cv | robotics | agents | all
    query    = "",      // additional keyword filter
    limit    = "20",
    days     = "3",     // papers from last N days
  } = req.query;

  const catQuery = CATEGORY_MAP[category] || CATEGORY_MAP.all;
  const dateFilter = new Date(Date.now() - Number(days) * 86400000)
    .toISOString().replace(/[-:]/g, "").split(".")[0];

  let searchQuery = catQuery;
  if (query) searchQuery += ` AND (ti:"${query}" OR abs:"${query}")`;

  const { data: xml } = await axios.get(ARXIV_API, {
    params: {
      search_query:  searchQuery,
      start:         0,
      max_results:   Number(limit),
      sortBy:        "submittedDate",
      sortOrder:     "descending",
    },
    timeout: 15000,
    headers: { "Accept": "application/atom+xml" },
  });

  const papers = parseAtomXML(xml)
    .map(p => ({ ...p, impactScore: scorePaper(p) }))
    .sort((a, b) => b.impactScore - a.impactScore);

  const trendingTopics  = extractTopics(papers);
  const breakthroughPapers = papers.filter(p => p.impactScore >= 30);
  const topInstitutions = papers
    .flatMap(p => p.authors)
    .reduce((acc, a) => { acc[a] = (acc[a] || 0) + 1; return acc; }, {});

  res.json({
    status: "ok",
    category,
    summary: {
      totalPapers:        papers.length,
      breakthroughs:      breakthroughPapers.length,
      trendingTopics,
      topAuthors: Object.entries(topInstitutions)
        .sort(([,a],[,b]) => b - a)
        .slice(0, 10)
        .map(([name, papers]) => ({ name, papers })),
    },
    breakthroughs: breakthroughPapers.slice(0, 5),
    papers,
    meta: {
      source:      "ArXiv.org API (cs.AI, cs.LG, cs.CL)",
      daysBack:    Number(days),
      generatedAt: new Date().toISOString(),
    },
  });
}
