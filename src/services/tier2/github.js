/**
 * TIER 2 — GitHub Velocity Service
 * Tracks Fortune 500 orgs pivoting to AI — repo creation, topic changes, commit velocity
 *
 * Source: GitHub REST API (60 req/hr unauthenticated, 5000 with GITHUB_TOKEN)
 *   https://api.github.com
 */

import axios from "axios";

const GH = "https://api.github.com";

const ghHeaders = () => ({
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_TOKEN ? { "Authorization": `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

// Fetch org's recent repos
async function fetchOrgRepos(org, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await axios.get(`${GH}/orgs/${org}/repos`, {
    params: { sort: "updated", per_page: 30, type: "public" },
    headers: ghHeaders(),
    timeout: 10000,
  });
  return data.filter(r => new Date(r.updated_at) > new Date(since));
}

// Fetch new repos created by org (AI topic pivot signal)
async function fetchNewAiRepos(org, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  const { data } = await axios.get(`${GH}/search/repositories`, {
    params: {
      q: `org:${org} created:>${since}`,
      sort: "updated",
      per_page: 15,
    },
    headers: ghHeaders(),
    timeout: 10000,
  });
  return data.items || [];
}

// Search for AI/agentic repos across all of GitHub by org
async function searchOrgAiTopics(org) {
  const topics = ["ai", "agents", "llm", "generative-ai", "agentic"];
  const results = [];
  for (const topic of topics.slice(0, 2)) { // limit to avoid rate limit
    try {
      const { data } = await axios.get(`${GH}/search/repositories`, {
        params: { q: `org:${org} topic:${topic}`, per_page: 5 },
        headers: ghHeaders(),
        timeout: 8000,
      });
      results.push(...(data.items || []));
    } catch { /* rate limit hit — skip */ }
  }
  const seen = new Set();
  return results.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
}

// Compute AI pivot score for an org based on their repos
function computePivotScore(repos, aiRepos) {
  let score = 0;
  // New repos with AI-related names/topics
  for (const r of repos) {
    const text = `${r.name} ${r.description || ""} ${(r.topics || []).join(" ")}`.toLowerCase();
    if (text.match(/\b(agent|llm|gpt|ai|ml|model|inference|rag|vector|embed)\b/)) score += 5;
    if (text.match(/\b(agentic|autonomous|multi.?agent|copilot|assistant)\b/)) score += 8;
  }
  score += aiRepos.length * 3;
  // Recent activity bonus
  const recentActivity = repos.filter(r => {
    const daysSince = (Date.now() - new Date(r.pushed_at).getTime()) / 86400000;
    return daysSince < 7;
  }).length;
  score += recentActivity * 2;
  return Math.min(100, score);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function githubVelocity(req, res) {
  const { org, days = "30" } = req.query;

  if (!org) {
    return res.status(400).json({ error: "org parameter required (e.g. ?org=microsoft)" });
  }

  const daysNum = Number(days);
  const [repos, aiRepos] = await Promise.all([
    fetchOrgRepos(org, daysNum).catch(() => []),
    searchOrgAiTopics(org).catch(() => []),
  ]);

  const score = computePivotScore(repos, aiRepos);

  const repoSummary = repos.slice(0, 10).map(r => ({
    name:         r.name,
    description:  r.description,
    topics:       r.topics || [],
    stars:        r.stargazers_count,
    language:     r.language,
    lastPushed:   r.pushed_at,
    url:          r.html_url,
    isNewAi:      aiRepos.some(a => a.id === r.id),
    aiKeywords:   `${r.name} ${r.description || ""} ${(r.topics || []).join(" ")}`.toLowerCase()
                    .match(/\b(agent|llm|gpt|ai|ml|agentic|autonomous|copilot)\b/g) || [],
  }));

  res.json({
    status: "ok",
    org,
    period: `Last ${daysNum} days`,
    pivotScore: score,
    pivotSignal: score >= 40 ? "STRONG_PIVOT" : score >= 20 ? "MODERATE_PIVOT" : "LOW_SIGNAL",
    summary: {
      activeRepos:    repos.length,
      newAiRepos:     aiRepos.length,
      topLanguages:   [...new Set(repos.map(r => r.language).filter(Boolean))].slice(0, 5),
    },
    repos: repoSummary,
    aiRepos: aiRepos.slice(0, 5).map(r => ({
      name: r.name, description: r.description,
      topics: r.topics, stars: r.stargazers_count, url: r.html_url,
    })),
    buyerSignal: {
      isHot: score >= 40,
      recommendation: score >= 40
        ? "HIGH VALUE LEAD — Org actively investing in AI/agentic infrastructure"
        : score >= 20
        ? "WATCH LIST — Early AI pivot signals detected"
        : "LOW PRIORITY — No significant AI pivot detected",
    },
    meta: {
      source: "GitHub REST API v2022-11-28",
      rateLimit: process.env.GITHUB_TOKEN ? "5000/hr" : "60/hr (add GITHUB_TOKEN for more)",
      generatedAt: new Date().toISOString(),
    },
  });
}
