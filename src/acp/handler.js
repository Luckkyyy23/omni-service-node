/**
 * ACP Seller Runtime — Virtuals Protocol Agent Commerce Protocol
 * Registers as a seller agent and handles incoming jobs via AcpClient callbacks
 *
 * Package: @virtuals-protocol/acp-node
 * Marketplace: https://app.virtuals.io/research/agent-commerce-protocol
 */

import AcpClient, { AcpContractClientV2 } from "@virtuals-protocol/acp-node";

// ACP Offering definitions — all 14 endpoints
const OFFERINGS = [
  // ── Tier 1 — Fuel ($0.01 USDC via ACP) ─────────────────────────────────────
  {
    name: "fuel-compliance",
    description: "EU AI Act risk classification + CISA alerts + AI incident history for any company or AI system. Returns prohibited/high-risk/limited-risk classification with obligations and compliance dates.",
    fee: "0.01",
    schema: {
      inputs:  { company: "string (optional)", system: "string (optional)", description: "string" },
      outputs: { riskClassification: "string", obligations: "array", cisaAlerts: "array" },
    },
  },
  {
    name: "fuel-sentiment",
    description: "Real-time AI and crypto market sentiment. Returns fear/greed index, asset prices, trending tokens, and sector signal (RISK_ON/RISK_OFF).",
    fee: "0.01",
    schema: {
      inputs:  { assets: "string (comma-separated: BTC,VIRTUAL,GOLD,ETH,SOL)" },
      outputs: { fearGreed: "object", sector: "object", assets: "object" },
    },
  },
  {
    name: "fuel-signals",
    description: "Directional market signal for Gold, BTC, FX pairs. Returns BUY/SELL/HOLD with entry, stop loss, take profit and confidence score.",
    fee: "0.01",
    schema: {
      inputs:  { symbol: "string (XAUUSD|BTCUSD|EURUSD|GBPUSD|ETHUSD)", timeframe: "string (1m|5m|15m|1h|4h|1d)" },
      outputs: { signal: "BUY|SELL|HOLD", confidence: "number 0-1", entry: "number", stopLoss: "number", takeProfit: "number" },
    },
  },
  {
    name: "fuel-macro",
    description: "Global macro economic intelligence. US Fed rate, CPI, M2, unemployment, GDP, yield curve, G10 FX rates. Rate environment signal: RESTRICTIVE/NEUTRAL/ACCOMMODATIVE.",
    fee: "0.01",
    schema: {
      inputs:  { countries: "string (comma-separated: US,CN,EU,JP,GB)" },
      outputs: { fedRate: "number", cpi: "number", gdp: "number", yieldCurve: "object", fx: "object", rateEnvironment: "string" },
    },
  },
  {
    name: "fuel-news",
    description: "Real-time AI, tech, and market news aggregated from HackerNews, Reddit (r/MachineLearning, r/LocalLLaMA), and NewsAPI. Scored articles and trending keyword signals.",
    fee: "0.01",
    schema: {
      inputs:  { category: "string (ai|crypto|macro|all)", hours: "number (1-168)", limit: "number (1-100)" },
      outputs: { articles: "array", trendingKeywords: "array", signalStrength: "number" },
    },
  },
  {
    name: "fuel-arxiv",
    description: "Latest AI/ML research papers from ArXiv. cs.AI, cs.LG, cs.CL, cs.CV, cs.RO categories. Impact scoring, breakthrough detection, trending topics, author velocity.",
    fee: "0.01",
    schema: {
      inputs:  { category: "string (ai|ml|nlp|cv|robotics|agents|all)", query: "string (optional)", days: "number (1-30)", limit: "number (1-50)" },
      outputs: { papers: "array", breakthroughs: "array", trendingTopics: "array", topAuthors: "array" },
    },
  },
  {
    name: "fuel-sanctions",
    description: "Screen any entity against OFAC, EU, UN, and UK sanctions lists. Returns match probability, risk level, and matched records.",
    fee: "0.01",
    schema: {
      inputs:  { name: "string", country: "string ISO-2 (optional)" },
      outputs: { matchProbability: "number 0-1", riskLevel: "string", matchedRecords: "array" },
    },
  },
  {
    name: "fuel-onchain",
    description: "Real-time blockchain intelligence. Bitcoin fees/mempool/hashrate, Ethereum gas oracle, DeFi TVL from 500+ protocols, top yield opportunities.",
    fee: "0.01",
    schema: {
      inputs:  { chain: "string (all|btc|eth|defi)" },
      outputs: { bitcoin: "object", ethereum: "object", defi: "object" },
    },
  },

  // ── Tier 2 — Premium ($5.00 USDC via ACP) ───────────────────────────────────
  {
    name: "premium-intel",
    description: "B2B AI pivot intelligence — Golden Lead packets for sales agents. Aggregates SEC 8-K filings, GitHub repo velocity, and job board signals into scored company leads with outreach angles.",
    fee: "5.00",
    schema: {
      inputs:  { companies: "array of company names (max 10)" },
      outputs: { goldenLeads: "array", watchList: "array", topLead: "object" },
    },
  },
  {
    name: "premium-github-velocity",
    description: "Fortune 500 GitHub organization analysis. AI repo count, topic pivots, star velocity, commit frequency. Returns pivot score and buyer signal strength.",
    fee: "5.00",
    schema: {
      inputs:  { org: "string (GitHub org slug)", days: "number (1-90)" },
      outputs: { aiRepos: "number", pivotScore: "number", buyerSignal: "string", topAiRepos: "array" },
    },
  },
  {
    name: "premium-job-pivots",
    description: "Companies actively hiring agentic AI roles — strongest buyer signal available. Searches Greenhouse, Lever, HackerNews 'Who is Hiring', and Remotive.",
    fee: "5.00",
    schema: {
      inputs:  { roles: "array of role titles", companies: "array of company names (optional filter)" },
      outputs: { companies: "array", totalJobs: "number", topSignals: "array" },
    },
  },
  {
    name: "premium-sec-filings",
    description: "Real-time SEC EDGAR 8-K/10-K filings from public companies mentioning AI, agentic, or autonomous systems. AI-scored with direct EDGAR filing links.",
    fee: "5.00",
    schema: {
      inputs:  { query: "string", days: "number (1-30)", forms: "string (8-K|10-K|10-Q)", minScore: "number (0-100)" },
      outputs: { filings: "array", summary: "object" },
    },
  },
  {
    name: "premium-patents",
    description: "USPTO PatentsView AI patent intelligence. Who is filing neural network, autonomous agent, and LLM patents. Scored by AI relevance, top assignees ranking.",
    fee: "5.00",
    schema: {
      inputs:  { query: "string (patent keywords)", companies: "string (comma-separated, optional)", days: "number (1-365)" },
      outputs: { patents: "array", topAssignees: "array", summary: "object" },
    },
  },
  {
    name: "premium-company-profile",
    description: "Full company intelligence dossier. Aggregates SEC filings + GitHub engineering velocity + hiring activity + USPTO patents + HackerNews sentiment into a lead score (HOT/WARM/COLD) with outreach angle.",
    fee: "5.00",
    schema: {
      inputs:  { company: "string", github: "string (org slug override, optional)", days: "number (1-90)" },
      outputs: { leadScore: "number 0-100", tier: "HOT|WARM|COLD", outreachAngle: "string", intelligence: "object" },
    },
  },
];

