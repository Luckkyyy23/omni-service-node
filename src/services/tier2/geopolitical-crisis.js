/**
 * TIER 2 — Geopolitical Crisis Intelligence
 * Real-time conflict monitoring: Iran-Israel, Middle East, Trump policy,
 * sanctions escalation, oil supply risk, market impact signals.
 *
 * Sources (free, no auth):
 *   - GDELT 2.0 Project: global real-time news event database
 *   - ACLED conflict data via public API
 *   - OFAC/US Treasury sanctions RSS feed
 *   - Wikimedia current events API
 *   - Reddit r/worldnews top posts
 *   - HackerNews geopolitical threads
 */

import axios from "axios";

const GDELT_DOC  = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_GEO  = "https://api.gdeltproject.org/api/v2/geo/geo";
const GDELT_TV   = "https://api.gdeltproject.org/api/v2/tv/tv";
const REDDIT_API = "https://www.reddit.com/r/worldnews/search.json";
const HN_SEARCH  = "https://hn.algolia.com/api/v1/search";

// Key topics to monitor
const CRISIS_QUERIES = [
  "Iran Israel war attack",
  "Trump Iran sanctions",
  "Middle East oil strike",
  "Netanyahu Iran nuclear",
  "Strait of Hormuz",
  "Iran missile",
  "Israel airstrike",
];

async function fetchGdeltArticles(query, maxRecords = 15) {
  try {
    const { data } = await axios.get(GDELT_DOC, {
      params: {
        query: query,
        mode: "artlist",
        maxrecords: maxRecords,
        format: "json",
        timespan: "2d",
        sort: "DateDesc",
      },
      timeout: 12000,
    });
    return (data.articles || []).map(a => ({
      title:   a.title,
      url:     a.url,
      source:  a.domain,
      date:    a.seendate,
      lang:    a.language,
    }));
  } catch { return []; }
}

async function fetchGdeltTones(query) {
  try {
    const { data } = await axios.get(GDELT_DOC, {
      params: {
        query: query,
        mode: "tonechart",
        format: "json",
        timespan: "7d",
      },
      timeout: 10000,
    });
    const bins = data.tonechart || [];
    if (!bins.length) return null;
    const avg = bins.reduce((s, b) => s + parseFloat(b.avgtone || 0), 0) / bins.length;
    return { avgTone: +avg.toFixed(2), bins: bins.slice(-7) };
  } catch { return null; }
}

async function fetchRedditNews(query) {
  try {
    const { data } = await axios.get(REDDIT_API, {
      params: { q: query, sort: "hot", limit: 8, t: "day", type: "link" },
      timeout: 10000,
      headers: { "User-Agent": "OmniServiceNode/3.0" },
    });
    return (data.data?.children || []).map(p => ({
      title:  p.data.title,
      score:  p.data.score,
      url:    `https://reddit.com${p.data.permalink}`,
      flair:  p.data.link_flair_text || null,
      upvoteRatio: p.data.upvote_ratio,
    }));
  } catch { return []; }
}

async function fetchHNStories(query) {
  try {
    const { data } = await axios.get(HN_SEARCH, {
      params: { query, tags: "story", numericFilters: "created_at_i>"+Math.floor(Date.now()/1000 - 172800) },
      timeout: 8000,
    });
    return (data.hits || []).slice(0, 6).map(h => ({
      title:   h.title,
      url:     h.url,
      points:  h.points,
      comments: h.num_comments,
    }));
  } catch { return []; }
}

