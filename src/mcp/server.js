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

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: true, idempotentHint: true };

async function call(url, opts) {
  const r = await fetch(url, opts);
  return { content: [{ type: "text", text: JSON.stringify(await r.json(), null, 2) }] };
}

function registerTools(server) {

  // ── TIER 1 — $0.005/call ─────────────────────────────────────────────────────

  server.tool(
    "check_ai_compliance",
    "EU AI Act 2024/1689 risk classification (prohibited/high-risk/limited/minimal) with legal obligations, deadlines, and CISA alerts. $0.005.",
    {
      company:     z.string().optional().describe("Company name to classify under EU AI Act"),
      system:      z.string().optional().describe("AI system name or type being assessed"),
      description: z.string().optional().describe("Brief description of the AI system's purpose and capabilities"),
    },
    { ...READ_ONLY, title: "Check AI Compliance" },
    async ({ company, system, description }) => {
      const p = new URLSearchParams({ company: company||"", system: system||"", description: description||"" });
      return call(`${BASE()}/api/v1/compliance?${p}`);
    }
  );

  server.tool(
    "screen_sanctions",
    "Screen entities against OFAC, EU, UN, UK sanctions lists. Returns match probability and risk level. $0.005.",
    {
      name:    z.string().describe("Entity name, company, vessel, or wallet address to screen"),
      country: z.string().optional().describe("ISO 2-letter country code to narrow the search (e.g. IR, RU, KP)"),
    },
    { ...READ_ONLY, title: "Screen Sanctions" },
    async ({ name, country }) =>
      call(`${BASE()}/api/v1/sanctions`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name, country }) })
  );

  server.tool(
    "get_market_sentiment",
    "Fear & Greed index, CoinGecko global market data, asset prices, trending tokens, RISK_ON/RISK_OFF signal. $0.005.",
    {
      assets: z.string().default("BTC,ETH,VIRTUAL,GOLD,SOL").describe("Comma-separated list of asset tickers to include (e.g. BTC,ETH,GOLD)"),
    },
    { ...READ_ONLY, title: "Get Market Sentiment" },
    async ({ assets }) => call(`${BASE()}/api/v1/sentiment?assets=${encodeURIComponent(assets)}`)
  );

  server.tool(
    "get_trading_signal",
    "BUY/SELL/HOLD signal for Gold, BTC, FX. Returns entry, stop loss, take profit, R:R, RSI, EMA, ATR, confidence. $0.005.",
    {
      symbol:    z.string().default("XAUUSD").describe("Trading instrument symbol (e.g. XAUUSD, BTCUSD, EURUSD)"),
      timeframe: z.string().default("1h").describe("Chart timeframe: 1m, 5m, 15m, 1h, 4h, 1d, 1w"),
    },
    { ...READ_ONLY, title: "Get Trading Signal" },
    async ({ symbol, timeframe }) => call(`${BASE()}/api/v1/signals?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}`)
  );

  server.tool(
    "get_macro_data",
    "US Fed rate, CPI, M2, unemployment, GDP, yield curve, G10 FX, rate environment signal. $0.005.",
    {
      countries: z.string().default("US,CN,EU,JP,GB").describe("Comma-separated ISO country codes to include macro data for"),
    },
    { ...READ_ONLY, title: "Get Macro Data" },
    async ({ countries }) => call(`${BASE()}/api/v1/macro?countries=${encodeURIComponent(countries)}`)
  );

  server.tool(
    "get_ai_news",
    "Real-time AI/tech/market news from HackerNews, Reddit (r/ML, r/LocalLLaMA), NewsAPI. Scored articles and trending keywords. $0.005.",
    {
      category: z.enum(["ai","crypto","macro","all"]).default("ai").describe("News category filter: ai, crypto, macro, or all"),
      hours:    z.number().int().default(24).describe("How many hours back to fetch news (1-168)"),
      limit:    z.number().int().default(30).describe("Maximum number of articles to return (1-100)"),
    },
    { ...READ_ONLY, title: "Get AI News" },
    async ({ category, hours, limit }) => call(`${BASE()}/api/v1/news?category=${category}&hours=${hours}&limit=${limit}`)
  );

  server.tool(
    "get_arxiv_research",
    "Latest AI/ML papers from ArXiv. Breakthrough detection, trending topics, top authors. Covers cs.AI, cs.LG, cs.CL, cs.CV. $0.005.",
    {
      category: z.enum(["ai","ml","nlp","cv","robotics","agents","all"]).default("all").describe("ArXiv subject category to filter by"),
      query:    z.string().default("").describe("Free-text keyword search within paper titles and abstracts"),
      days:     z.number().int().default(3).describe("Number of days back to search for new papers (1-30)"),
      limit:    z.number().int().default(20).describe("Maximum number of papers to return (1-100)"),
    },
    { ...READ_ONLY, title: "Get ArXiv Research" },
    async ({ category, query, days, limit }) => call(`${BASE()}/api/v1/arxiv?${new URLSearchParams({ category, query, days: String(days), limit: String(limit) })}`)
  );

  server.tool(
    "get_onchain_data",
    "Bitcoin fees/mempool/hashrate, Ethereum gas oracle, DeFi TVL from 500+ protocols, top yield opportunities. $0.005.",
    {
      chain: z.enum(["all","btc","eth","defi"]).default("all").describe("Blockchain to query: all, btc (Bitcoin), eth (Ethereum), or defi (DeFi protocols)"),
    },
    { ...READ_ONLY, title: "Get On-Chain Data" },
    async ({ chain }) => call(`${BASE()}/api/v1/onchain?chain=${chain}`)
  );

  server.tool(
    "get_earnings",
    "Upcoming and recent earnings: EPS, revenue, beat/miss signals for US equities. $0.005.",
    {
      days:    z.number().int().default(7).describe("Window in days around today to search for earnings events (1-90)"),
      symbols: z.string().default("").describe("Comma-separated stock tickers to filter (e.g. AAPL,MSFT); leave empty for all"),
    },
    { ...READ_ONLY, title: "Get Earnings" },
    async ({ days, symbols }) => call(`${BASE()}/api/v1/earnings?days=${days}&symbols=${encodeURIComponent(symbols)}`)
  );

  server.tool(
    "get_commodities",
    "Gold, silver, oil, wheat, corn, copper, natural gas — spot prices, trends, supply/demand signals. $0.005.",
    {
      commodities: z.string().default("gold,silver,oil,wheat,copper").describe("Comma-separated commodity names to fetch (gold, silver, oil, wheat, corn, copper, natgas)"),
    },
    { ...READ_ONLY, title: "Get Commodities" },
    async ({ commodities }) => call(`${BASE()}/api/v1/commodities?commodities=${encodeURIComponent(commodities)}`)
  );

  server.tool(
    "get_economic_calendar",
    "High-impact economic events: CPI, NFP, FOMC, GDP releases with expected vs prior values. $0.005.",
    {
      days:      z.number().int().default(7).describe("Number of days ahead (and behind) to include in the calendar (1-30)"),
      countries: z.string().default("US,EU,GB,JP").describe("Comma-separated ISO country codes to filter events for"),
    },
    { ...READ_ONLY, title: "Get Economic Calendar" },
    async ({ days, countries }) => call(`${BASE()}/api/v1/economic-calendar?days=${days}&countries=${encodeURIComponent(countries)}`)
  );

  server.tool(
    "get_insider_trades",
    "SEC Form 4 insider buys/sells — bullish/bearish signal for any US stock. $0.005.",
    {
      symbol: z.string().default("").describe("Stock ticker to filter insider trades for (e.g. NVDA); leave empty for market-wide view"),
      days:   z.number().int().default(30).describe("Number of days back to search for insider transactions (1-180)"),
    },
    { ...READ_ONLY, title: "Get Insider Trades" },
    async ({ symbol, days }) => call(`${BASE()}/api/v1/insider-trades?symbol=${encodeURIComponent(symbol)}&days=${days}`)
  );

  server.tool(
    "get_options_flow",
    "Unusual options activity — volume/OI spikes on SPY, QQQ, NVDA, TSLA. Dark pool + sweep detection. $0.005.",
    {
      symbol:     z.string().default("SPY").describe("Underlying stock ticker to scan for unusual options activity"),
      minPremium: z.number().default(100000).describe("Minimum total premium (USD) for a contract to qualify as unusual activity"),
    },
    { ...READ_ONLY, title: "Get Options Flow" },
    async ({ symbol, minPremium }) => call(`${BASE()}/api/v1/options-flow?symbol=${encodeURIComponent(symbol)}&minPremium=${minPremium}`)
  );

  server.tool(
    "get_market_movers",
    "Top gainers, losers, most active stocks with volume surge signals. $0.005.",
    {
      type:  z.enum(["gainers","losers","active","all"]).default("all").describe("Which mover category to return: gainers, losers, active (by volume), or all"),
      limit: z.number().int().default(20).describe("Number of stocks to return per category (1-50)"),
    },
    { ...READ_ONLY, title: "Get Market Movers" },
    async ({ type, limit }) => call(`${BASE()}/api/v1/market-movers?type=${type}&limit=${limit}`)
  );

  server.tool(
    "get_ipo_calendar",
    "Upcoming and recent IPOs — size, pricing, market cap, sector. $0.005.",
    {
      days: z.number().int().default(30).describe("Window in days (past and future) to include IPO events (1-90)"),
    },
    { ...READ_ONLY, title: "Get IPO Calendar" },
    async ({ days }) => call(`${BASE()}/api/v1/ipo-calendar?days=${days}`)
  );

  server.tool(
    "get_analyst_ratings",
    "Upgrades/downgrades on AI/tech stocks — firm name, rating change, price target. $0.005.",
    {
      symbol: z.string().default("").describe("Stock ticker to filter analyst ratings for (e.g. NVDA); empty returns market-wide"),
      days:   z.number().int().default(7).describe("Number of days back to include analyst rating changes (1-90)"),
    },
    { ...READ_ONLY, title: "Get Analyst Ratings" },
    async ({ symbol, days }) => call(`${BASE()}/api/v1/analyst-ratings?symbol=${encodeURIComponent(symbol)}&days=${days}`)
  );

  server.tool(
    "get_fear_index",
    "VIX + Fear & Greed index — market risk temperature and historical context. $0.005.",
    {},
    { ...READ_ONLY, title: "Get Fear Index" },
    async () => call(`${BASE()}/api/v1/fear-index`)
  );

  server.tool(
    "get_fx_rates",
    "Live FX rates — major pairs, minors, crypto vs USD, DXY. $0.005.",
    {
      pairs: z.string().default("EURUSD,GBPUSD,USDJPY,AUDUSD,DXY").describe("Comma-separated FX pairs or indices to fetch (e.g. EURUSD,GBPUSD,DXY)"),
    },
    { ...READ_ONLY, title: "Get FX Rates" },
    async ({ pairs }) => call(`${BASE()}/api/v1/fx-rates?pairs=${encodeURIComponent(pairs)}`)
  );

  server.tool(
    "get_nft_market",
    "NFT market conditions — floor prices, volume, blue chip sentiment, wash trade detection. $0.005.",
    {
      collections: z.string().default("cryptopunks,bored-ape-yacht-club,azuki").describe("Comma-separated OpenSea collection slugs to analyse (e.g. cryptopunks,azuki)"),
    },
    { ...READ_ONLY, title: "Get NFT Market" },
    async ({ collections }) => call(`${BASE()}/api/v1/nft-market?collections=${encodeURIComponent(collections)}`)
  );

  server.tool(
    "get_defi_yields",
    "DeFi yield opportunities across Aave, Compound, Curve, Yearn and 100+ protocols. $0.005.",
    {
      chain:   z.string().default("all").describe("Blockchain to filter yield opportunities by (all, ethereum, arbitrum, polygon, base)"),
      minApy:  z.number().default(5).describe("Minimum annual percentage yield (APY) threshold to include opportunities"),
    },
    { ...READ_ONLY, title: "Get DeFi Yields" },
    async ({ chain, minApy }) => call(`${BASE()}/api/v1/defi-yields?chain=${encodeURIComponent(chain)}&minApy=${minApy}`)
  );

  server.tool(
    "get_token_unlocks",
    "Upcoming token vesting unlocks — supply pressure signals for crypto assets. $0.005.",
    {
      days: z.number().int().default(30).describe("Number of days ahead to scan for token unlock events (1-180)"),
    },
    { ...READ_ONLY, title: "Get Token Unlocks" },
    async ({ days }) => call(`${BASE()}/api/v1/token-unlocks?days=${days}`)
  );

  server.tool(
    "get_crypto_derivatives",
    "Crypto futures + options — funding rates, open interest, liquidations, basis. $0.005.",
    {
      symbol:   z.string().default("BTC").describe("Crypto asset ticker to query derivatives data for (e.g. BTC, ETH, SOL)"),
      exchange: z.string().default("all").describe("Exchange to filter by (all, binance, bybit, okx, deribit)"),
    },
    { ...READ_ONLY, title: "Get Crypto Derivatives" },
    async ({ symbol, exchange }) => call(`${BASE()}/api/v1/crypto-derivatives?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}`)
  );

  server.tool(
    "get_stablecoins",
    "Stablecoin health monitor — peg deviation, supply changes, depeg risk scores for USDT/USDC/DAI/FRAX. $0.005.",
    {},
    { ...READ_ONLY, title: "Get Stablecoins" },
    async () => call(`${BASE()}/api/v1/stablecoins`)
  );

  server.tool(
    "get_virtuals_protocol",
    "Virtuals Protocol AI agents — prices, market cap, volume, top agents by activity. $0.005.",
    {
      limit: z.number().int().default(20).describe("Number of top Virtuals Protocol agents to return (1-100)"),
    },
    { ...READ_ONLY, title: "Get Virtuals Protocol" },
    async ({ limit }) => call(`${BASE()}/api/v1/virtuals-protocol?limit=${limit}`)
  );

  server.tool(
    "get_ai_tokens",
    "AI/ML crypto tokens sector performance — NEAR, FET, AGIX, RNDR, WLD, TAO. $0.005.",
    {
      limit: z.number().int().default(30).describe("Number of AI-sector tokens to return, ranked by market cap (1-100)"),
    },
    { ...READ_ONLY, title: "Get AI Tokens" },
    async ({ limit }) => call(`${BASE()}/api/v1/ai-tokens?limit=${limit}`)
  );

  server.tool(
    "get_bittensor",
    "Bittensor TAO subnet activity — validator rewards, top subnets, network health. $0.005.",
    {},
    { ...READ_ONLY, title: "Get Bittensor" },
    async () => call(`${BASE()}/api/v1/bittensor`)
  );

  server.tool(
    "get_model_prices",
    "AI model pricing comparison — cost per 1M tokens across OpenAI, Anthropic, Google, Mistral, Groq. $0.005.",
    {},
    { ...READ_ONLY, title: "Get Model Prices" },
    async () => call(`${BASE()}/api/v1/model-prices`)
  );

  server.tool(
    "get_space_weather",
    "NOAA KP index, solar flux, X-ray flares, geomagnetic storm alerts. Impacts HF radio, GPS, satellites. $0.005.",
    {},
    { ...READ_ONLY, title: "Get Space Weather" },
    async () => call(`${BASE()}/api/v1/space-weather`)
  );

  server.tool(
    "get_earthquake_monitor",
    "USGS significant earthquakes (M4+) — magnitude, region, depth, tsunami risk. $0.005.",
    {
      days:         z.number().int().default(7).describe("Number of days back to search for seismic events (1-30)"),
      minMagnitude: z.number().default(4.0).describe("Minimum Richter magnitude to include in results (2.0-9.0)"),
    },
    { ...READ_ONLY, title: "Get Earthquake Monitor" },
    async ({ days, minMagnitude }) => call(`${BASE()}/api/v1/earthquake-monitor?days=${days}&minMagnitude=${minMagnitude}`)
  );

  server.tool(
    "get_energy_prices",
    "Global energy prices — crude oil (WTI/Brent), natural gas, LNG, coal, electricity spot. $0.005.",
    {},
    { ...READ_ONLY, title: "Get Energy Prices" },
    async () => call(`${BASE()}/api/v1/energy-prices`)
  );

  server.tool(
    "get_shipping_rates",
    "Global shipping rates — Baltic Dry Index, container rates, port congestion signals. $0.005.",
    {},
    { ...READ_ONLY, title: "Get Shipping Rates" },
    async () => call(`${BASE()}/api/v1/shipping-rates`)
  );

  server.tool(
    "get_semiconductor_supply",
    "Semiconductor supply chain intel — TSMC utilization, chip lead times, shortage signals by node. $0.005.",
    {},
    { ...READ_ONLY, title: "Get Semiconductor Supply" },
    async () => call(`${BASE()}/api/v1/semiconductor-supply`)
  );

  server.tool(
    "get_merger_activity",
    "M&A activity — announced deals, rumored targets, sector consolidation signals. $0.005.",
    {
      sector: z.string().default("tech").describe("Industry sector to focus M&A intelligence on (e.g. tech, finance, healthcare, energy)"),
      days:   z.number().int().default(30).describe("Number of days back to scan for merger and acquisition announcements (1-180)"),
    },
    { ...READ_ONLY, title: "Get Merger Activity" },
    async ({ sector, days }) => call(`${BASE()}/api/v1/merger-activity?sector=${encodeURIComponent(sector)}&days=${days}`)
  );

  server.tool(
    "get_private_equity",
    "Private equity and VC deal flow — funding rounds, exits, dry powder, sector focus. $0.005.",
    {
      sector: z.string().default("ai").describe("Industry sector to filter PE/VC deals for (e.g. ai, fintech, biotech, crypto)"),
      days:   z.number().int().default(30).describe("Number of days back to include private equity and venture capital deals (1-180)"),
    },
    { ...READ_ONLY, title: "Get Private Equity" },
    async ({ sector, days }) => call(`${BASE()}/api/v1/private-equity?sector=${encodeURIComponent(sector)}&days=${days}`)
  );

  server.tool(
    "get_real_estate_market",
    "US real estate market data — home prices, mortgage rates, inventory, regional trends. $0.005.",
    {
      region: z.string().default("national").describe("US region or metro area to get real estate data for (e.g. national, new-york, los-angeles, miami)"),
    },
    { ...READ_ONLY, title: "Get Real Estate Market" },
    async ({ region }) => call(`${BASE()}/api/v1/real-estate-market?region=${encodeURIComponent(region)}`)
  );

  server.tool(
    "get_github_trending",
    "GitHub trending repositories — by language, topic, stars today/week. AI/ML repos highlighted. $0.005.",
    {
      language: z.string().default("").describe("Programming language to filter by (e.g. python, typescript, rust); leave empty for all"),
      topic:    z.string().default("ai").describe("GitHub topic tag to filter repositories by (e.g. ai, llm, agents, mcp)"),
      period:   z.enum(["daily","weekly","monthly"]).default("daily").describe("Trending time window: daily, weekly, or monthly"),
    },
    { ...READ_ONLY, title: "Get GitHub Trending" },
    async ({ language, topic, period }) => call(`${BASE()}/api/v1/github-trending?language=${encodeURIComponent(language)}&topic=${encodeURIComponent(topic)}&period=${period}`)
  );

  // ── TIER 2 — $5–$25/call ─────────────────────────────────────────────────────

  server.tool(
    "get_b2b_intel",
    "Golden Lead packets for B2B sales agents. SEC + GitHub + jobs → scored leads (HOT/WARM/COLD) with AI pivot signals. $5.",
    {
      companies: z.array(z.string()).min(1).max(10).default(["microsoft","salesforce","oracle"]).describe("List of company names or domains to generate B2B intelligence for (1-10 companies)"),
    },
    { ...READ_ONLY, title: "Get B2B Intel" },
    async ({ companies }) =>
      call(`${BASE()}/api/v2/intel`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ companies }) })
  );

  server.tool(
    "get_github_velocity",
    "Company GitHub AI pivot score — new AI repos, topic changes, star velocity, commit frequency. $5.",
    {
      org:  z.string().describe("GitHub organisation slug to analyse for AI activity (e.g. openai, anthropic, microsoft)"),
      days: z.number().int().default(30).describe("Number of days back to measure repository activity and velocity (1-365)"),
    },
    { ...READ_ONLY, title: "Get GitHub Velocity" },
    async ({ org, days }) => call(`${BASE()}/api/v2/github-velocity?org=${encodeURIComponent(org)}&days=${days}`)
  );

  server.tool(
    "get_job_pivots",
    "Companies hiring agentic AI roles — Greenhouse, Lever, HN Who's Hiring, Remotive. Buyer intent signal. $5.",
    {
      roles:     z.array(z.string()).default(["AI Engineer","ML Engineer","Agentic Systems"]).describe("List of job titles or role keywords to search for as AI hiring signals"),
      companies: z.array(z.string()).default([]).describe("Optional list of specific company names to filter job pivot results for"),
    },
    { ...READ_ONLY, title: "Get Job Pivots" },
    async ({ roles, companies }) =>
      call(`${BASE()}/api/v2/job-pivots`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ roles, companies }) })
  );

  server.tool(
    "get_sec_filings",
    "Real-time SEC 8-K/10-K/10-Q filings mentioning AI/autonomous operations. AI-relevance scored. $5.",
    {
      query:    z.string().default("agentic AI autonomous").describe("Keywords to search within SEC filing text (e.g. 'agentic AI autonomous')"),
      days:     z.number().int().default(7).describe("Number of days back to search for relevant SEC filings (1-90)"),
      forms:    z.string().default("8-K").describe("Comma-separated SEC form types to include (e.g. 8-K, 10-K, 10-Q, S-1)"),
      minScore: z.number().int().default(0).describe("Minimum AI-relevance score threshold (0-100) for filtering results"),
    },
    { ...READ_ONLY, title: "Get SEC Filings" },
    async ({ query, days, forms, minScore }) => call(`${BASE()}/api/v2/sec-filings?${new URLSearchParams({ query, days: String(days), forms, minScore: String(minScore) })}`)
  );

  server.tool(
    "get_ai_patents",
    "USPTO AI patent filings — who is building what in neural networks, autonomous agents, LLMs. $5.",
    {
      query:     z.string().default("artificial intelligence agentic").describe("Patent search keywords covering the technical domain (e.g. 'autonomous agents LLM')"),
      companies: z.string().default("").describe("Comma-separated assignee company names to filter patents for"),
      days:      z.number().int().default(90).describe("Number of days back to search for new patent applications and grants (1-365)"),
    },
    { ...READ_ONLY, title: "Get AI Patents" },
    async ({ query, companies, days }) => call(`${BASE()}/api/v2/patents?${new URLSearchParams({ query, companies, days: String(days) })}`)
  );

  server.tool(
    "get_company_profile",
    "Full company dossier: SEC filings + GitHub velocity + hiring + patents + HN sentiment → HOT/WARM/COLD lead score. $5.",
    {
      company: z.string().describe("Company name or domain to generate the full intelligence dossier for"),
      github:  z.string().default("").describe("GitHub organisation slug for the company (e.g. openai); leave empty to auto-detect"),
      days:    z.number().int().default(30).describe("Lookback window in days for all data sources in the dossier (1-180)"),
    },
    { ...READ_ONLY, title: "Get Company Profile" },
    async ({ company, github, days }) =>
      call(`${BASE()}/api/v2/company-profile`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ company, github, days }) })
  );

  server.tool(
    "get_whale_tracker",
    "On-chain whale wallet movements — large BTC/ETH transfers, exchange inflows/outflows, smart money signals. $5.",
    {
      chain:        z.enum(["btc","eth","all"]).default("all").describe("Blockchain to monitor for large wallet movements: btc, eth, or all"),
      minValueUSD:  z.number().default(1000000).describe("Minimum transaction value in USD to classify as a whale movement (e.g. 1000000 for $1M)"),
    },
    { ...READ_ONLY, title: "Get Whale Tracker" },
    async ({ chain, minValueUSD }) => call(`${BASE()}/api/v2/whale-tracker?chain=${chain}&minValueUSD=${minValueUSD}`)
  );

  server.tool(
    "get_funding_rounds",
    "VC and PE funding rounds — amount, investors, valuation, sector. AI startup deals highlighted. $5.",
    {
      sector:     z.string().default("ai").describe("Industry sector to filter funding rounds for (e.g. ai, fintech, biotech, deeptech)"),
      days:       z.number().int().default(30).describe("Number of days back to include funding announcements (1-180)"),
      minAmountM: z.number().default(1).describe("Minimum deal size in millions USD to include (e.g. 10 for $10M+ rounds)"),
    },
    { ...READ_ONLY, title: "Get Funding Rounds" },
    async ({ sector, days, minAmountM }) => call(`${BASE()}/api/v2/funding-rounds?sector=${encodeURIComponent(sector)}&days=${days}&minAmountM=${minAmountM}`)
  );

  server.tool(
    "get_competitor_intel",
    "Competitive intelligence dossier — product launches, pricing changes, hiring signals vs target company. $5.",
    {
      company:     z.string().describe("Primary company to build competitive intelligence around"),
      competitors: z.array(z.string()).default([]).describe("List of competitor company names to compare against (leave empty to auto-identify)"),
    },
    { ...READ_ONLY, title: "Get Competitor Intel" },
    async ({ company, competitors }) =>
      call(`${BASE()}/api/v2/competitor-intel`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ company, competitors }) })
  );

  server.tool(
    "get_hedge_funds",
    "Hedge fund 13F filings — top holdings, new positions, exits, sector rotation signals. $5.",
    {
      fund:    z.string().default("").describe("Hedge fund name to filter 13F filings for (e.g. 'Bridgewater'); empty returns top funds"),
      sector:  z.string().default("technology").describe("Sector to focus position analysis on (e.g. technology, healthcare, energy)"),
      quarter: z.string().default("latest").describe("Filing quarter to retrieve (e.g. 2024Q4, 2025Q1, or 'latest')"),
    },
    { ...READ_ONLY, title: "Get Hedge Funds" },
    async ({ fund, sector, quarter }) => call(`${BASE()}/api/v2/hedge-funds?fund=${encodeURIComponent(fund)}&sector=${encodeURIComponent(sector)}&quarter=${encodeURIComponent(quarter)}`)
  );

  server.tool(
    "get_dao_governance",
    "DAO governance activity — active proposals, voting power distribution, treasury size, sentiment. $5.",
    {
      protocol: z.string().default("").describe("Protocol name to filter DAO governance data for (e.g. uniswap, aave, compound); empty returns all"),
      status:   z.enum(["active","passed","failed","all"]).default("active").describe("Proposal status filter: active, passed, failed, or all"),
    },
    { ...READ_ONLY, title: "Get DAO Governance" },
    async ({ protocol, status }) => call(`${BASE()}/api/v2/dao-governance?protocol=${encodeURIComponent(protocol)}&status=${status}`)
  );

  server.tool(
    "get_geopolitical_crisis",
    "GDELT real-time crisis monitoring — Iran/Israel/Trump/Russia. Crisis score, escalation risk, oil/gold/USD market impact, OFAC alerts, Reddit/HN viral signals. $25.",
    {
      regions:             z.string().default("middle-east,ukraine,taiwan").describe("Comma-separated geopolitical regions to monitor (e.g. middle-east, ukraine, taiwan, korea)"),
      includeMarketImpact: z.boolean().default(true).describe("Whether to include projected market impact on oil, gold, and USD for each crisis event"),
    },
    { ...READ_ONLY, title: "Get Geopolitical Crisis" },
    async ({ regions, includeMarketImpact }) => call(`${BASE()}/api/v2/geopolitical-crisis?regions=${encodeURIComponent(regions)}&includeMarketImpact=${includeMarketImpact}`)
  );

  // ── BUNDLES — $0.50–$500 ─────────────────────────────────────────────────────

  server.tool(
    "run_bundle_starter",
    "AI Agent Starter Pack — compliance + sentiment + signals + macro + news in one call. $0.50.",
    {
      symbol: z.string().default("XAUUSD").describe("Primary trading symbol to generate signals for in the starter bundle (e.g. XAUUSD, BTCUSD)"),
      assets: z.string().default("BTC,ETH,GOLD").describe("Comma-separated asset tickers to include in sentiment and market data"),
    },
    { ...READ_ONLY, title: "Run Starter Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/starter`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "run_bundle_market_intel",
    "Market Intelligence Pack — signals + onchain + macro + options flow + insider trades + earnings. $25.",
    {
      symbols: z.array(z.string()).default(["XAUUSD","BTCUSD","SPY"]).describe("List of trading symbols to include in the market intelligence bundle"),
    },
    { ...READ_ONLY, title: "Run Market Intel Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/market-intel`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "run_bundle_company_deep",
    "Company Deep Dive — profile + competitor intel + hedge funds + analyst ratings + filings. $50.",
    {
      company: z.string().describe("Company name to run the full deep-dive intelligence bundle on"),
      github:  z.string().default("").describe("GitHub organisation slug for the company; leave empty to auto-detect"),
    },
    { ...READ_ONLY, title: "Run Company Deep Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/company-deep`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "run_bundle_crypto_alpha",
    "Crypto Alpha Pack — onchain + whale tracker + DeFi yields + AI tokens + derivatives + stablecoins. $25.",
    {
      chains: z.string().default("btc,eth").describe("Comma-separated blockchain networks to include in the crypto alpha bundle"),
    },
    { ...READ_ONLY, title: "Run Crypto Alpha Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/crypto-alpha`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "run_bundle_macro_global",
    "Global Macro Pack — macro + FX + interest rates + inflation + consumer + labor data. $50.",
    {
      countries: z.string().default("US,EU,JP,GB,CN").describe("Comma-separated ISO country codes to include in the global macro bundle"),
    },
    { ...READ_ONLY, title: "Run Global Macro Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/macro-global`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "run_bundle_ai_economy",
    "AI Economy Intelligence — arxiv + github trending + jobs + model prices + AI tokens + regulatory. $100.",
    {
      focus: z.string().default("agentic ai autonomous").describe("Keywords describing the AI economy area to focus the bundle on (e.g. 'agentic ai autonomous')"),
    },
    { ...READ_ONLY, title: "Run AI Economy Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/ai-economy`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "run_bundle_sovereign",
    "Sovereign Intelligence — ALL endpoints combined: full macro + geopolitical + company + crypto + hedge funds. $500.",
    {
      regions:   z.string().default("all").describe("Geopolitical regions to include in the sovereign intelligence sweep (all, or comma-separated list)"),
      companies: z.array(z.string()).default([]).describe("Optional list of specific companies to include deep-dive analysis for in the sovereign bundle"),
    },
    { ...READ_ONLY, title: "Run Sovereign Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/sovereign`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "run_bundle_geopolitical",
    "Geopolitical War Room — GDELT Iran/Israel/Trump monitoring + crisis scores + oil/gold/USD/defense market impact + OFAC alerts + Reddit/HN signals. $200.",
    {
      regions: z.string().default("middle-east,ukraine,taiwan").describe("Comma-separated geopolitical regions to cover in the war room bundle"),
      depth:   z.enum(["standard","deep"]).default("deep").describe("Analysis depth: standard (fast overview) or deep (full GDELT + social signal processing)"),
    },
    { ...READ_ONLY, title: "Run Geopolitical War Room Bundle" },
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
          version: "3.1.0",
          description: "The petrol station for AI agents. 56 pay-per-call endpoints.",
          tiers: {
            tier1:   { count: 36, price: "$0.005 USDC" },
            tier2:   { count: 12, price: "$5–$25 USDC" },
            bundles: { count: 8,  price: "$0.50–$500 USDC" },
          },
          payment: { protocol: "x402", token: "USDC", network: "Base Mainnet" },
        }, null, 2),
      }],
    })
  );

  server.resource(
    "pricing",
    "omni://pricing",
    { mimeType: "application/json" },
    async () => ({
      contents: [{
        uri: "omni://pricing",
        mimeType: "application/json",
        text: JSON.stringify({
          tier1:   { priceUSDC: 0.005, tools: 36, examples: ["get_trading_signal","get_macro_data","get_ai_news"] },
          tier2:   { priceUSDC: "5–25", tools: 12, examples: ["get_b2b_intel","get_company_profile","get_geopolitical_crisis"] },
          bundles: { priceUSDC: "0.50–500", tools: 8, examples: ["run_bundle_starter","run_bundle_sovereign"] },
          payment: { protocol: "x402", token: "USDC", network: "Base Mainnet", noSubscription: true },
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
          text: "Omni Service Node is a pay-per-call data marketplace for AI agents. Call any tool directly — payment is handled automatically via x402 USDC on Base Mainnet. Tier 1 endpoints cost $0.005 each, Tier 2 cost $5–$25, and Bundles cost $0.50–$500. No API keys or subscriptions required. Start with get_trading_signal or get_market_sentiment for market data, get_macro_data for economics, get_geopolitical_crisis for geopolitical risk, or run_bundle_starter for a full overview.",
        },
      }],
    })
  );

  server.prompt(
    "endpoint_guide",
    "Full guide to all 56 endpoints by category",
    [],
    async () => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Omni Service Node — 56 Endpoint Guide:

MARKET SIGNALS ($0.005): get_trading_signal, get_market_sentiment, get_market_movers, get_fear_index, get_options_flow, get_insider_trades, get_analyst_ratings, get_earnings, get_ipo_calendar

MACRO & FX ($0.005): get_macro_data, get_fx_rates, get_economic_calendar, get_commodities, get_energy_prices

CRYPTO & DEFI ($0.005): get_onchain_data, get_defi_yields, get_stablecoins, get_crypto_derivatives, get_token_unlocks, get_nft_market, get_ai_tokens, get_virtuals_protocol, get_bittensor

INTELLIGENCE ($0.005): get_ai_news, get_arxiv_research, get_github_trending, get_model_prices, get_space_weather, get_earthquake_monitor, get_shipping_rates, get_semiconductor_supply

MACRO RISKS ($0.005): get_merger_activity, get_private_equity, get_real_estate_market

SANCTIONS & COMPLIANCE ($0.005): screen_sanctions, check_ai_compliance

TIER 2 DEEP INTEL ($5–$25): get_b2b_intel, get_github_velocity, get_job_pivots, get_sec_filings, get_ai_patents, get_company_profile, get_whale_tracker, get_funding_rounds, get_competitor_intel, get_hedge_funds, get_dao_governance, get_geopolitical_crisis

BUNDLES ($0.50–$500): run_bundle_starter, run_bundle_market_intel, run_bundle_company_deep, run_bundle_crypto_alpha, run_bundle_macro_global, run_bundle_ai_economy, run_bundle_sovereign, run_bundle_geopolitical`,
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
      const server = new McpServer({ name: "omni-service-node", version: "3.1.0" });
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
      version:        "3.1.0",
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
