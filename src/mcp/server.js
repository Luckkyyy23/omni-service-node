/**
 * MCP Server — Model Context Protocol (HTTP transport)
 * 13 tools covering every data need any AI agent has.
 * Registered on Smithery + MCP Registry for automatic discovery.
 */

import { McpServer }  from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Router }     from "express";
import { z }          from "zod";

const BASE = () => `http://localhost:${process.env.PORT || 3000}`;

function registerTools(server) {

  // ── TIER 1 TOOLS ────────────────────────────────────────────────────────────

  server.tool(
    "check_ai_compliance",
    "Classify any company or AI system against EU AI Act 2024/1689 risk tiers (prohibited/high-risk/limited-risk/minimal-risk) with all legal obligations, deadlines, and CISA vulnerability alerts.",
    {
      company:     z.string().optional().describe("Company name (e.g. OpenAI, Google, Meta)"),
      system:      z.string().optional().describe("AI system type (e.g. chatbot, hiring tool, biometric scanner, autonomous vehicle)"),
      description: z.string().optional().describe("Free-text description of the AI system and its use case"),
    },
    async ({ company, system, description }) => {
      const params = new URLSearchParams({ company: company || "", system: system || "", description: description || "" });
      const r = await fetch(`${BASE()}/api/v1/compliance?${params}`);
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  server.tool(
    "screen_sanctions",
    "Screen any individual, company, or vessel against OFAC, EU, UN, and UK sanctions lists. Returns match probability, risk level, and matched records with source citations.",
    {
      name:    z.string().describe("Entity name to screen (individual, company, vessel, or address)"),
      country: z.string().optional().describe("ISO 2-letter country code to narrow search (e.g. RU, IR, KP, SY)"),
    },
    async ({ name, country }) => {
      const r = await fetch(`${BASE()}/api/v1/sanctions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, country }),
      });
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  server.tool(
    "get_market_sentiment",
    "Real-time crypto and AI market sentiment. Returns Alternative.me Fear & Greed Index, CoinGecko global market data, asset prices, trending tokens, and RISK_ON/RISK_OFF sector signal.",
    {
      assets: z.string().default("BTC,ETH,VIRTUAL,GOLD,SOL").describe("Comma-separated symbols: BTC, ETH, VIRTUAL, GOLD, SOL, DOGE, AVAX"),
    },
    async ({ assets }) => {
      const r = await fetch(`${BASE()}/api/v1/sentiment?assets=${encodeURIComponent(assets)}`);
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  server.tool(
    "get_trading_signal",
    "Directional trading signal (BUY/SELL/HOLD) for Gold, BTC, FX pairs. Returns entry price, stop loss, take profit, R:R ratio, RSI, EMA, ATR, and confidence score 0-1.",
    {
      symbol:    z.string().default("XAUUSD").describe("Symbol: XAUUSD, BTCUSD, EURUSD, GBPUSD, ETHUSD, DXY, USDJPY"),
      timeframe: z.string().default("1h").describe("Timeframe: 1m, 5m, 15m, 1h, 4h, 1d"),
    },
    async ({ symbol, timeframe }) => {
      const r = await fetch(`${BASE()}/api/v1/signals?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}`);
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  server.tool(
    "get_macro_data",
    "Global macro economic intelligence: US Fed rate, CPI, M2 money supply, unemployment, GDP, yield curve, G10 FX rates, and rate environment signal (RESTRICTIVE/NEUTRAL/ACCOMMODATIVE).",
    {
      countries: z.string().default("US,CN,EU,JP,GB").describe("Country codes to include (comma-separated)"),
    },
    async ({ countries }) => {
      const r = await fetch(`${BASE()}/api/v1/macro?countries=${encodeURIComponent(countries)}`);
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  server.tool(
    "get_ai_news",
    "Real-time AI, tech, and market news aggregated from HackerNews, Reddit (r/MachineLearning, r/LocalLLaMA, r/artificial), and NewsAPI. Returns scored articles and trending keyword signals.",
    {
      category: z.enum(["ai", "crypto", "macro", "all"]).default("ai").describe("News category: ai, crypto, macro, or all"),
      hours:    z.number().int().min(1).max(168).default(24).describe("Hours to look back (1-168)"),
      limit:    z.number().int().min(1).max(100).default(30).describe("Max articles to return"),
    },
    async ({ category, hours, limit }) => {
      const r = await fetch(`${BASE()}/api/v1/news?category=${category}&hours=${hours}&limit=${limit}`);
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  server.tool(
    "get_arxiv_research",
    "Latest AI/ML research papers from ArXiv. Returns papers sorted by impact score with breakthrough detection, trending topics, and top authors. Covers cs.AI, cs.LG, cs.CL, cs.CV, cs.RO.",
    {
      category: z.enum(["ai", "ml", "nlp", "cv", "robotics", "agents", "all"]).default("all").describe("Research category"),
      query:    z.string().default("").describe("Additional keyword filter (e.g. 'agentic', 'reasoning', 'tool use')"),
      days:     z.number().int().min(1).max(30).default(3).describe("Days to look back"),
      limit:    z.number().int().min(1).max(50).default(20).describe("Max papers to return"),
    },
    async ({ category, query, days, limit }) => {
      const params = new URLSearchParams({ category, query, days: String(days), limit: String(limit) });
      const r = await fetch(`${BASE()}/api/v1/arxiv?${params}`);
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  server.tool(
    "get_onchain_data",
    "Real-time blockchain intelligence: Bitcoin network stats (fees, mempool, hashrate, difficulty), Ethereum gas oracle, total DeFi TVL from 500+ protocols, and top yield opportunities.",
    {
      chain: z.enum(["all", "btc", "eth", "defi"]).default("all").describe("Chain to query: all, btc, eth, or defi"),
    },
    async ({ chain }) => {
      const r = await fetch(`${BASE()}/api/v1/onchain?chain=${chain}`);
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  // ── TIER 2 TOOLS ────────────────────────────────────────────────────────────

  server.tool(
    "get_b2b_intel",
    "Golden Lead packets for B2B sales agents. Aggregates SEC filings + GitHub velocity + job openings into scored company leads (HOT/WARM/COLD) with AI pivot signals and outreach angles. $5/call.",
    {
      companies: z.array(z.string()).min(1).max(10).default(["microsoft", "salesforce", "oracle"]).describe("Company names (1-10)"),
    },
    async ({ companies }) => {
      const r = await fetch(`${BASE()}/api/v2/intel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies }),
      });
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  server.tool(
    "get_github_velocity",
    "Analyze a company's GitHub organization for AI pivot signals — new AI/ML repos, topic changes, star velocity, commit frequency. Returns pivot score and buyer signal strength. $5/call.",
    {
      org:  z.string().describe("GitHub org slug (e.g. microsoft, salesforce, stripe, openai)"),
      days: z.number().int().min(1).max(90).default(30).describe("Days to look back"),
    },
    async ({ org, days }) => {
      const r = await fetch(`${BASE()}/api/v2/github-velocity?org=${encodeURIComponent(org)}&days=${days}`);
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  server.tool(
    "get_job_pivots",
    "Companies actively hiring agentic AI roles — strong buyer intent signal. Searches Greenhouse, Lever, HackerNews 'Who is Hiring', and Remotive. Returns ranked company list with role details. $5/call.",
    {
      roles:     z.array(z.string()).default(["AI Engineer", "ML Engineer", "Agentic Systems"]).describe("Role titles to search"),
      companies: z.array(z.string()).default([]).describe("Filter to specific companies (optional)"),
    },
    async ({ roles, companies }) => {
      const r = await fetch(`${BASE()}/api/v2/job-pivots`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles, companies }),
      });
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  server.tool(
    "get_sec_filings",
    "Real-time SEC 8-K/10-K/10-Q filings from public companies mentioning AI, agentic systems, or autonomous operations. Scored by AI relevance. Returns company signals and filing URLs. $5/call.",
    {
      query:    z.string().default("agentic AI autonomous").describe("EDGAR full-text search keywords"),
      days:     z.number().int().min(1).max(30).default(7).describe("Days to look back"),
      forms:    z.string().default("8-K").describe("Form types: 8-K, 10-K, 10-Q (comma-separated)"),
      minScore: z.number().int().min(0).max(100).default(0).describe("Minimum AI relevance score filter"),
    },
    async ({ query, days, forms, minScore }) => {
      const params = new URLSearchParams({ query, days: String(days), forms, minScore: String(minScore) });
      const r = await fetch(`${BASE()}/api/v2/sec-filings?${params}`);
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  server.tool(
    "get_ai_patents",
    "AI patent intelligence from USPTO PatentsView. Who is filing what in artificial intelligence, neural networks, autonomous agents, and LLMs. Scored by AI relevance. $5/call.",
    {
      query:     z.string().default("artificial intelligence agentic").describe("Patent keyword search"),
      companies: z.string().default("").describe("Filter by company names (comma-separated, optional)"),
      days:      z.number().int().min(1).max(365).default(90).describe("Days to look back"),
    },
    async ({ query, companies, days }) => {
      const params = new URLSearchParams({ query, companies, days: String(days) });
      const r = await fetch(`${BASE()}/api/v2/patents?${params}`);
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );

  server.tool(
    "get_company_profile",
    "Comprehensive company intelligence dossier. Aggregates SEC filings + GitHub engineering velocity + hiring activity + USPTO patents + HackerNews sentiment into a lead score (HOT/WARM/COLD) with outreach angle. $5/call.",
    {
      company: z.string().describe("Company name (e.g. Salesforce, Stripe, UiPath)"),
      github:  z.string().default("").describe("GitHub org slug override (auto-derived if empty)"),
      days:    z.number().int().min(1).max(90).default(30).describe("Days to look back for activity signals"),
    },
    async ({ company, github, days }) => {
      const r = await fetch(`${BASE()}/api/v2/company-profile`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, github, days }),
      });
      return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
    }
  );
}

// ── Router factory ─────────────────────────────────────────────────────────────
export function createMcpRouter() {
  const router = Router();

  router.post("/", async (req, res) => {
    try {
      const server = new McpServer({ name: "omni-service-node", version: "2.0.0" });
      registerTools(server);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  });

  router.get("/manifest", (_req, res) => {
    res.json({
      schema_version: "1.0",
      name:           "omni-service-node",
      display_name:   "Omni Service Node",
      version:        "2.0.0",
      description:    "The petrol station for AI agents. 14 endpoints covering compliance, sanctions, market signals, macro economics, news, research papers, blockchain, B2B intelligence, patents, SEC filings, and company profiles. Pay-per-call via x402 USDC on Base.",
      tools: [
        "check_ai_compliance", "screen_sanctions", "get_market_sentiment", "get_trading_signal",
        "get_macro_data", "get_ai_news", "get_arxiv_research", "get_onchain_data",
        "get_b2b_intel", "get_github_velocity", "get_job_pivots", "get_sec_filings",
        "get_ai_patents", "get_company_profile",
      ],
      pricing: {
        tier1: { endpoints: 8, price: "$0.005 USDC", network: "base" },
        tier2: { endpoints: 6, price: "$5.00 USDC",  network: "base" },
      },
      payment:   { protocol: "x402", token: "USDC" },
      transport: "http",
      endpoint:  `${process.env.PUBLIC_URL || "https://omni-service-node-production.up.railway.app"}/mcp`,
    });
  });

  return router;
}
