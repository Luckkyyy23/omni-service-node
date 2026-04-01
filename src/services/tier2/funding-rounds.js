/**
 * TIER 2 — AI Funding Rounds Service
 * Recent AI startup funding rounds from HN + EDGAR Form D
 *
 * Sources (free, no auth):
 *   - HN Algolia: recent funding news stories
 *   - SEC EDGAR Form D: startup equity offerings
 */

import axios from "axios";

const HN_API     = "https://hn.algolia.com/api/v1/search";
const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index";

const AI_KEYWORDS_RE = /\b(ai|artificial intelligence|machine learning|llm|gpt|model|agent|automation|generative|deep learning|nlp|robotics|computer vision)\b/i;

async function fetchHNFunding() {
  const { data } = await axios.get(HN_API, {
    params: {
      query:      "AI startup funding million raised",
      tags:       "story",
      hitsPerPage: 25,
      numericFilters: "created_at_i>0",
    },
    timeout: 10000,
  });
  return (data?.hits || []).filter(h => AI_KEYWORDS_RE.test(h.title + " " + (h.story_text || "")));
}

async function fetchEdgarFormD() {
  const startDate = new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0];
  const endDate   = new Date().toISOString().split("T")[0];
  const { data }  = await axios.get(EDGAR_SEARCH, {
    params: {
      q:         "artificial intelligence machine learning",
      forms:     "D",
      dateRange: "custom",
      startdt:   startDate,
      enddt:     endDate,
    },
    timeout: 12000,
    headers: {
      "User-Agent": "OmniServiceNode research@omni-service.io",
      "Accept":     "application/json",
    },
  });
  return data?.hits?.hits || [];
}

function parseHNRound(hit) {
  const text  = hit.title + " " + (hit.story_text || "");
  const amtM  = text.match(/\$(\d+(?:\.\d+)?)\s*[mM](?:illion)?/);
  const amtB  = text.match(/\$(\d+(?:\.\d+)?)\s*[bB](?:illion)?/);
  const round = text.match(/\b(seed|pre-seed|series [a-e]|pre-[a-e])\b/i);
  const amount = amtB
    ? `$${amtB[1]}B`
    : amtM
    ? `$${amtM[1]}M`
    : null;
  return {
    source:  "HackerNews",
    title:   hit.title,
    url:     hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
    date:    new Date(hit.created_at).toISOString().split("T")[0],
    amount,
    round:   round ? round[0].toUpperCase() : null,
    aiScore: AI_KEYWORDS_RE.test(hit.title) ? 80 : 40,
    points:  hit.points || 0,
    comments: hit.num_comments || 0,
  };
}

function parseEdgarD(hit) {
  const src  = hit._source || {};
  const name = src.display_names?.[0]?.split(/\s{2,}/)?.[0]?.trim() || "Unknown";
  return {
    source:  "SEC EDGAR Form D",
    company: name,
    filedAt: src.file_date,
    description: src.file_description || null,
    url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(name)}&type=D&dateb=&owner=include&count=5`,
    amount: null,
    round:  "Form D (equity offering)",
    aiScore: 60,
  };
}

export async function fundingRounds(req, res) {
  const [hnHits, edgarHits] = await Promise.all([
    fetchHNFunding().catch(() => []),
    fetchEdgarFormD().catch(() => []),
  ]);

  const hnRounds    = hnHits.map(parseHNRound);
  const edgarRounds = edgarHits.slice(0, 10).map(parseEdgarD);

  const combined = [...hnRounds, ...edgarRounds]
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, 25);

  const withAmount = combined.filter(r => r.amount);
  const totalRaised = withAmount.length;

  res.json({
    status: "ok",
    summary: {
      roundsFound:   combined.length,
      withAmounts:   totalRaised,
      hnStories:     hnRounds.length,
      edgarFormDs:   edgarRounds.length,
    },
    rounds: combined,
    meta: {
      sources:     ["hn.algolia.com", "efts.sec.gov (Form D)"],
      generatedAt: new Date().toISOString(),
    },
  });
}
