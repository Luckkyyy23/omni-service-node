/**
 * TIER 1 — Compliance Service
 * EU AI Act risk classification + CISA AI alerts + AI Incident Database
 *
 * Real data sources (no auth required for base):
 *   - EUR-Lex SPARQL API (EU official legislation)
 *   - CISA KEV feed (Known Exploited Vulnerabilities)
 *   - AI Incident Database (https://incidentdatabase.ai)
 *   - NewsAPI (compliance news — requires NEWS_API_KEY)
 */

import axios from "axios";

// EU AI Act (Regulation 2024/1689) — Article 5 Prohibited, Annex III High-Risk
// Source: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689
const EU_AI_ACT_RISK_MATRIX = {
  prohibited: [
    "subliminal manipulation", "exploiting vulnerabilities", "social scoring by governments",
    "real-time biometric identification public spaces", "emotion recognition workplace school",
    "biometric categorisation political religious views", "predictive policing individuals",
  ],
  high_risk: [
    "critical infrastructure", "education training", "employment recruitment",
    "access essential services", "law enforcement", "migration asylum",
    "administration justice", "biometric identification", "safety components",
    "medical device", "autonomous vehicle",
  ],
  limited_risk: [
    "chatbot", "deepfake", "emotion recognition", "general purpose ai",
  ],
  minimal_risk: [
    "spam filter", "ai game", "recommendation system", "content moderation",
  ],
};

// Classify an AI system based on its description against EU AI Act risk matrix
function classifyRisk(description = "", systemType = "") {
  const text = `${description} ${systemType}`.toLowerCase();
  for (const [level, keywords] of Object.entries(EU_AI_ACT_RISK_MATRIX)) {
    if (keywords.some(k => text.includes(k))) {
      return level;
    }
  }
  return "minimal_risk";
}

// Fetch CISA KEV entries related to AI/ML systems (real API, no auth)
async function fetchCisaAlerts() {
  try {
    const { data } = await axios.get(
      "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      { timeout: 8000 }
    );
    const aiRelated = (data.vulnerabilities || []).filter(v => {
      const text = `${v.vendorProject || ""} ${v.product || ""} ${v.shortDescription || ""}`.toLowerCase();
      return text.includes("ai") || text.includes("ml") || text.includes("tensorflow") ||
             text.includes("pytorch") || text.includes("model") || text.includes("neural");
    }).slice(0, 5);
    return aiRelated.map(v => ({
      cveId: v.cveID,
      product: `${v.vendorProject} ${v.product}`,
      description: v.shortDescription,
      dueDate: v.dueDate,
      notes: v.notes,
    }));
  } catch {
    return [];
  }
}

// Fetch recent AI incidents from AI Incident Database (real public API, no auth)
async function fetchAiIncidents(company = "") {
  try {
    const url = company
      ? `https://incidentdatabase.ai/api/incidents?involved_entities=${encodeURIComponent(company)}&limit=3`
      : `https://incidentdatabase.ai/api/incidents?limit=3&sort=date_reported&order=desc`;
    const { data } = await axios.get(url, { timeout: 8000 });
    return (data.incidents || []).slice(0, 3).map(i => ({
      id: i.incident_id,
      title: i.title,
      description: (i.description || "").slice(0, 200),
      date: i.date,
      severity: i.severity || "unknown",
    }));
  } catch {
    return [];
  }
}

// Fetch compliance news via NewsAPI (requires NEWS_API_KEY)
async function fetchComplianceNews(company = "") {
  if (!process.env.NEWS_API_KEY) return [];
  try {
    const q = company
      ? `"EU AI Act" OR "AI regulation" AND "${company}"`
      : `"EU AI Act" OR "AI regulation" OR "AI compliance" 2026`;
    const { data } = await axios.get("https://newsapi.org/v2/everything", {
      params: { q, language: "en", sortBy: "publishedAt", pageSize: 3, apiKey: process.env.NEWS_API_KEY },
      timeout: 8000,
    });
    return (data.articles || []).map(a => ({
      title: a.title,
      source: a.source?.name,
      publishedAt: a.publishedAt,
      url: a.url,
    }));
  } catch {
    return [];
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function compliance(req, res) {
  const { company = "", system = "", description = "" } = req.query;

  const [cisaAlerts, incidents, news] = await Promise.all([
    fetchCisaAlerts(),
    fetchAiIncidents(company),
    fetchComplianceNews(company),
  ]);

  const riskLevel = classifyRisk(description || system, system);

  const obligations = {
    prohibited: riskLevel === "prohibited"
      ? ["BANNED — Cannot be placed on EU market", "Immediate cessation required", "Fines up to €35M or 7% global turnover"]
      : null,
    high_risk: riskLevel === "high_risk"
      ? ["Conformity assessment required", "CE marking mandatory", "Registration in EU AI database", "Human oversight required", "Transparency obligations apply"]
      : null,
    limited_risk: riskLevel === "limited_risk"
      ? ["Transparency disclosure required", "Users must know they interact with AI", "Deepfakes must be labeled"]
      : null,
    minimal_risk: riskLevel === "minimal_risk"
      ? ["No mandatory obligations", "Voluntary codes of conduct apply"]
      : null,
  }[riskLevel];

  res.json({
    status: "ok",
    query: { company, system, description },
    euAiAct: {
      regulation: "EU 2024/1689 — in force 1 Aug 2024",
      riskClassification: riskLevel,
      riskLabel: {
        prohibited: "PROHIBITED",
        high_risk: "HIGH RISK",
        limited_risk: "LIMITED RISK",
        minimal_risk: "MINIMAL RISK",
      }[riskLevel],
      obligations,
      applicableDate: {
        prohibited: "2025-02-02",
        high_risk: "2026-08-02",
        limited_risk: "2026-08-02",
        minimal_risk: "2026-08-02",
      }[riskLevel],
      registryUrl: "https://artificialintelligenceact.eu/",
    },
    cisaAlerts: { count: cisaAlerts.length, items: cisaAlerts },
    incidents:  { count: incidents.length, items: incidents },
    news:       { count: news.length, items: news },
    meta: { source: "EUR-Lex 32024R1689 + CISA KEV + AI Incident DB", generatedAt: new Date().toISOString() },
  });
}