// Execute a job from an ACP buyer agent — routes to internal API
async function executeJob(offering, jobInputs) {
  const base = `http://localhost:${process.env.PORT || 3000}`;

  switch (offering) {
    case "fuel-compliance": {
      const params = new URLSearchParams({
        company:     jobInputs.company     || "",
        system:      jobInputs.system      || "",
        description: jobInputs.description || "",
      }).toString();
      const r = await fetch(`${base}/api/v1/compliance?${params}`);
      return r.json();
    }
    case "fuel-sentiment": {
      const params = new URLSearchParams({ assets: jobInputs.assets || "BTC,VIRTUAL,GOLD" }).toString();
      const r = await fetch(`${base}/api/v1/sentiment?${params}`);
      return r.json();
    }
    case "fuel-signals": {
      const params = new URLSearchParams({
        symbol: jobInputs.symbol    || "XAUUSD",
        tf:     jobInputs.timeframe || "1h",
      }).toString();
      const r = await fetch(`${base}/api/v1/signals?${params}`);
      return r.json();
    }
    case "fuel-macro": {
      const params = new URLSearchParams({ countries: jobInputs.countries || "US,CN,EU,JP,GB" }).toString();
      const r = await fetch(`${base}/api/v1/macro?${params}`);
      return r.json();
    }
    case "fuel-news": {
      const params = new URLSearchParams({
        category: jobInputs.category || "ai",
        hours:    String(jobInputs.hours  || 24),
        limit:    String(jobInputs.limit  || 30),
      }).toString();
      const r = await fetch(`${base}/api/v1/news?${params}`);
      return r.json();
    }
    case "fuel-arxiv": {
      const params = new URLSearchParams({
        category: jobInputs.category || "all",
        query:    jobInputs.query    || "",
        days:     String(jobInputs.days  || 3),
        limit:    String(jobInputs.limit || 20),
      }).toString();
      const r = await fetch(`${base}/api/v1/arxiv?${params}`);
      return r.json();
    }
    case "fuel-sanctions": {
      const r = await fetch(`${base}/api/v1/sanctions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: jobInputs.name, country: jobInputs.country }),
      });
      return r.json();
    }
    case "fuel-onchain": {
      const params = new URLSearchParams({ chain: jobInputs.chain || "all" }).toString();
      const r = await fetch(`${base}/api/v1/onchain?${params}`);
      return r.json();
    }
    case "premium-intel": {
      const r = await fetch(`${base}/api/v2/intel`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ companies: jobInputs.companies }),
      });
      return r.json();
    }
    case "premium-github-velocity": {
      const params = new URLSearchParams({
        org:  jobInputs.org  || "microsoft",
        days: String(jobInputs.days || 30),
      }).toString();
      const r = await fetch(`${base}/api/v2/github-velocity?${params}`);
      return r.json();
    }
    case "premium-job-pivots": {
      const r = await fetch(`${base}/api/v2/job-pivots`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          roles:     jobInputs.roles     || ["AI Engineer", "ML Engineer"],
          companies: jobInputs.companies || [],
        }),
      });
      return r.json();
    }
    case "premium-sec-filings": {
      const params = new URLSearchParams({
        query:    jobInputs.query    || "agentic AI",
        days:     String(jobInputs.days     || 7),
        forms:    jobInputs.forms    || "8-K",
        minScore: String(jobInputs.minScore || 0),
      }).toString();
      const r = await fetch(`${base}/api/v2/sec-filings?${params}`);
      return r.json();
    }
    case "premium-patents": {
      const params = new URLSearchParams({
        query:     jobInputs.query     || "artificial intelligence agentic",
        companies: jobInputs.companies || "",
        days:      String(jobInputs.days || 90),
      }).toString();
      const r = await fetch(`${base}/api/v2/patents?${params}`);
      return r.json();
    }
    case "premium-company-profile": {
      const r = await fetch(`${base}/api/v2/company-profile`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          company: jobInputs.company,
          github:  jobInputs.github || "",
          days:    jobInputs.days   || 30,
        }),
      });
      return r.json();
    }
    default:
      return { error: "Unknown offering" };
  }
}

// Match an incoming job to one of our offerings by name
function matchOffering(job) {
  const jobName = (job.name || "").toLowerCase();
  const jobReq = typeof job.requirement === "string"
    ? job.requirement.toLowerCase()
    : JSON.stringify(job.requirement || {}).toLowerCase();

  for (const offering of OFFERINGS) {
    if (jobName.includes(offering.name) || jobReq.includes(offering.name)) {
      return offering.name;
    }
  }
  // Fuzzy: check if any offering keyword appears
  for (const offering of OFFERINGS) {
    const keywords = offering.name.split("-");
    if (keywords.some(kw => jobReq.includes(kw) || jobName.includes(kw))) {
      return offering.name;
    }
  }
  return null;
}

// Parse job inputs from the requirement/memo content
function parseJobInputs(job) {
  try {
    const req = job.requirement;
    if (req && typeof req === "object") return req;
    if (typeof req === "string") {
      try { return JSON.parse(req); } catch { /* not JSON */ }
    }
    // Try latest memo content
    const lastMemo = job.latestMemo;
    if (lastMemo?.content) {
      try { return JSON.parse(lastMemo.content); } catch { /* not JSON */ }
    }
    return {};
  } catch {
    return {};
  }
}

// ── Start ACP Seller Runtime ──────────────────────────────────────────────────
export async function startAcpRuntime() {
  const privateKey = process.env.AGENT_WALLET_PRIVATE_KEY;
  const agentWalletAddress = process.env.AGENT_WALLET_ADDRESS || process.env.WALLET_ADDRESS;

  if (!privateKey) {
    console.warn("[ACP] No AGENT_WALLET_PRIVATE_KEY — seller runtime not started");
    return;
  }
  if (!agentWalletAddress) {
    console.warn("[ACP] No AGENT_WALLET_ADDRESS / WALLET_ADDRESS — seller runtime not started");
    return;
  }

  try {
    // Build the contract client (V2 — Base mainnet)
    // sessionEntityKeyId = 0 for default session key
    const contractClient = await AcpContractClientV2.build(
      privateKey,
      0,
      agentWalletAddress,
    );

    // Create AcpClient with seller callbacks
    const acpClient = new AcpClient({
      acpContractClient: contractClient,
      onNewTask: async (job, memoToSign) => {
        console.log(`[ACP] New task received: job #${job.id} from ${job.clientAddress?.slice(0, 10)}...`);
        console.log(`[ACP]   name: ${job.name}, phase: ${job.phase}`);

        const offeringName = matchOffering(job);
        if (!offeringName) {
          console.log(`[ACP] No matching offering for job #${job.id} — rejecting`);
          try {
            await job.reject("No matching service offering found");
          } catch (e) {
            console.error(`[ACP] Failed to reject job #${job.id}:`, e.message);
          }
          return;
        }

        console.log(`[ACP] Matched offering: ${offeringName} for job #${job.id}`);

        try {
          // Accept the job first
          if (memoToSign) {
            await memoToSign.sign(true, `Accepted — fulfilling via ${offeringName}`);
            console.log(`[ACP] Signed memo for job #${job.id}`);
          } else {
            await job.accept(`Accepted — fulfilling via ${offeringName}`);
            console.log(`[ACP] Accepted job #${job.id}`);
          }

          // Execute the service
          const inputs = parseJobInputs(job);
          const result = await executeJob(offeringName, inputs);
          console.log(`[ACP] Executed ${offeringName} for job #${job.id}`);

          // Deliver the result
          const deliverable = typeof result === "string" ? result : result;
          await job.deliver(deliverable);
          console.log(`[ACP] Delivered result for job #${job.id}`);
        } catch (e) {
          console.error(`[ACP] Error handling job #${job.id}:`, e.message);
          try {
            await job.reject(`Service error: ${e.message}`);
          } catch (rejectErr) {
            console.error(`[ACP] Failed to reject after error:`, rejectErr.message);
          }
        }
      },
      onEvaluate: async (job) => {
        // As a seller, auto-approve evaluations (trust the evaluator)
        console.log(`[ACP] Evaluation request for job #${job.id}`);
      },
    });

    // Initialize the client (connects WebSocket for real-time job notifications)
    await acpClient.init();

    console.log("[ACP] Seller runtime live — listening for jobs on Virtuals Protocol");
    console.log(`[ACP] Agent wallet: ${agentWalletAddress}`);
    console.log(`[ACP] ${OFFERINGS.length} offerings available`);
    console.log("[ACP] Marketplace: https://app.virtuals.io/research/agent-commerce-protocol");

    return acpClient;
  } catch (e) {
    console.error("[ACP] Failed to start runtime:", e.message);
  }
}