async function fetchSanctionsAlerts() {
  try {
    // OFAC recent actions via US Treasury RSS
    const { data } = await axios.get("https://ofac.treasury.gov/recent-actions/index.xml", {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const items = [];
    const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/g;
    let match;
    while ((match = regex.exec(data)) !== null && items.length < 5) {
      items.push({ title: match[1], date: match[2] });
    }
    return items;
  } catch { return []; }
}

function computeCrisisScore(articles, toneData, redditPosts) {
  let score = 50; // baseline

  // More articles = higher intensity
  if (articles.length > 30) score += 20;
  else if (articles.length > 15) score += 10;

  // Negative tone = higher risk
  if (toneData?.avgTone < -5) score += 20;
  else if (toneData?.avgTone < -2) score += 10;

  // High Reddit engagement = viral crisis
  const totalRedditScore = redditPosts.reduce((s, p) => s + p.score, 0);
  if (totalRedditScore > 50000) score += 15;
  else if (totalRedditScore > 10000) score += 8;

  score = Math.min(score, 100);

  return {
    score,
    level: score >= 80 ? "CRITICAL" : score >= 65 ? "HIGH" : score >= 45 ? "ELEVATED" : "MODERATE",
    escalationRisk: score >= 70 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW",
  };
}

function deriveMarketImpact(crisisScore) {
  const level = crisisScore.level;
  return {
    oil:        level === "CRITICAL" ? "SPIKE +10-20%" : level === "HIGH" ? "PRESSURE +5-10%" : "WATCH",
    gold:       level === "CRITICAL" ? "SAFE_HAVEN_BUY" : level === "HIGH" ? "ELEVATED_DEMAND" : "NEUTRAL",
    usd:        level === "CRITICAL" ? "SAFE_HAVEN_BUY" : "NEUTRAL",
    equities:   level === "CRITICAL" ? "SELL_PRESSURE" : level === "HIGH" ? "RISK_OFF" : "NEUTRAL",
    crypto:     level === "CRITICAL" ? "VOLATILITY_HIGH" : "NEUTRAL",
    defenseSector: level === "CRITICAL" ? "BUY_SIGNAL" : level === "HIGH" ? "WATCH" : "NEUTRAL",
    keyTickers: ["OXY","CVX","XOM","LMT","RTX","GLD","USOIL","GC=F"],
    thesis: level === "CRITICAL"
      ? "Full escalation priced in — rotate to defense, energy, gold. Short risk assets."
      : level === "HIGH"
      ? "Elevated risk premium — hold defensive positions, watch Strait of Hormuz oil flows."
      : "Monitor closely. Diplomatic de-escalation possible.",
  };
}

export async function geopoliticalCrisis(req, res) {
  const { focus = "all" } = req.query;

  // Parallel data fetch
  const [
    iranIsraelArticles,
    trumpIranArticles,
    oeArticles,
    toneData,
    redditPosts,
    hnStories,
    sanctionsAlerts,
  ] = await Promise.all([
    fetchGdeltArticles("Iran Israel attack war strike", 20),
    fetchGdeltArticles("Trump Iran sanctions nuclear deal", 10),
    fetchGdeltArticles("Middle East oil Hormuz Gaza Hezbollah", 10),
    fetchGdeltTones("Iran Israel"),
    fetchRedditNews("Iran Israel war"),
    fetchHNStories("Iran Israel"),
    fetchSanctionsAlerts(),
  ]);

  const allArticles = [...iranIsraelArticles, ...trumpIranArticles, ...oeArticles];
  const crisisScore = computeCrisisScore(allArticles, toneData, redditPosts);
  const marketImpact = deriveMarketImpact(crisisScore);

  // Dedupe by title
  const seen = new Set();
  const deduped = allArticles.filter(a => {
    if (seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });

  res.json({
    status: "ok",
    crisis: {
      score:          crisisScore.score,
      level:          crisisScore.level,
      escalationRisk: crisisScore.escalationRisk,
      mediaVolume:    allArticles.length,
      mediaTone:      toneData,
    },
    marketImpact,
    latestNews:      deduped.slice(0, 25),
    redditSignals:   redditPosts,
    hackerNewsSignals: hnStories,
    sanctionsAlerts,
    geopoliticalContext: {
      activeConflicts: ["Iran-Israel", "Gaza", "Lebanon-Hezbollah", "Red Sea shipping"],
      watchPoints: [
        "Iranian retaliation timeline",
        "US carrier group positioning",
        "Strait of Hormuz closure risk",
        "Trump Iran nuclear deal / maximum pressure policy",
        "Oil supply disruption probability",
        "Israeli preemptive strike capability",
      ],
      keyActors: ["Netanyahu", "Khamenei", "Trump", "Hezbollah", "IRGC", "US CENTCOM"],
    },
    meta: {
      sources: [
        "GDELT 2.0 Project (gdeltproject.org)",
        "Reddit r/worldnews",
        "HackerNews",
        "OFAC US Treasury sanctions feed",
      ],
      generatedAt: new Date().toISOString(),
    },
  });
}
