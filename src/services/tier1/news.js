/**
 * TIER 1 — Real-Time News Intelligence
 * Aggregated AI/tech/market news every monitoring agent needs
 *
 * Sources (all free, no auth):
 *   HackerNews Algolia API: tech community signal, AI discussion
 *   Reddit: r/MachineLearning, r/artificial, r/LocalLLaMA (public JSON)
 *   NewsAPI: financial + AI news (needs NEWS_API_KEY, free 100/day)
 *   RSS fallback: major outlets via public RSS
 */

import axios from "axios";

const HN_API   = "https://hn.algolia.com/api/v1";
const REDDIT   = "https://www.reddit.com";
const NEWS_API = "https://newsapi.org/v2";

// HackerNews: top AI/agentic stories from last N hours
async function fetchHackerNews(query, hours = 24) {
  const since = Math.floor((Date.now() - hours * 3600000) / 1000);
  const { data } = await axios.get(`${HN_API}/search_by_date`, {
    params: {
      query,
      tags: "story",
      numericFilters: `created_at_i>${since},points>10`,
      hitsPerPage: 15,
    },
    timeout: 8000,
  });
  return (data.hits || []).map(h => ({
    source:    "hacker_news",
    title:     h.title,
    url:       h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    points:    h.points,
    comments:  h.num_comments,
    author:    h.author,
    publishedAt: new Date(h.created_at).toISOString(),
    sentiment: h.points > 200 ? "HIGH_SIGNAL" : h.points > 50 ? "SIGNAL" : "LOW",
  }));
}

// Reddit: latest posts from AI subreddits
async function fetchReddit(subreddits = "MachineLearning+artificial+LocalLLaMA+singularity") {
  const { data } = await axios.get(`${REDDIT}/r/${subreddits}/hot.json`, {
    params: { limit: 20, t: "day" },
    timeout: 8000,
    headers: { "User-Agent": "OmniServiceNode/1.0 research@omni-service.io" },
  });
  return (data.data?.children || []).map(({ data: p }) => ({
    source:    "reddit",
    subreddit: p.subreddit,
    title:     p.title,
    url:       p.url?.startsWith("https://") ? p.url : `https://reddit.com${p.permalink}`,
    score:     p.score,
    comments:  p.num_comments,
    publishedAt: new Date(p.created_utc * 1000).toISOString(),
    sentiment: p.score > 1000 ? "HIGH_SIGNAL" : p.score > 200 ? "SIGNAL" : "LOW",
  }));
}

// NewsAPI: AI + market news (requires NEWS_API_KEY)
async function fetchNewsAPI(query, hours = 24) {
  if (!process.env.NEWS_API_KEY) return [];
  const from = new Date(Date.now() - hours * 3600000).toISOString();
  const { data } = await axios.get(`${NEWS_API}/everything`, {
    params: {
      q: query,
      from,
      sortBy: "publishedAt",
      language: "en",
      pageSize: 20,
      apiKey: process.env.NEWS_API_KEY,
    },
    timeout: 8000,
  });
  return (data.articles || []).map(a => ({
    source:    a.source?.name || "newsapi",
    title:     a.title,
    url:       a.url,
    description: a.description,
    publishedAt: a.publishedAt,
    sentiment: "SIGNAL",
  }));
}

// Score and rank news items by AI/market signal strength
function scoreArticle(item, category) {
  const text = `${item.title} ${item.description || ""}`.toLowerCase();
  let score  = item.points || item.score || 50;

  const boosts = {
    agentic:    20, "autonomous agent": 18, "mcp": 15,
    "gpt-5": 12, "claude 4": 12, "gemini 2": 12,
    breakthrough: 10, acquisition: 10, "funding round": 8,
    regulation: 8, "open source": 6, "api": 5,
  };
  for (const [kw, pts] of Object.entries(boosts)) {
    if (text.includes(kw)) score += pts;
  }
  return Math.min(100, Math.round(score / 10));
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function news(req, res) {
  const {
    category = "ai",      // ai | crypto | macro | all
    hours    = "24",
    limit    = "30",
  } = req.query;

  const queryMap = {
    ai:     ["agentic AI autonomous", "LLM machine learning", "Claude GPT Gemini"],
    crypto: ["bitcoin ethereum DeFi blockchain", "crypto regulation stablecoin"],
    macro:  ["Federal Reserve interest rates inflation", "market recession GDP"],
    all:    ["agentic AI bitcoin market economy"],
  };

  const queries = queryMap[category] || queryMap["ai"];

  const [hnResults, redditResults, newsResults] = await Promise.allSettled([
    fetchHackerNews(queries[0], Number(hours)),
    fetchReddit(),
    fetchNewsAPI(queries[0], Number(hours)),
  ]);

  const allArticles = [
    ...(hnResults.status === "fulfilled" ? hnResults.value : []),
    ...(newsResults.status === "fulfilled" ? newsResults.value : []),
    ...(redditResults.status === "fulfilled" ? redditResults.value : []),
  ]
  .map(item => ({ ...item, signalScore: scoreArticle(item, category) }))
  .sort((a, b) => b.signalScore - a.signalScore)
  .slice(0, Number(limit));

  // Trending topics extraction
  const allText = allArticles.map(a => a.title.toLowerCase()).join(" ");
  const trendingKeywords = [
    "agentic", "autonomous", "mcp", "openai", "anthropic", "google",
    "regulation", "acquisition", "funding", "breakthrough", "model",
    "bitcoin", "ethereum", "defi", "stablecoin",
    "rate", "inflation", "recession", "gdp",
  ].map(kw => ({
    keyword: kw,
    mentions: (allText.match(new RegExp(kw, "g")) || []).length,
  }))
  .filter(k => k.mentions > 0)
  .sort((a, b) => b.mentions - a.mentions)
  .slice(0, 10);

  res.json({
    status: "ok",
    category,
    summary: {
      totalArticles:    allArticles.length,
      highSignal:       allArticles.filter(a => a.sentiment === "HIGH_SIGNAL").length,
      trendingKeywords,
      topStory:         allArticles[0]?.title || null,
    },
    articles: allArticles,
    meta: {
      sources:    ["HackerNews Algolia", "Reddit", process.env.NEWS_API_KEY ? "NewsAPI" : "NewsAPI (disabled - no key)"],
      hoursBack:  Number(hours),
      generatedAt: new Date().toISOString(),
    },
  });
}
