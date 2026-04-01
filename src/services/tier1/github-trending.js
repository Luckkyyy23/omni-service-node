/**
 * TIER 1 — GitHub Trending Service
 * Trending AI/ML repositories being built right now
 *
 * Sources (free, no auth for public repos):
 *   - GitHub Search API: /search/repositories
 */

import axios from "axios";

const GH_SEARCH = "https://api.github.com/search/repositories";

const AI_KEYWORDS = [
  "llm","gpt","claude","gemini","langchain","langgraph","autogen","crewai",
  "agent","transformer","diffusion","stable-diffusion","rag","vector","embedding",
  "fine-tuning","openai","anthropic","huggingface","pytorch","tensorflow",
  "machine-learning","deep-learning","neural","nlp","computer-vision","ai",
];

function isAIRepo(repo) {
  const text = [
    repo.name,
    repo.description || "",
    ...(repo.topics || []),
  ].join(" ").toLowerCase();
  return AI_KEYWORDS.some(kw => text.includes(kw));
}

async function fetchTrendingRepos(daysBack = 1, language = null) {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString().split("T")[0];
  let q = `created:>${since} stars:>10`;
  if (language) q += ` language:${language}`;

  const { data } = await axios.get(GH_SEARCH, {
    params: { q, sort: "stars", order: "desc", per_page: 30 },
    timeout: 10000,
    headers: {
      "Accept":     "application/vnd.github.v3+json",
      "User-Agent": "OmniServiceNode/1.0",
    },
  });
  return data?.items || [];
}

async function fetchTrendingWeekly() {
  const since = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const { data } = await axios.get(GH_SEARCH, {
    params: {
      q:        `created:>${since} stars:>50 topic:ai OR topic:llm OR topic:machine-learning`,
      sort:     "stars",
      order:    "desc",
      per_page: 20,
    },
    timeout: 10000,
    headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "OmniServiceNode/1.0" },
  });
  return data?.items || [];
}

function mapRepo(repo, starsWindow) {
  return {
    name:        repo.full_name,
    description: repo.description?.slice(0, 200) || null,
    url:         repo.html_url,
    stars:       repo.stargazers_count,
    starsWindow,
    forks:       repo.forks_count,
    language:    repo.language,
    topics:      repo.topics || [],
    isAI:        isAIRepo(repo),
    createdAt:   repo.created_at,
    pushedAt:    repo.pushed_at,
    owner:       repo.owner?.login,
    ownerType:   repo.owner?.type,
  };
}

export async function githubTrending(req, res) {
  const { lang = null, days = "1" } = req.query;

  const [daily, weekly] = await Promise.all([
    fetchTrendingRepos(Number(days), lang).catch(() => []),
    fetchTrendingWeekly().catch(() => []),
  ]);

  const dailyMapped  = daily.map(r => mapRepo(r, "today"));
  const weeklyMapped = weekly.map(r => mapRepo(r, "7d"));

  const aiDaily  = dailyMapped.filter(r => r.isAI);
  const aiWeekly = weeklyMapped.filter(r => r.isAI);

  const languages = [...new Set(daily.map(r => r.language).filter(Boolean))];
  const topLang   = Object.entries(
    daily.reduce((acc, r) => {
      if (r.language) acc[r.language] = (acc[r.language] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([l, c]) => ({ language: l, count: c }));

  res.json({
    status: "ok",
    summary: {
      totalDaily:   dailyMapped.length,
      aiReposDaily: aiDaily.length,
      aiRepos7d:    aiWeekly.length,
      topLanguages: topLang,
    },
    trending: {
      today:  dailyMapped.slice(0, 20),
      weekly: weeklyMapped.slice(0, 15),
    },
    aiHighlights: aiDaily.slice(0, 10),
    meta: {
      sources:     ["api.github.com/search/repositories"],
      generatedAt: new Date().toISOString(),
    },
  });
}
