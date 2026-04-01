/**
 * TIER 2 — Competitor Intelligence Service
 * Deep competitive analysis for any company or domain
 *
 * Sources (free, no auth):
 *   - GitHub Search API
 *   - HN Algolia
 *   - Reddit Search
 *   - SEC EDGAR full-text search
 */

import axios from "axios";

const GH_SEARCH    = "https://api.github.com/search/repositories";
const HN_API       = "https://hn.algolia.com/api/v1/search";
const REDDIT_API   = "https://www.reddit.com/search.json";
const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index";

async function fetchGitHubActivity(query) {
  const { data } = await axios.get(GH_SEARCH, {
    params: { q: `${query} in:name,description,topics`, sort: "stars", order: "desc", per_page: 10 },
    timeout: 8000,
    headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "OmniServiceNode/1.0" },
  });
  const repos = data?.items || [];
  return {
    repoCount:  repos.length,
    totalStars: repos.reduce((a, r) => a + r.stargazers_count, 0),
    topRepos:   repos.slice(0, 5).map(r => ({
      name:        r.full_name,
      stars:       r.stargazers_count,
      language:    r.language,
      description: r.description?.slice(0, 150),
      updatedAt:   r.updated_at,
    })),
  };
}

async function fetchHNMentions(query) {
  const { data } = await axios.get(HN_API, {
    params: { query, tags: "story", hitsPerPage: 15 },
    timeout: 8000,
  });
  const hits = data?.hits || [];
  const totalPoints = hits.reduce((a, h) => a + (h.points || 0), 0);
  const avgPoints   = hits.length ? Math.round(totalPoints / hits.length) : 0;
  return {
    mentions:   hits.length,
    avgPoints,
    sentiment:  avgPoints > 100 ? "POSITIVE" : avgPoints > 30 ? "NEUTRAL" : "LOW_INTEREST",
    topStories: hits.slice(0, 5).map(h => ({
      title:    h.title,
      points:   h.points || 0,
      comments: h.num_comments || 0,
      date:     new Date(h.created_at).toISOString().split("T")[0],
      url:      h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    })),
  };
}

async function fetchRedditMentions(query) {
  const { data } = await axios.get(REDDIT_API, {
    params: { q: query, sort: "hot", limit: 15, type: "link" },
    timeout: 8000,
    headers: { "User-Agent": "OmniServiceNode/1.0" },
  });
  const posts  = data?.data?.children || [];
  const upvotes = posts.reduce((a, p) => a + (p.data?.score || 0), 0);
  const pos    = posts.filter(p => p.data?.score > 100).length;
  return {
    posts:      posts.length,
    totalUpvotes: upvotes,
    sentiment:  pos > posts.length / 2 ? "POSITIVE" : "MIXED",
    topPosts:   posts.slice(0, 4).map(p => ({
      title:     p.data?.title,
      subreddit: p.data?.subreddit,
      score:     p.data?.score,
      comments:  p.data?.num_comments,
      url:       `https://reddit.com${p.data?.permalink}`,
    })),
  };
}

async function fetchEdgarMentions(company) {
  const startDate = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
  const { data }  = await axios.get(EDGAR_SEARCH, {
    params: { q: company, dateRange: "custom", startdt: startDate, forms: "8-K" },
    timeout: 10000,
    headers: { "User-Agent": "OmniServiceNode research@omni-service.io", "Accept": "application/json" },
  });
  const hits = data?.hits?.hits || [];
  return {
    filings8K:    hits.length,
    latestFiling: hits[0]?._source?.file_date || null,
    isPublic:     hits.length > 0,
  };
}

export async function competitorIntel(req, res) {
  const { domain, company } = req.query;
  const query = company || domain?.split(".")[0] || "OpenAI";

  const [github, hn, reddit, edgar] = await Promise.all([
    fetchGitHubActivity(query).catch(() => null),
    fetchHNMentions(query).catch(() => null),
    fetchRedditMentions(query).catch(() => null),
    fetchEdgarMentions(query).catch(() => null),
  ]);

  const signals = [
    hn?.sentiment === "POSITIVE"    ? 2 : hn?.sentiment === "NEUTRAL" ? 1 : 0,
    reddit?.sentiment === "POSITIVE" ? 2 : 1,
    github?.totalStars > 10000      ? 2 : github?.totalStars > 1000 ? 1 : 0,
  ];
  const overallScore = Math.round(signals.reduce((a, s) => a + s, 0) / signals.length * 33.3);

  res.json({
    status: "ok",
    query,
    overallScore,
    overallSignal: overallScore > 60 ? "STRONG_PRESENCE" : overallScore > 30 ? "NOTABLE" : "LOW_PROFILE",
    github,
    hackerNews: hn,
    reddit,
    secFilings: edgar,
    meta: {
      sources:     ["github.com", "hn.algolia.com", "reddit.com", "efts.sec.gov"],
      generatedAt: new Date().toISOString(),
    },
  });
}
