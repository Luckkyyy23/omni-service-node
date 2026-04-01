/**
 * MCP Server — Model Context Protocol (HTTP transport)
 * 56 tools: 36 Tier1 ($0.005) + 12 Tier2 ($5-$25) + 8 Bundles ($0.50-$500)
 * Pay-per-call via x402 USDC on Base Mainnet.
 */

import { McpServer }  from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Router }     from "express";
import { z }          from "zod";

const BASE = () => `http://localhost:${process.env.PORT || 3000}`;

async function call(url, opts) {
  const r = await fetch(url, opts);
  return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
}

function registerTools(server) {

  // ── TIER 1 — $0.005/call ─────────────────────────────────────────────────────

  server.tool("check_ai_compliance",
    "EU AI Act 2024/1689 risk classification (prohibited/high-risk/limited/minimal) with legal obligations, deadlines, and CISA alerts. $0.005.",
    { company: z.string().optional(), system: z.string().optional(), description: z.string().optional() },
    async ({ company, system, description }) => {
      const p = new URLSearchParams({ company: company||"", system: system||"", description: description||"" });
      return call(`${BASE()}/api/v1/compliance?${p}`);
    }
  );

  server.tool("screen_sanctions",
    "Screen entities against OFAC, EU, UN, UK sanctions lists. Returns match probability and risk level. $0.005.",
    { name: z.string().describe("Entity name, company, vessel, or address"), country: z.string().optional() },
    async ({ name, country }) =>
      call(`${BASE()}/api/v1/sanctions`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name, country }) })
  );

  server.tool("get_market_sentiment",
    "Fear & Greed index, CoinGecko global market data, asset prices, trending tokens, RISK_ON/RISK_OFF signal. $0.005.",
    { assets: z.string().default("BTC,ETH,VIRTUAL,GOLD,SOL") },
    async ({ assets }) => call(`${BASE()}/api/v1/sentiment?assets=${encodeURIComponent(assets)}`)
  );

  server.tool("get_trading_signal",
    "BUY/SELL/HOLD signal for Gold, BTC, FX. Returns entry, stop loss, take profit, R:R, RSI, EMA, ATR, confidence. $0.005.",
    { symbol: z.string().default("XAUUSD"), timeframe: z.string().default("1h") },
    async ({ symbol, timeframe }) => call(`${BASE()}/api/v1/signals?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}`)
  );

  server.tool("get_macro_data",
    "US Fed rate, CPI, M2, unemployment, GDP, yield curve, G10 FX, rate environment signal. $0.005.",
    { countries: z.string().default("US,CN,EU,JP,GB") },
    async ({ countries }) => call(`${BASE()}/api/v1/macro?countries=${encodeURIComponent(countries)}`)
  );

  server.tool("get_ai_news",
    "Real-time AI/tech/market news from HackerNews, Reddit (r/ML, r/LocalLLaMA), NewsAPI. Scored articles and trending keywords. $0.005.",
    { category: z.enum(["ai","crypto","macro","all"]).default("ai"), hours: z.number().int().default(24), limit: z.number().int().default(30) },
    async ({ category, hours, limit }) => call(`${BASE()}/api/v1/news?category=${category}&hours=${hours}&limit=${limit}`)
  );

  server.tool("get_arxiv_research",
    "Latest AI/ML papers from ArXiv. Breakthrough detection, trending topics, top authors. Covers cs.AI, cs.LG, cs.CL, cs.CV. $0.005.",
    { category: z.enum(["ai","ml","nlp","cv","robotics","agents","all"]).default("all"), query: z.string().default(""), days: z.number().int().default(3), limit: z.number().int().default(20) },
    async ({ category, query, days, limit }) => call(`${BASE()}/api/v1/arxiv?${new URLSearchParams({ category, query, days: String(days), limit: String(limit) })}`)
  );

  server.tool("get_onchain_data",
    "Bitcoin fees/mempool/hashrate, Ethereum gas oracle, DeFi TVL from 500+ protocols, top yield opportunities. $0.005.",
    { chain: z.enum(["all","btc","eth","defi"]).default("all") },
    async ({ chain }) => call(`${BASE()}/api/v1/onchain?chain=${chain}`)
  );

  server.tool("get_earnings",
    "Upcoming and recent earnings: EPS, revenue, beat/miss signals for US equities. $0.005.",
    { days: z.number().int().default(7), symbols: z.string().default("") },
    async ({ days, symbols }) => call(`${BASE()}/api/v1/earnings?days=${days}&symbols=${encodeURIComponent(symbols)}`)
  );

  server.tool("get_commodities",
    "Gold, silver, oil, wheat, corn, copper, natural gas — spot prices, trends, supply/demand signals. $0.005.",
    { commodities: z.string().default("gold,silver,oil,wheat,copper") },
    async ({ commodities }) => call(`${BASE()}/api/v1/commodities?commodities=${encodeURIComponent(commodities)}`)
  );

  server.tool("get_economic_calendar",
    "High-impact economic events: CPI, NFP, FOMC, GDP releases with expected vs prior values. $0.005.",
    { days: z.number().int().default(7), countries: z.string().default("US,EU,GB,JP") },
    async ({ days, countries }) => call(`${BASE()}/api/v1/economic-calendar?days=${days}&countries=${encodeURIComponent(countries)}`)
  );

  server.tool("get_insider_trades",
    "SEC Form 4 insider buys/sells — bullish/bearish signal for any US stock. $0.005.",
    { symbol: z.string().default(""), days: z.number().int().default(30) },
    async ({ symbol, days }) => call(`${BASE()}/api/v1/insider-trades?symbol=${encodeURIComponent(symbol)}&days=${days}`)
  );

  server.tool("get_options_flow",
    "Unusual options activity — volume/OI spikes on SPY, QQQ, NVDA, TSLA. Dark pool + sweep detection. $0.005.",
    { symbol: z.string().default("SPY"), minPremium: z.number().default(100000) },
    async ({ symbol, minPremium }) => call(`${BASE()}/api/v1/options-flow?symbol=${encodeURIComponent(symbol)}&minPremium=${minPremium}`)
  );

  server.tool("get_market_movers",
    "Top gainers, losers, most active stocks with volume surge signals. $0.005.",
    { type: z.enum(["gainers","losers","active","all"]).default("all"), limit: z.number().int().default(20) },
    async ({ type, limit }) => call(`${BASE()}/api/v1/market-movers?type=${type}&limit=${limit}`)
  );

  server.tool("get_ipo_calendar",
    "Upcoming and recent IPOs — size, pricing, market cap, sector. $0.005.",
    { days: z.number().int().default(30) },
    async ({ days }) => call(`${BASE()}/api/v1/ipo-calendar?days=${days}`)
  );

  server.tool("get_analyst_ratings",
    "Upgrades/downgrades on AI/tech stocks — firm name, rating change, price target. $0.005.",
    { symbol: z.string().default(""), days: z.number().int().default(7) },
    async ({ symbol, days }) => call(`${BASE()}/api/v1/analyst-ratings?symbol=${encodeURIComponent(symbol)}&days=${days}`)
  );

  server.tool("get_fear_index",
    "VIX + Fear & Greed index — market risk temperature and historical context. $0.005.",
    {},
    async () => call(`${BASE()}/api/v1/fear-index`)
  );

  server.tool("get_fx_rates",
    "Live FX rates — major pairs, minors, crypto vs USD, DXY. $0.005.",
    { pairs: z.string().default("EURUSD,GBPUSD,USDJPY,AUDUSD,DXY") },
    async ({ pairs }) => call(`${BASE()}/api/v1/fx-rates?pairs=${encodeURIComponent(pairs)}`)
  );

  server.tool("get_nft_market",
    "NFT market conditions — floor prices, volume, blue chip sentiment, wash trade detection. $0.005.",
    { collections: z.string().default("cryptopunks,bored-ape-yacht-club,azuki") },
    async ({ collections }) => call(`${BASE()}/api/v1/nft-market?collections=${encodeURIComponent(collections)}`)
  );

  server.tool("get_defi_yields",
    "DeFi yield opportunities across Aave, Compound, Curve, Yearn and 100+ protocols. $0.005.",
    { chain: z.string().default("all"), minApy: z.number().default(5) },
    async ({ chain, minApy }) => call(`${BASE()}/api/v1/defi-yields?chain=${encodeURIComponent(chain)}&minApy=${minApy}`)
  );

  server.tool("get_token_unlocks",
    "Upcoming token vesting unlocks — supply pressure signals for crypto assets. $0.005.",
    { days: z.number().int().default(30) },
    async ({ days }) => call(`${BASE()}/api/v1/token-unlocks?days=${days}`)
  );

  server.tool("get_crypto_derivatives",
    "Crypto futures + options — funding rates, open interest, liquidations, basis. $0.005.",
    { symbol: z.string().default("BTC"), exchange: z.string().default("all") },
    async ({ symbol, exchange }) => call(`${BASE()}/api/v1/crypto-derivatives?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}`)
  );

  server.tool("get_stablecoins",
    "Stablecoin health monitor — peg deviation, supply changes, depeg risk scores for USDT/USDC/DAI/FRAX. $0.005.",
    {},
    async () => call(`${BASE()}/api/v1/stablecoins`)
  );

  server.tool("get_virtuals_protocol",
    "Virtuals Protocol AI agents — prices, market cap, volume, top agents by activity. $0.005.",
    { limit: z.number().int().default(20) },
    async ({ limit }) => call(`${BASE()}/api/v1/virtuals-protocol?limit=${limit}`)
  );

  server.tool("get_ai_tokens",
    "AI/ML crypto tokens sector performance — NEAR, FET, AGIX, RNDR, WLD, TAO. $0.005.",
    { limit: z.number().int().default(30) },
    async ({ limit }) => call(`${BASE()}/api/v1/ai-tokens?limit=${limit}`)
  );

  server.tool("get_bittensor",
    "Bittensor TAO subnet activity — validator rewards, top subnets, network health. $0.005.",
    {},
    async () => call(`${BASE()}/api/v1/bittensor`)
  );

  server.tool("get_model_prices",
    "AI model pricing comparison — cost per 1M tokens across OpenAI, Anthropic, Google, Mistral, Groq. $0.005.",
    {},
    async () => call(`${BASE()}/api/v1/model-prices`)
  );

  server.tool("get_space_weather",
    "NOAA KP index, solar flux, X-ray flares, geomagnetic storm alerts. Impacts HF radio, GPS, satellites. $0.005.",
    {},
    async () => call(`${BASE()}/api/v1/space-weather`)
  );

  server.tool("get_earthquake_monitor",
    "USGS significant earthquakes (M4+) — magnitude, region, depth, tsunami risk. $0.005.",
    { days: z.number().int().default(7), minMagnitude: z.number().default(4.0) },
    async ({ days, minMagnitude }) => call(`${BASE()}/api/v1/earthquake-monitor?days=${days}&minMagnitude=${minMagnitude}`)
  );

  server.tool("get_energy_prices",
    "Global energy prices — crude oil (WTI/Brent), natural gas, LNG, coal, electricity spot. $0.005.",
    {},
    async () => call(`${BASE()}/api/v1/energy-prices`)
  );

  server.tool("get_shipping_rates",
    "Global shipping rates — Baltic Dry Index, container rates, port congestion signals. $0.005.",
    {},
    async () => call(`${BASE()}/api/v1/shipping-rates`)
  );

  server.tool("get_semiconductor_supply",
    "Semiconductor supply chain intel — TSMC utilization, chip lead times, shortage signals by node. $0.005.",
    {},
    async () => call(`${BASE()}/api/v1/semiconductor-supply`)
  );

  server.tool("get_merger_activity",
    "M&A activity — announced deals, rumored targets, sector consolidation signals. $0.005.",
    { sector: z.string().default("tech"), days: z.number().int().default(30) },
    async ({ sector, days }) => call(`${BASE()}/api/v1/merger-activity?sector=${encodeURIComponent(sector)}&days=${days}`)
  );

  server.tool("get_private_equity",
    "Private equity and VC deal flow — funding rounds, exits, dry powder, sector focus. $0.005.",
    { sector: z.string().default("ai"), days: z.number().int().default(30) },
    async ({ sector, days }) => call(`${BASE()}/api/v1/private-equity?sector=${encodeURIComponent(sector)}&days=${days}`)
  );

  server.tool("get_real_estate_market",
    "US real estate market data — home prices, mortgage rates, inventory, regional trends. $0.005.",
    { region: z.string().default("national") },
    async ({ region }) => call(`${BASE()}/api/v1/real-estate-market?region=${encodeURIComponent(region)}`)
  );

  server.tool("get_github_trending",
    "GitHub trending repositories — by language, topic, stars today/week. AI/ML repos highlighted. $0.005.",
    { language: z.string().default(""), topic: z.string().default("ai"), period: z.enum(["daily","weekly","monthly"]).default("daily") },
    async ({ language, topic, period }) => call(`${BASE()}/api/v1/github-trending?language=${encodeURIComponent(language)}&topic=${encodeURIComponent(topic)}&period=${period}`)
  );

  // ── TIER 2 — $5–$25/call ─────────────────────────────────────────────────────

  server.tool("get_b2b_intel",
    "Golden Lead packets for B2B sales agents. SEC + GitHub + jobs → scored leads (HOT/WARM/COLD) with AI pivot signals. $5.",
    { companies: z.array(z.string()).min(1).max(10).default(["microsoft","salesforce","oracle"]) },
    async ({ companies }) =>
      call(`${BASE()}/api/v2/intel`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ companies }) })
  );

  server.tool("get_github_velocity",
    "Company GitHub AI pivot score — new AI repos, topic changes, star velocity, commit frequency. $5.",
    { org: z.string().describe("GitHub org slug"), days: z.number().int().default(30) },
    async ({ org, days }) => call(`${BASE()}/api/v2/github-velocity?org=${encodeURIComponent(org)}&days=${days}`)
  );

  server.tool("get_job_pivots",
    "Companies hiring agentic AI roles — Greenhouse, Lever, HN Who's Hiring, Remotive. Buyer intent signal. $5.",
    { roles: z.array(z.string()).default(["AI Engineer","ML Engineer","Agentic Systems"]), companies: z.array(z.string()).default([]) },
    async ({ roles, companies }) =>
      call(`${BASE()}/api/v2/job-pivots`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ roles, companies }) })
  );

  server.tool("get_sec_filings",
    "Real-time SEC 8-K/10-K/10-Q filings mentioning AI/autonomous operations. AI-relevance scored. $5.",
    { query: z.string().default("agentic AI autonomous"), days: z.number().int().default(7), forms: z.string().default("8-K"), minScore: z.number().int().default(0) },
    async ({ query, days, forms, minScore }) => call(`${BASE()}/api/v2/sec-filings?${new URLSearchParams({ query, days: String(days), forms, minScore: String(minScore) })}`)
  );

  server.tool("get_ai_patents",
    "USPTO AI patent filings — who is building what in neural networks, autonomous agents, LLMs. $5.",
    { query: z.string().default("artificial intelligence agentic"), companies: z.string().default(""), days: z.number().int().default(90) },
    async ({ query, companies, days }) => call(`${BASE()}/api/v2/patents?${new URLSearchParams({ query, companies, days: String(days) })}`)
  );

  server.tool("get_company_profile",
    "Full company dossier: SEC filings + GitHub velocity + hiring + patents + HN sentiment → HOT/WARM/COLD lead score. $5.",
    { company: z.string(), github: z.string().default(""), days: z.number().int().default(30) },
    async ({ company, github, days }) =>
      call(`${BASE()}/api/v2/company-profile`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ company, github, days }) })
  );

  server.tool("get_whale_tracker",
    "On-chain whale wallet movements — large BTC/ETH transfers, exchange inflows/outflows, smart money signals. $5.",
    { chain: z.enum(["btc","eth","all"]).default("all"), minValueUSD: z.number().default(1000000) },
    async ({ chain, minValueUSD }) => call(`${BASE()}/api/v2/whale-tracker?chain=${chain}&minValueUSD=${minValueUSD}`)
  );

  server.tool("get_funding_rounds",
    "VC and PE funding rounds — amount, investors, valuation, sector. AI startup deals highlighted. $5.",
    { sector: z.string().default("ai"), days: z.number().int().default(30), minAmountM: z.number().default(1) },
    async ({ sector, days, minAmountM }) => call(`${BASE()}/api/v2/funding-rounds?sector=${encodeURIComponent(sector)}&days=${days}&minAmountM=${minAmountM}`)
  );

  server.tool("get_competitor_intel",
    "Competitive intelligence dossier — product launches, pricing changes, hiring signals vs target company. $5.",
    { company: z.string(), competitors: z.array(z.string()).default([]) },
    async ({ company, competitors }) =>
      call(`${BASE()}/api/v2/competitor-intel`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ company, competitors }) })
  );

  server.tool("get_hedge_funds",
    "Hedge fund 13F filings — top holdings, new positions, exits, sector rotation signals. $5.",
    { fund: z.string().default(""), sector: z.string().default("technology"), quarter: z.string().default("latest") },
    async ({ fund, sector, quarter }) => call(`${BASE()}/api/v2/hedge-funds?fund=${encodeURIComponent(fund)}&sector=${encodeURIComponent(sector)}&quarter=${encodeURIComponent(quarter)}`)
  );

  server.tool("get_dao_governance",
    "DAO governance activity — active proposals, voting power distribution, treasury size, sentiment. $5.",
    { protocol: z.string().default(""), status: z.enum(["active","passed","failed","all"]).default("active") },
    async ({ protocol, status }) => call(`${BASE()}/api/v2/dao-governance?protocol=${encodeURIComponent(protocol)}&status=${status}`)
  );

  server.tool("get_geopolitical_crisis",
    "GDELT real-time crisis monitoring — Iran/Israel/Trump/Russia. Crisis score, escalation risk, oil/gold/USD market impact, OFAC alerts, Reddit/HN viral signals. $25.",
    { regions: z.string().default("middle-east,ukraine,taiwan"), includeMarketImpact: z.boolean().default(true) },
    async ({ regions, includeMarketImpact }) => call(`${BASE()}/api/v2/geopolitical-crisis?regions=${encodeURIComponent(regions)}&includeMarketImpact=${includeMarketImpact}`)
  );

  // ── BUNDLES — $0.50–$500 ─────────────────────────────────────────────────────

  server.tool("run_bundle_starter",
    "AI Agent Starter Pack — compliance + sentiment + signals + macro + news in one call. $0.50.",
    { symbol: z.string().default("XAUUSD"), assets: z.string().default("BTC,ETH,GOLD") },
    async (params) =>
      call(`${BASE()}/api/bundle/starter`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool("run_bundle_market_intel",
    "Market Intelligence Pack — signals + onchain + macro + options flow + insider trades + earnings. $25.",
    { symbols: z.array(z.string()).default(["XAUUSD","BTCUSD","SPY"]) },
    async (params) =>
      call(`${BASE()}/api/bundle/market-intel`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool("run_bundle_company_deep",
    "Company Deep Dive — profile + competitor intel + hedge funds + analyst ratings + filings. $50.",
    { company: z.string(), github: z.string().default("") },
    async (params) =>
      call(`${BASE()}/api/bundle/company-deep`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool("run_bundle_crypto_alpha",
    "Crypto Alpha Pack — onchain + whale tracker + DeFi yields + AI tokens + derivatives + stablecoins. $25.",
    { chains: z.string().default("btc,eth") },
    async (params) =>
      call(`${BASE()}/api/bundle/crypto-alpha`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool("run_bundle_macro_global",
    "Global Macro Pack — macro + FX + interest rates + inflation + consumer + labor data. $50.",
    { countries: z.string().default("US,EU,JP,GB,CN") },
    async (params) =>
      call(`${BASE()}/api/bundle/macro-global`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool("run_bundle_ai_economy",
    "AI Economy Intelligence — arxiv + github trending + jobs + model prices + AI tokens + regulatory. $100.",
    { focus: z.string().default("agentic ai autonomous") },
    async (params) =>
      call(`${BASE()}/api/bundle/ai-economy`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool("run_bundle_sovereign",
    "Sovereign Intelligence — ALL endpoints combined: full macro + geopolitical + company + crypto + hedge funds. $500.",
    { regions: z.string().default("all"), companies: z.array(z.string()).default([]) },
    async (params) =>
      call(`${BASE()}/api/bundle/sovereign`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool("run_bundle_geopolitical",
    "Geopolitical War Room — GDELT Iran/Israel/Trump monitoring + crisis scores + oil/gold/USD/defense market impact + OFAC alerts + Reddit/HN signals. $200.",
    { regions: z.string().default("middle-east,ukraine,taiwan"), depth: z.enum(["standard","deep"]).default("deep") },
    async (params) =>
      call(`${BASE()}/api/bundle/geopolitical`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );
}

function registerResources(server) {
  server.resource(
    "catalog",
    "omni://catalog",
    { mimeType: "application/json" },
    async () => ({
      contents: [{
        uri: "omni://catalog",
        mimeType: "application/json",
        text: JSON.stringify({
          name: "omni-service-node",
          version: "3.0.0",
          description: "The petrol station for AI agents. 56 pay-per-call endpoints.",
          tiers: {
            tier1: { count: 36, price: "$0.005 USDC" },
            tier2: { count: 12, price: "$5–$25 USDC" },
            bundles: { count: 8, price: "$0.50–$500 USDC" },
          },
          payment: { protocol: "x402", token: "USDC", network: "Base Mainnet" },
        }, null, 2),
      }],
    })
  );
}

function registerPrompts(server) {
  server.prompt(
    "how_to_use",
    "How to use Omni Service Node — getting started guide",
    [],
    async () => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: "Omni Service Node is a pay-per-call data marketplace for AI agents. Call any tool directly — payment is handled automatically via x402 USDC on Base Mainnet. Tier 1 endpoints cost $0.005, Tier 2 cost $5–$25, and Bundles cost $0.50–$500. No API keys required.",
        },
      }],
    })
  );
}

// ── Router factory ─────────────────────────────────────────────────────────────
export function createMcpRouter() {
  const router = Router();

  router.post("/", async (req, res) => {
    try {
      const server = new McpServer({ name: "omni-service-node", version: "3.0.0" });
      registerTools(server);
      registerResources(server);
      registerPrompts(server);
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
      display_name:   "Omni Service Node — AI Agent Data Marketplace",
      version:        "3.0.0",
      description:    "The petrol station for AI agents. 56 pay-per-call endpoints covering market signals, macro economics, geopolitical crisis intel, crypto/DeFi, earnings, insider trades, options flow, SEC filings, GitHub velocity, company dossiers, sanctions screening, ArXiv research, and more. All paid in USDC on Base Mainnet.",
      pricing: {
        tier1:    { endpoints: 36, price: "$0.005 USDC", network: "base" },
        tier2:    { endpoints: 12, price: "$5–$25 USDC",  network: "base" },
        bundles:  { endpoints: 8,  price: "$0.50–$500 USDC", network: "base" },
      },
      payment:   { protocol: "x402", token: "USDC", network: "base", wallet: process.env.WALLET_ADDRESS },
      transport: "http",
      endpoint:  `${process.env.PUBLIC_URL || "https://omni-service-node-production.up.railway.app"}/mcp`,
    });
  });

  return router;
}
