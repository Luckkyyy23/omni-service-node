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
    "checkAiCompliance",
    `Classify an AI system under EU AI Act 2024/1689 and return its risk tier, legal obligations, and compliance deadlines.

Use this tool when:
- An agent needs to assess whether an AI system is legally permitted in the EU
- A company is building or deploying AI and needs to understand its regulatory obligations
- You need to identify prohibited AI practices (real-time biometric surveillance, social scoring, etc.)
- You need to know applicable CISA alerts and cybersecurity requirements for AI systems

Returns: risk_tier (prohibited/high-risk/limited-risk/minimal-risk), applicable_articles, legal_obligations, compliance_deadline, CISA_alerts, and recommended_actions.

Example call: checkAiCompliance({ company: "Acme Corp", system: "Facial Recognition Attendance System", description: "Real-time facial recognition used to track employee attendance in a factory" })

Cost: $0.005 USDC per call.`,
    {
      company:     z.string().optional().describe("Name of the company deploying or building the AI system (e.g. 'Acme Corp'). Used to contextualise the compliance assessment."),
      system:      z.string().optional().describe("Name or type of the AI system being assessed (e.g. 'Facial Recognition System', 'Credit Scoring Model', 'Autonomous Drone'). Be specific."),
      description: z.string().optional().describe("Plain-language description of what the AI system does, who uses it, and in what context (e.g. 'Scans CVs and ranks job applicants for HR managers'). More detail = more accurate classification."),
    },
    { ...READ_ONLY, title: "Check AI Compliance" },
    async ({ company, system, description }) => {
      const p = new URLSearchParams({ company: company||"", system: system||"", description: description||"" });
      return call(`${BASE()}/api/v1/compliance?${p}`);
    }
  );

  server.tool(
    "screenSanctions",
    `Screen a person, company, vessel, or crypto wallet against OFAC (US), EU, UN, and UK sanctions lists in a single call.

Use this tool when:
- An agent is onboarding a new counterparty or customer and needs KYC/AML verification
- A payment agent is about to send funds and must verify the recipient is not sanctioned
- A trading agent needs to verify a counterparty before executing a trade
- You need to check if a crypto wallet address is linked to sanctioned entities

Returns: match_probability (0-100), matched_lists, sanctioned_entity_details, risk_level (CLEAR/LOW/MEDIUM/HIGH/BLOCKED), and recommended_action.

Example: screenSanctions({ name: "Mahan Air", country: "IR" }) → HIGH risk, matched OFAC SDN list.
Example: screenSanctions({ name: "0xdeadbeef...wallet" }) → checks Chainalysis OFAC list for crypto wallets.

Cost: $0.005 USDC per call.`,
    {
      name:    z.string().describe("Full name of the entity to screen. Can be a person name, company name, vessel name, or crypto wallet address (e.g. '0x1234...abcd'). Partial names are supported but reduce accuracy."),
      country: z.string().optional().describe("ISO 2-letter country code to narrow the search and reduce false positives (e.g. 'IR' for Iran, 'RU' for Russia, 'KP' for North Korea). Leave empty to search all jurisdictions."),
    },
    { ...READ_ONLY, title: "Screen Sanctions" },
    async ({ name, country }) =>
      call(`${BASE()}/api/v1/sanctions`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name, country }) })
  );

  server.tool(
    "getMarketSentiment",
    `Get the current market risk appetite: Fear & Greed index, global crypto market data, live asset prices, trending tokens, and a RISK_ON/RISK_OFF signal.

Use this tool when:
- An agent needs to determine whether market conditions favour risk-on (buy) or risk-off (sell/hedge) positioning
- A trading agent wants a high-level market pulse before executing orders
- A portfolio agent is deciding whether to increase or reduce exposure
- You need to know what tokens/assets are trending and why

Returns: fear_greed_index (0-100, 0=extreme fear), global_market_cap, BTC_dominance, asset_prices, 24h_changes, trending_tokens, overall_signal (RISK_ON/RISK_OFF/NEUTRAL).

Example: getMarketSentiment({ assets: "BTC,ETH,GOLD,SPY" }) during high VIX → returns RISK_OFF signal with fear index of 22.

Cost: $0.005 USDC per call.`,
    {
      assets: z.string().default("BTC,ETH,VIRTUAL,GOLD,SOL").describe("Comma-separated list of asset tickers to fetch live prices for (e.g. 'BTC,ETH,GOLD,SOL,SPY'). Supports crypto tickers, stock tickers, and commodities."),
    },
    { ...READ_ONLY, title: "Get Market Sentiment" },
    async ({ assets }) => call(`${BASE()}/api/v1/sentiment?assets=${encodeURIComponent(assets)}`)
  );

  server.tool(
    "getTradingSignal",
    `Generate a BUY, SELL, or HOLD signal for a trading instrument with full technical analysis: entry price, stop loss, take profit, risk-reward ratio, RSI, EMA stack, ATR, and confidence score.

Use this tool when:
- A trading agent needs a concrete entry/exit recommendation before placing a trade
- You want to validate a trading idea with technical indicators
- An agent is running a systematic trading strategy and needs fresh signals
- You need to know the current momentum, trend direction, and volatility for a symbol

Supported symbols: XAUUSD (Gold), BTCUSD, ETHUSD, EURUSD, GBPUSD, USDJPY, NVDA, SPY, QQQ, and most major FX/crypto pairs.
Supported timeframes: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w.

Returns: signal (BUY/SELL/HOLD), entry_price, stop_loss, take_profit, risk_reward_ratio, confidence (0-100), RSI, EMA_20, EMA_50, ATR, trend_direction, key_levels.

Example: getTradingSignal({ symbol: "XAUUSD", timeframe: "1h" }) → BUY at 2340, SL 2320, TP 2380, RR 2.0, confidence 78.

Cost: $0.005 USDC per call.`,
    {
      symbol:    z.string().default("XAUUSD").describe("Trading instrument symbol in standard format (e.g. 'XAUUSD' for Gold, 'BTCUSD' for Bitcoin, 'EURUSD' for Euro/Dollar, 'NVDA' for Nvidia stock). Case-insensitive."),
      timeframe: z.string().default("1h").describe("Chart timeframe for the signal analysis. Options: '1m' (scalping), '5m', '15m', '30m', '1h' (intraday), '4h' (swing), '1d' (daily), '1w' (weekly). Higher timeframes = higher reliability."),
    },
    { ...READ_ONLY, title: "Get Trading Signal" },
    async ({ symbol, timeframe }) => call(`${BASE()}/api/v1/signals?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}`)
  );

  server.tool(
    "getMacroData",
    `Fetch macroeconomic fundamentals for major economies: central bank interest rates, CPI inflation, M2 money supply, unemployment, GDP growth, yield curve shape, and G10 FX rates. Returns a rate_environment signal (HAWKISH/DOVISH/NEUTRAL).

Use this tool when:
- An agent needs to understand the global interest rate environment before making investment decisions
- A macro-aware trading agent wants to align trades with the dominant monetary policy regime
- You need to assess inflation trends and their impact on asset classes
- A portfolio agent wants to know which economies are expanding or contracting

Returns per country: policy_rate, CPI_yoy, M2_growth, unemployment_rate, GDP_growth_qoq, yield_curve (2y-10y spread), currency_vs_usd, rate_environment_signal.

Example: getMacroData({ countries: "US,EU,JP" }) → US: HAWKISH (rate 5.5%, CPI 3.2%), EU: NEUTRAL, JP: DOVISH.

Cost: $0.005 USDC per call.`,
    {
      countries: z.string().default("US,CN,EU,JP,GB").describe("Comma-separated ISO country/region codes to fetch macro data for. Supported: US, EU, GB, JP, CN, AU, CA, CH, SE, NO. Use 'EU' for Eurozone aggregate data."),
    },
    { ...READ_ONLY, title: "Get Macro Data" },
    async ({ countries }) => call(`${BASE()}/api/v1/macro?countries=${encodeURIComponent(countries)}`)
  );

  server.tool(
    "getAiNews",
    `Fetch real-time news and intelligence from HackerNews, Reddit (r/MachineLearning, r/LocalLLaMA, r/CryptoCurrency), and NewsAPI. Returns scored articles ranked by relevance and virality, plus trending keywords.

Use this tool when:
- An agent needs to stay current on breaking AI, crypto, or macro news
- A research agent is scanning for market-moving headlines
- You need to detect emerging narratives before they become mainstream
- A content agent needs source material for summaries or analysis

Returns: articles (title, source, score, url, published_at), trending_keywords, sentiment_summary, breaking_alerts.

Example: getAiNews({ category: "ai", hours: 4, limit: 10 }) → top 10 AI stories from the past 4 hours with virality scores.
Example: getAiNews({ category: "crypto", hours: 1, limit: 5 }) → breaking crypto news in the last hour.

Cost: $0.005 USDC per call.`,
    {
      category: z.enum(["ai","crypto","macro","all"]).default("ai").describe("News category to fetch: 'ai' (AI/ML/LLM news), 'crypto' (blockchain/DeFi/token news), 'macro' (economics/markets/geopolitics), 'all' (everything combined)."),
      hours:    z.number().int().default(24).describe("Lookback window in hours. Use 1-4 for breaking news, 24 for daily digest, 72-168 for weekly trend analysis. Range: 1-168."),
      limit:    z.number().int().default(30).describe("Maximum number of articles to return, ranked by relevance score. Use 5-10 for quick summaries, 30-100 for comprehensive research. Range: 1-100."),
    },
    { ...READ_ONLY, title: "Get AI News" },
    async ({ category, hours, limit }) => call(`${BASE()}/api/v1/news?category=${category}&hours=${hours}&limit=${limit}`)
  );

  server.tool(
    "getArxivResearch",
    `Search ArXiv for the latest AI/ML academic papers with breakthrough detection, citation velocity, trending topics, and top authors. Covers cs.AI, cs.LG (machine learning), cs.CL (NLP), cs.CV (computer vision), cs.RO (robotics), and cs.MA (multi-agent).

Use this tool when:
- A research agent needs to find the latest papers on a specific AI topic
- You want to detect breakthrough research before it goes mainstream
- An agent is building a literature review or state-of-the-art summary
- You need to identify leading researchers and institutions in a field

Returns: papers (title, authors, abstract, arxiv_id, published, citation_velocity), breakthrough_score, trending_topics, top_authors.

Example: getArxivResearch({ query: "mixture of experts scaling", days: 7 }) → latest MoE papers from the past week.
Example: getArxivResearch({ category: "agents", days: 3, limit: 5 }) → top 5 agentic AI papers from last 3 days.

Cost: $0.005 USDC per call.`,
    {
      category: z.enum(["ai","ml","nlp","cv","robotics","agents","all"]).default("all").describe("ArXiv category: 'ai' (cs.AI), 'ml' (cs.LG), 'nlp' (cs.CL), 'cv' (cs.CV), 'robotics' (cs.RO), 'agents' (multi-agent systems), 'all' (all categories combined)."),
      query:    z.string().default("").describe("Free-text keyword search within paper titles and abstracts (e.g. 'mixture of experts', 'chain of thought', 'multimodal agents'). Leave empty to get top papers by date."),
      days:     z.number().int().default(3).describe("Number of days back to search for papers. Use 1-3 for cutting-edge latest, 7-14 for weekly review, 30 for monthly landscape. Range: 1-30."),
      limit:    z.number().int().default(20).describe("Maximum number of papers to return, ranked by breakthrough score and recency. Range: 1-100."),
    },
    { ...READ_ONLY, title: "Get ArXiv Research" },
    async ({ category, query, days, limit }) => call(`${BASE()}/api/v1/arxiv?${new URLSearchParams({ category, query, days: String(days), limit: String(limit) })}`)
  );

  server.tool(
    "getOnchainData",
    `Fetch live blockchain metrics: Bitcoin mempool congestion and fees, Ethereum gas oracle (slow/standard/fast), DeFi total value locked (TVL) across 500+ protocols, and top yield opportunities ranked by APY.

Use this tool when:
- An agent is about to send a transaction and needs current gas/fee estimates
- A DeFi agent wants to find the highest-yielding liquidity pools
- You need to assess network health or congestion before executing on-chain
- A macro agent wants on-chain data as a leading indicator of market activity

Returns: BTC (mempool_size, fee_sat_vb_fast, fee_sat_vb_slow, hashrate, block_time), ETH (gas_gwei_slow/standard/fast, base_fee), DeFi (total_TVL_usd, top_protocols, top_yield_opportunities).

Example: getOnchainData({ chain: "eth" }) → ETH gas: 12 gwei slow, 18 standard, 28 fast.
Example: getOnchainData({ chain: "defi" }) → Top yield: Aave USDC 8.2% APY on Ethereum.

Cost: $0.005 USDC per call.`,
    {
      chain: z.enum(["all","btc","eth","defi"]).default("all").describe("Blockchain data to fetch: 'btc' (Bitcoin fees, mempool, hashrate), 'eth' (Ethereum gas oracle, EIP-1559 base fee), 'defi' (DeFi TVL and yields across all chains), 'all' (everything combined)."),
    },
    { ...READ_ONLY, title: "Get On-Chain Data" },
    async ({ chain }) => call(`${BASE()}/api/v1/onchain?chain=${chain}`)
  );

  server.tool(
    "getEarnings",
    `Fetch upcoming and recent earnings reports for US public companies: EPS estimates vs actuals, revenue beats/misses, guidance changes, and a BEAT/MISS/IN-LINE signal.

Use this tool when:
- A trading agent needs to know which stocks are reporting earnings and when
- You want to identify earnings surprises that could cause price gaps
- A portfolio agent needs to reduce risk before a major earnings event
- An analyst agent is building an earnings calendar for the week

Returns per company: ticker, company_name, report_date, EPS_estimate, EPS_actual, EPS_surprise_pct, revenue_estimate, revenue_actual, signal (BEAT/MISS/IN-LINE), guidance (RAISED/LOWERED/MAINTAINED).

Example: getEarnings({ days: 7, symbols: "NVDA,MSFT,AAPL" }) → NVDA reporting in 3 days, consensus EPS $5.58.
Example: getEarnings({ days: 3 }) → all companies reporting in the next 3 days.

Cost: $0.005 USDC per call.`,
    {
      days:    z.number().int().default(7).describe("Window in days around today — fetches both upcoming (future) and recently reported (past) earnings. Use 1-3 for immediate events, 7-14 for weekly planning, up to 90 for quarterly view. Range: 1-90."),
      symbols: z.string().default("").describe("Comma-separated stock tickers to filter results (e.g. 'NVDA,MSFT,AAPL,GOOGL'). Leave empty to return all companies reporting in the specified window."),
    },
    { ...READ_ONLY, title: "Get Earnings" },
    async ({ days, symbols }) => call(`${BASE()}/api/v1/earnings?days=${days}&symbols=${encodeURIComponent(symbols)}`)
  );

  server.tool(
    "getCommodities",
    `Get spot prices, 24h/7d trend, and supply/demand signals for physical commodities: gold, silver, crude oil, wheat, corn, copper, and natural gas.

Use this tool when:
- An agent needs commodity prices for macro analysis or trade decisions
- A portfolio agent wants to assess inflationary pressures via commodity trends
- A trading agent is looking for correlated assets (e.g. gold as USD hedge)
- You need supply/demand context for commodity price movements

Returns per commodity: spot_price, currency, 24h_change_pct, 7d_change_pct, 52w_high, 52w_low, supply_signal (TIGHT/NORMAL/SURPLUS), demand_signal, key_drivers.

Example: getCommodities({ commodities: "gold,silver,oil" }) → Gold $2340/oz (+0.8%), Oil $82.40/bbl (-1.2%).

Cost: $0.005 USDC per call.`,
    {
      commodities: z.string().default("gold,silver,oil,wheat,copper").describe("Comma-separated commodity names to fetch. Supported: 'gold', 'silver', 'oil' (WTI crude), 'brent', 'wheat', 'corn', 'copper', 'natgas' (natural gas), 'platinum', 'palladium'."),
    },
    { ...READ_ONLY, title: "Get Commodities" },
    async ({ commodities }) => call(`${BASE()}/api/v1/commodities?commodities=${encodeURIComponent(commodities)}`)
  );

  server.tool(
    "getEconomicCalendar",
    `Fetch the high-impact economic events calendar: CPI inflation releases, Non-Farm Payrolls (NFP), FOMC rate decisions, GDP prints, PMI data — with consensus forecasts vs prior values and market impact ratings.

Use this tool when:
- A trading agent needs to avoid holding positions through major data releases
- A macro agent is building a weekly economic event schedule
- You need to know the expected vs prior value for an upcoming release
- An agent wants to assess whether upcoming events could move markets significantly

Returns per event: event_name, country, release_datetime_utc, impact (HIGH/MEDIUM/LOW), forecast, previous, actual (if released), market_impact_assets.

Example: getEconomicCalendar({ days: 7, countries: "US,EU" }) → US CPI Tuesday 8:30am EST (forecast 3.2% vs prior 3.4%).

Cost: $0.005 USDC per call.`,
    {
      days:      z.number().int().default(7).describe("Number of days ahead (and behind) to include. Use 1-3 for the immediate week, 7-14 for weekly planning, 30 for monthly view. Range: 1-30."),
      countries: z.string().default("US,EU,GB,JP").describe("Comma-separated ISO country codes to filter events for. Supported: US, EU, GB, JP, CN, AU, CA, CH, DE, FR, IT. Use 'US' alone for Fed-only events."),
    },
    { ...READ_ONLY, title: "Get Economic Calendar" },
    async ({ days, countries }) => call(`${BASE()}/api/v1/economic-calendar?days=${days}&countries=${encodeURIComponent(countries)}`)
  );

  server.tool(
    "getInsiderTrades",
    `Fetch SEC Form 4 filings showing insider buying and selling at US public companies. Returns a bullish/bearish signal based on the direction and size of insider transactions.

Use this tool when:
- A trading agent wants to follow smart money (executives buying their own stock = bullish)
- You need to detect unusual insider selling before a potential price decline
- A research agent is looking for conviction signals from company leadership
- An agent wants to cross-reference insider activity with other fundamental data

Returns: insider_name, title, company, ticker, transaction_type (BUY/SELL), shares, value_usd, date, signal (BULLISH/BEARISH), cumulative_30d_net_buying.

Example: getInsiderTrades({ symbol: "NVDA", days: 30 }) → CEO sold 50k shares ($12M) on Feb 15 — net insider BEARISH.
Example: getInsiderTrades({ days: 7 }) → market-wide insider activity this week.

Cost: $0.005 USDC per call.`,
    {
      symbol: z.string().default("").describe("Stock ticker to filter insider trades for (e.g. 'NVDA', 'AAPL', 'TSLA'). Leave empty to get market-wide insider activity across all US companies."),
      days:   z.number().int().default(30).describe("Number of days back to search for Form 4 insider transactions. Use 7 for recent activity, 30 for monthly trend, 90-180 for longer-term pattern. Range: 1-180."),
    },
    { ...READ_ONLY, title: "Get Insider Trades" },
    async ({ symbol, days }) => call(`${BASE()}/api/v1/insider-trades?symbol=${encodeURIComponent(symbol)}&days=${days}`)
  );

  server.tool(
    "getOptionsFlow",
    `Detect unusual options activity — large block trades, sweeps, and dark pool prints that may signal institutional positioning. Identifies volume/open-interest spikes and classifies them as bullish or bearish.

Use this tool when:
- A trading agent wants to follow institutional options flow as a leading signal
- You need to detect if smart money is buying calls (bullish) or puts (bearish) at scale
- An agent is scanning for unusual activity before earnings or major events
- You want to identify dark pool sweeps that suggest directional bets

Returns per flow: ticker, expiry, strike, type (CALL/PUT), premium_usd, volume, open_interest, vol_oi_ratio, trade_type (SWEEP/BLOCK), sentiment (BULLISH/BEARISH), time.

Example: getOptionsFlow({ symbol: "SPY", minPremium: 500000 }) → SPY $440 PUT sweep $2.1M premium — BEARISH.
Example: getOptionsFlow({ symbol: "NVDA" }) → NVDA $900 CALL block $850k — BULLISH ahead of earnings.

Cost: $0.005 USDC per call.`,
    {
      symbol:     z.string().default("SPY").describe("Underlying stock or ETF ticker to scan for unusual options activity (e.g. 'SPY', 'QQQ', 'NVDA', 'TSLA', 'AAPL'). Use 'SPY' or 'QQQ' for broad market signals."),
      minPremium: z.number().default(100000).describe("Minimum total premium paid (in USD) for a trade to qualify as unusual/institutional. Use 100000 ($100k) for active stocks, 500000 ($500k) for high-conviction signals only."),
    },
    { ...READ_ONLY, title: "Get Options Flow" },
    async ({ symbol, minPremium }) => call(`${BASE()}/api/v1/options-flow?symbol=${encodeURIComponent(symbol)}&minPremium=${minPremium}`)
  );

  server.tool(
    "getMarketMovers",
    `Get today's top gaining, top losing, and most actively traded stocks with volume surge signals and percentage moves.

Use this tool when:
- A trading agent needs to find momentum plays or mean-reversion setups
- You want to identify stocks with unusual volume (potential news catalyst)
- A morning brief agent is generating a daily market overview
- An agent needs to know which sectors are leading or lagging today

Returns per stock: ticker, company_name, price, change_pct, volume, avg_volume, volume_surge_ratio, sector, catalyst (if detected).

Example: getMarketMovers({ type: "gainers", limit: 5 }) → top 5 gainers today with catalyst summary.
Example: getMarketMovers({ type: "active" }) → highest-volume stocks with volume vs 30-day average.

Cost: $0.005 USDC per call.`,
    {
      type:  z.enum(["gainers","losers","active","all"]).default("all").describe("Mover category: 'gainers' (top % price increase today), 'losers' (top % decline), 'active' (highest dollar volume traded), 'all' (all three categories combined)."),
      limit: z.number().int().default(20).describe("Number of stocks to return per category (e.g. top 10 gainers, top 10 losers). Range: 1-50."),
    },
    { ...READ_ONLY, title: "Get Market Movers" },
    async ({ type, limit }) => call(`${BASE()}/api/v1/market-movers?type=${type}&limit=${limit}`)
  );

  server.tool(
    "getIpoCalendar",
    `Fetch upcoming and recently priced IPOs with deal size, pricing range, market cap, sector, and underwriter details.

Use this tool when:
- A trading agent wants to participate in or monitor upcoming IPOs
- A research agent is assessing new public company supply hitting the market
- You need to know which sectors are attracting new listings
- An agent wants to assess market risk appetite via IPO activity (hot IPO market = RISK_ON)

Returns per IPO: company_name, ticker, exchange, pricing_date, shares_offered, price_range_low/high, expected_market_cap, sector, lead_underwriter, status (UPCOMING/PRICED/WITHDRAWN).

Example: getIpoCalendar({ days: 14 }) → 3 upcoming IPOs next 2 weeks: $2.1B fintech, $800M biotech, $450M SaaS.

Cost: $0.005 USDC per call.`,
    {
      days: z.number().int().default(30).describe("Window in days (past and future) to include IPO events. Use 7-14 for the immediate pipeline, 30 for monthly view, 90 for quarterly. Range: 1-90."),
    },
    { ...READ_ONLY, title: "Get IPO Calendar" },
    async ({ days }) => call(`${BASE()}/api/v1/ipo-calendar?days=${days}`)
  );

  server.tool(
    "getAnalystRatings",
    `Fetch Wall Street analyst upgrades and downgrades: firm name, rating change, new price target, and implied upside/downside from current price.

Use this tool when:
- A trading agent wants to know if a stock has recently been upgraded or downgraded
- You need analyst price targets to assess consensus valuation
- A research agent is tracking sentiment changes at major investment banks
- An agent wants to identify contrarian signals (mass downgrades = potential bottoms)

Returns: ticker, company, analyst_firm, old_rating, new_rating, old_target, new_target, implied_upside_pct, date, analyst_name.

Example: getAnalystRatings({ symbol: "NVDA", days: 7 }) → Goldman Sachs upgrades NVDA to BUY, raises PT to $1,100.
Example: getAnalystRatings({ days: 3 }) → all upgrades/downgrades across the market in the last 3 days.

Cost: $0.005 USDC per call.`,
    {
      symbol: z.string().default("").describe("Stock ticker to filter analyst ratings for (e.g. 'NVDA', 'AAPL', 'MSFT'). Leave empty to return market-wide analyst activity across all covered stocks."),
      days:   z.number().int().default(7).describe("Number of days back to include analyst rating changes. Use 1-3 for recent changes, 7 for weekly review, 30-90 for trend analysis. Range: 1-90."),
    },
    { ...READ_ONLY, title: "Get Analyst Ratings" },
    async ({ symbol, days }) => call(`${BASE()}/api/v1/analyst-ratings?symbol=${encodeURIComponent(symbol)}&days=${days}`)
  );

  server.tool(
    "getFearIndex",
    `Get the current VIX (CBOE Volatility Index) alongside the CNN Fear & Greed composite index, with historical context showing whether current fear levels are extreme (contrarian buy) or extreme greed (contrarian sell).

Use this tool when:
- A trading agent wants to assess market risk temperature before taking positions
- You need a quick single-metric read on whether the market is fearful or complacent
- A risk management agent is calibrating position sizes based on volatility regime
- An agent wants to detect contrarian opportunities (extreme fear = buy the dip opportunities)

Returns: VIX (current, 30d_avg, 52w_high), fear_greed_index (0-100), fear_greed_label (EXTREME_FEAR/FEAR/NEUTRAL/GREED/EXTREME_GREED), historical_context, signal.

Example: getFearIndex({ format: "summary" }) → VIX 28.4, Fear & Greed 18 (EXTREME FEAR) — historically bullish signal.

Cost: $0.005 USDC per call.`,
    {
      format: z.enum(["summary","full"]).default("summary").describe("Output format: 'summary' returns key metrics only (VIX, index score, label, signal), 'full' adds historical percentile context, 30/90/365-day trends, and interpretation guidance."),
    },
    { ...READ_ONLY, title: "Get Fear Index" },
    async ({ format }) => call(`${BASE()}/api/v1/fear-index?format=${format}`)
  );

  server.tool(
    "getFxRates",
    `Get live foreign exchange rates for major pairs, minor pairs, the Dollar Index (DXY), and crypto/USD crosses.

Use this tool when:
- A trading agent needs current FX rates before executing a currency trade
- A macro agent is assessing USD strength or weakness (DXY trend)
- A portfolio agent needs to calculate cross-currency exposure
- An agent is hedging currency risk and needs live bid/ask spreads

Returns per pair: pair, rate, bid, ask, spread_pips, 24h_change_pct, 1w_change_pct, trend (STRONG_USD/WEAK_USD/NEUTRAL).

Example: getFxRates({ pairs: "EURUSD,GBPUSD,DXY" }) → EUR/USD 1.0842 (-0.3%), DXY 104.2 (+0.4% — USD strengthening).

Cost: $0.005 USDC per call.`,
    {
      pairs: z.string().default("EURUSD,GBPUSD,USDJPY,AUDUSD,DXY").describe("Comma-separated FX pairs or indices to fetch (e.g. 'EURUSD,GBPUSD,USDJPY,DXY'). Supports all major/minor pairs, DXY index, and crypto crosses like BTCUSD,ETHUSD."),
    },
    { ...READ_ONLY, title: "Get FX Rates" },
    async ({ pairs }) => call(`${BASE()}/api/v1/fx-rates?pairs=${encodeURIComponent(pairs)}`)
  );

  server.tool(
    "getNftMarket",
    `Monitor the NFT market: floor prices, 24h/7d volume, blue-chip collection sentiment, wash trade detection, and overall market health signal.

Use this tool when:
- A crypto agent wants to assess NFT market conditions as a risk-on/risk-off signal
- You need floor prices for specific collections before making a purchase decision
- An agent is detecting wash trading to identify manipulated volume
- A DeFi agent wants to assess NFT-backed lending risks

Returns per collection: name, floor_price_eth/usd, 24h_volume_eth, 7d_change_pct, unique_buyers_24h, wash_trade_pct, listing_ratio, market_signal (BULLISH/BEARISH/NEUTRAL).

Example: getNftMarket({ collections: "cryptopunks,bored-ape-yacht-club" }) → CryptoPunks floor 48 ETH (-3.2%), BAYC 12 ETH (+8.1%).

Cost: $0.005 USDC per call.`,
    {
      collections: z.string().default("cryptopunks,bored-ape-yacht-club,azuki").describe("Comma-separated OpenSea collection slugs to analyse (e.g. 'cryptopunks', 'bored-ape-yacht-club', 'azuki', 'pudgy-penguins', 'doodles'). Use the exact OpenSea slug."),
    },
    { ...READ_ONLY, title: "Get NFT Market" },
    async ({ collections }) => call(`${BASE()}/api/v1/nft-market?collections=${encodeURIComponent(collections)}`)
  );

  server.tool(
    "getDefiYields",
    `Find the highest-yielding DeFi opportunities across Aave, Compound, Curve, Yearn, Morpho, and 100+ protocols. Returns APY, TVL, risk rating, and protocol audit status.

Use this tool when:
- A DeFi agent is allocating capital and wants to find the best risk-adjusted yield
- You need to compare yield opportunities across multiple chains and protocols
- An agent is rebalancing a yield portfolio and needs current APY data
- You want to identify high APY opportunities with associated protocol risk ratings

Returns per opportunity: protocol, asset, chain, apy, tvl_usd, apy_type (LENDING/LP/STAKING/VAULT), risk_rating (LOW/MEDIUM/HIGH), audited, reward_token.

Example: getDefiYields({ chain: "ethereum", minApy: 8 }) → Aave USDC 9.2% (LOW risk, $2.1B TVL), Morpho DAI 11.4% (MEDIUM risk).

Cost: $0.005 USDC per call.`,
    {
      chain:   z.string().default("all").describe("Blockchain to filter yield opportunities by. Options: 'all', 'ethereum', 'arbitrum', 'optimism', 'polygon', 'base', 'avalanche', 'bnb'. Use 'all' to find the best yield regardless of chain."),
      minApy:  z.number().default(5).describe("Minimum APY percentage threshold to include (e.g. 5 for 5%+, 10 for 10%+, 20 for high-yield only). Setting too high may return fewer results. Range: 0-1000."),
    },
    { ...READ_ONLY, title: "Get DeFi Yields" },
    async ({ chain, minApy }) => call(`${BASE()}/api/v1/defi-yields?chain=${encodeURIComponent(chain)}&minApy=${minApy}`)
  );

  server.tool(
    "getTokenUnlocks",
    `Track upcoming token vesting unlock events that could create selling pressure on crypto assets. Returns unlock schedule, percentage of circulating supply, and estimated market impact.

Use this tool when:
- A crypto trading agent wants to avoid holding tokens with imminent large unlocks
- You need to identify potential sell-pressure events before they hit the market
- An agent is assessing whether a token's price weakness is unlock-related
- A portfolio agent is timing entries around unlock-driven dips

Returns per event: token_name, ticker, unlock_date, unlock_amount, pct_of_circulating_supply, estimated_value_usd, unlock_type (TEAM/INVESTOR/ECOSYSTEM), impact_signal (HIGH/MEDIUM/LOW).

Example: getTokenUnlocks({ days: 14 }) → ARB unlock in 3 days: 1.1B tokens (8% supply, $750M) — HIGH pressure signal.

Cost: $0.005 USDC per call.`,
    {
      days: z.number().int().default(30).describe("Number of days ahead to scan for token unlock events. Use 7 for the immediate week, 30 for monthly planning, 90-180 for long-term scheduling. Range: 1-180."),
    },
    { ...READ_ONLY, title: "Get Token Unlocks" },
    async ({ days }) => call(`${BASE()}/api/v1/token-unlocks?days=${days}`)
  );

  server.tool(
    "getCryptoDerivatives",
    `Fetch crypto futures and options market data: funding rates (positive = longs paying shorts), open interest trends, recent liquidations, and basis (spot vs futures premium/discount).

Use this tool when:
- A crypto trading agent needs to assess sentiment via funding rates (high positive = overleveraged longs = bearish contrarian)
- You want to detect potential short/long squeezes via open interest changes
- An agent is managing a delta-neutral position and needs accurate funding cost
- You need to know which exchanges have the most derivatives activity and liquidity

Returns: funding_rate (8h), annualised_funding_pct, open_interest_usd, oi_change_24h_pct, liquidations_24h_usd (longs/shorts), basis_pct, perpetual_vs_quarterly_premium, dominant_exchange.

Example: getCryptoDerivatives({ symbol: "BTC" }) → BTC funding rate +0.085%/8h (annualised +93%) — longs heavily extended, BEARISH.

Cost: $0.005 USDC per call.`,
    {
      symbol:   z.string().default("BTC").describe("Crypto asset ticker to query derivatives data for (e.g. 'BTC', 'ETH', 'SOL', 'DOGE', 'LINK'). Focuses on perpetual futures and quarterly contracts for that asset."),
      exchange: z.string().default("all").describe("Exchange to filter derivatives data by. Options: 'all', 'binance', 'bybit', 'okx', 'deribit', 'bitmex'. Use 'deribit' for options data, 'all' for aggregated view."),
    },
    { ...READ_ONLY, title: "Get Crypto Derivatives" },
    async ({ symbol, exchange }) => call(`${BASE()}/api/v1/crypto-derivatives?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}`)
  );

  server.tool(
    "getStablecoins",
    `Monitor stablecoin health: peg deviation from $1.00, supply changes (minting/burning), market cap, backing composition, and depeg risk score.

Use this tool when:
- A DeFi agent needs to verify a stablecoin is holding its peg before using it in a protocol
- You want to detect early warning signs of a stablecoin collapse (e.g. UST-style depeg)
- A risk agent is assessing counterparty risk in stablecoin-denominated positions
- An agent is comparing stablecoin options for yield farming and needs health data

Returns per token: symbol, current_price, peg_deviation_pct, market_cap_usd, 24h_supply_change_pct, backing_type (FIAT/CRYPTO/ALGORITHMIC), depeg_risk_score (0-100, 100=imminent), audit_status.

Example: getStablecoins({ tokens: "USDT,USDC,DAI" }) → USDT $1.001 (+0.1%), USDC $0.9998 (-0.02%), depeg_risk: LOW.

Cost: $0.005 USDC per call.`,
    {
      tokens: z.string().default("USDT,USDC,DAI,FRAX").describe("Comma-separated stablecoin symbols to monitor. Supported: 'USDT', 'USDC', 'DAI', 'FRAX', 'TUSD', 'BUSD', 'PYUSD', 'CRVUSD', 'LUSD'. Use 'USDT,USDC' for the most critical pair."),
    },
    { ...READ_ONLY, title: "Get Stablecoins" },
    async ({ tokens }) => call(`${BASE()}/api/v1/stablecoins?tokens=${encodeURIComponent(tokens)}`)
  );

  server.tool(
    "getVirtualsProtocol",
    `Get live data on AI agents from the Virtuals Protocol ecosystem: token prices, market cap, 24h volume, trading activity, and rankings by agent activity score.

Use this tool when:
- An agent is investing in or monitoring AI agent tokens in the Virtuals ecosystem
- You need to track the performance of specific Virtuals agents (LUNA, AIXBT, etc.)
- A research agent is analysing the on-chain AI agent economy
- You want to identify the most active and valuable AI agents by market metrics

Returns per agent: agent_name, token_ticker, price_usd, market_cap, 24h_volume, 24h_change_pct, activity_score, holder_count, chain.

Example: getVirtualsProtocol({ limit: 10 }) → LUNA $0.84 (+12%), AIXBT $0.23 (-3%), top 10 by market cap.

Cost: $0.005 USDC per call.`,
    {
      limit: z.number().int().default(20).describe("Number of top Virtuals Protocol AI agents to return, ranked by market cap. Use 10 for a quick overview, 50-100 for comprehensive ecosystem view. Range: 1-100."),
    },
    { ...READ_ONLY, title: "Get Virtuals Protocol" },
    async ({ limit }) => call(`${BASE()}/api/v1/virtuals-protocol?limit=${limit}`)
  );

  server.tool(
    "getAiTokens",
    `Fetch performance data for AI/ML sector crypto tokens: NEAR, FET (Fetch.ai), AGIX (SingularityNET), RNDR (Render), WLD (Worldcoin), TAO (Bittensor), and the full AI token sector.

Use this tool when:
- An agent is investing in the AI token narrative and needs sector performance
- You want to compare AI token performance vs BTC/ETH benchmark
- A research agent is building a thesis on the AI crypto sector
- An agent needs to identify which AI tokens are outperforming or underperforming

Returns per token: name, ticker, price_usd, market_cap, 24h_change_pct, 7d_change_pct, 30d_change_pct, sector_rank, vs_btc_performance, narrative_tags.

Example: getAiTokens({ limit: 10 }) → TAO +45% (7d), RNDR +28%, FET +18% — AI sector outperforming BTC this week.

Cost: $0.005 USDC per call.`,
    {
      limit: z.number().int().default(30).describe("Number of AI-sector tokens to return, ranked by market cap. Use 10 for top-tier only, 30 for mid-caps included, 100 for the full AI token universe. Range: 1-100."),
    },
    { ...READ_ONLY, title: "Get AI Tokens" },
    async ({ limit }) => call(`${BASE()}/api/v1/ai-tokens?limit=${limit}`)
  );

  server.tool(
    "getBittensor",
    `Get live Bittensor (TAO) network data: subnet activity, validator rewards, emissions per subnet, top miners, and overall network health metrics.

Use this tool when:
- An agent is evaluating Bittensor subnet investment opportunities
- A research agent needs to understand which subnets are generating the most value
- You want to track TAO staking rewards and validator performance
- An agent is comparing Bittensor subnets to decide where to stake or mine

Returns per subnet: subnet_id, subnet_name, netuid, daily_emissions_tao, validator_count, miner_count, top_validators, avg_incentive, 30d_performance.

Example: getBittensor({ limit: 10 }) → Subnet 1 (Text Prompting): 420 TAO/day emissions, Subnet 8 (Coding): 380 TAO/day.

Cost: $0.005 USDC per call.`,
    {
      limit: z.number().int().default(20).describe("Number of top subnets to return ranked by daily TAO emissions/rewards. Use 10 for the most valuable subnets, 32 for half the network, 64 for all subnets. Range: 1-64."),
    },
    { ...READ_ONLY, title: "Get Bittensor" },
    async ({ limit }) => call(`${BASE()}/api/v1/bittensor?limit=${limit}`)
  );

  server.tool(
    "getModelPrices",
    `Compare AI model inference pricing across all major providers: input/output cost per 1M tokens, context window, capability tier, and best-value recommendations.

Use this tool when:
- An AI agent needs to select the most cost-effective model for a given task
- A cost-optimisation agent is comparing providers to reduce inference spend
- You need to know the latest pricing after a provider update (prices change frequently)
- An agent is building a routing layer and needs price/capability data to make routing decisions

Returns per model: provider, model_name, input_cost_per_1m_tokens, output_cost_per_1m_tokens, context_window_tokens, capability_tier, multimodal, best_for.

Example: getModelPrices({ providers: "openai,anthropic" }) → GPT-4o $5/$15 per 1M, Claude Sonnet $3/$15, Haiku $0.25/$1.25.

Cost: $0.005 USDC per call.`,
    {
      providers: z.string().default("openai,anthropic,google,mistral,groq").describe("Comma-separated AI providers to include. Supported: 'openai', 'anthropic', 'google', 'mistral', 'groq', 'cohere', 'together', 'perplexity', 'xai'. Use 'openai,anthropic' for the two dominant providers."),
    },
    { ...READ_ONLY, title: "Get Model Prices" },
    async ({ providers }) => call(`${BASE()}/api/v1/model-prices?providers=${encodeURIComponent(providers)}`)
  );

  server.tool(
    "getSpaceWeather",
    `Fetch NOAA space weather data: current KP index (geomagnetic storm intensity), solar flux (F10.7), X-ray flare class, and active NOAA alerts for solar radiation storms and geomagnetic disturbances.

Use this tool when:
- An agent is assessing risks to satellite communication or GPS navigation accuracy
- A risk agent needs to know if HF radio communication is disrupted (affects aviation/shipping)
- You want to monitor for G3+ geomagnetic storms that can damage power grid infrastructure
- A research agent is correlating space weather events with financial market anomalies

Returns: kp_index (0-9, 5+ = storm), storm_level (G1-G5), solar_flux_f107, xray_class (A/B/C/M/X), active_alerts, aurora_visibility_latitude, satellite_drag_risk.

Example: getSpaceWeather({ alerts: true }) → KP 7.2 (G3 SEVERE storm), X1.2 flare detected — GPS degraded at high latitudes.

Cost: $0.005 USDC per call.`,
    {
      alerts: z.boolean().default(true).describe("Set to true to include active NOAA geomagnetic storm and solar radiation alerts in the response (recommended). Set to false for data-only without alert notifications."),
    },
    { ...READ_ONLY, title: "Get Space Weather" },
    async ({ alerts }) => call(`${BASE()}/api/v1/space-weather?alerts=${alerts}`)
  );

  server.tool(
    "getEarthquakeMonitor",
    `Fetch significant recent earthquakes from USGS (United States Geological Survey): magnitude, epicentre location, depth, affected region, and tsunami watch/warning status.

Use this tool when:
- A risk agent is monitoring for seismic events that could disrupt infrastructure or supply chains
- An insurance or catastrophe risk agent needs real-time earthquake data
- You want to assess whether an earthquake could cause a tsunami (Pacific Rim events)
- A geopolitical risk agent is correlating natural disasters with economic disruption

Returns per event: magnitude, location, depth_km, coordinates, time_utc, tsunami_warning (YES/NO), affected_region, USGS_url, economic_impact_estimate.

Example: getEarthquakeMonitor({ days: 7, minMagnitude: 6.0 }) → M6.8 in Japan Sea (47km depth), no tsunami warning.

Cost: $0.005 USDC per call.`,
    {
      days:         z.number().int().default(7).describe("Number of days back to search for seismic events. Use 1 for today's events, 7 for the past week, 30 for monthly analysis. Range: 1-30."),
      minMagnitude: z.number().default(4.0).describe("Minimum Richter magnitude to include. Use 4.0 for all significant events, 5.0 for moderate damage potential, 6.0+ for major earthquakes, 7.0+ for great earthquakes. Range: 2.0-9.0."),
    },
    { ...READ_ONLY, title: "Get Earthquake Monitor" },
    async ({ days, minMagnitude }) => call(`${BASE()}/api/v1/earthquake-monitor?days=${days}&minMagnitude=${minMagnitude}`)
  );

  server.tool(
    "getEnergyPrices",
    `Get global energy commodity prices: WTI crude oil, Brent crude, Henry Hub natural gas, LNG (liquefied natural gas), thermal coal, and regional electricity spot prices.

Use this tool when:
- A macro agent needs energy price inputs for inflation modelling
- A trading agent is assessing the energy sector or commodity-linked currencies (CAD, NOK, RUB)
- You need to know the WTI/Brent spread as a geopolitical risk indicator
- A portfolio agent wants to assess energy transition risks via coal vs gas pricing

Returns per commodity: name, price, unit, currency, 24h_change_pct, 7d_change_pct, 1y_change_pct, supply_signal, demand_signal, key_driver.

Example: getEnergyPrices({ commodities: "wti,brent,natgas" }) → WTI $82.40/bbl, Brent $85.10, Brent-WTI spread $2.70, NatGas $2.18/MMBtu.

Cost: $0.005 USDC per call.`,
    {
      commodities: z.string().default("wti,brent,natgas,lng,coal").describe("Comma-separated energy commodities to fetch. Supported: 'wti' (West Texas Intermediate crude), 'brent' (Brent crude), 'natgas' (Henry Hub natural gas), 'lng' (liquefied natural gas), 'coal' (thermal coal), 'electricity' (European spot)."),
    },
    { ...READ_ONLY, title: "Get Energy Prices" },
    async ({ commodities }) => call(`${BASE()}/api/v1/energy-prices?commodities=${encodeURIComponent(commodities)}`)
  );

  server.tool(
    "getShippingRates",
    `Get global shipping and freight rates: Baltic Dry Index (BDI) for bulk shipping, Freightos container spot rates for major routes, port congestion indices, and supply chain stress signals.

Use this tool when:
- A macro agent wants shipping rates as a leading indicator of global trade volumes
- A supply chain risk agent is monitoring for port congestion or freight disruptions
- You need to assess inflation pressures from elevated freight costs
- An agent is monitoring the impact of geopolitical events (Red Sea, Panama Canal) on shipping routes

Returns: baltic_dry_index, BDI_change_pct, container_rates (per route, per 40ft container), port_congestion_indices, supply_chain_stress_score, key_disruptions.

Example: getShippingRates({ routes: "asia-europe,transpacific" }) → Asia-Europe $4,200/40ft (+18%), BDI 1,840 (-3.2%).

Cost: $0.005 USDC per call.`,
    {
      routes: z.string().default("asia-europe,transpacific,transatlantic").describe("Comma-separated shipping routes to include. Supported: 'asia-europe', 'transpacific' (Asia-US West Coast), 'transatlantic' (Europe-US), 'asia-australia', 'intra-asia'. Use 'asia-europe' to monitor Red Sea/Suez Canal impacts."),
    },
    { ...READ_ONLY, title: "Get Shipping Rates" },
    async ({ routes }) => call(`${BASE()}/api/v1/shipping-rates?routes=${encodeURIComponent(routes)}`)
  );

  server.tool(
    "getSemiconductorSupply",
    `Get semiconductor supply chain intelligence: TSMC/Samsung/Intel fab utilisation rates, chip lead times by process node, shortage/oversupply signals, and AI chip availability.

Use this tool when:
- A tech sector investor needs to assess semiconductor supply constraints impacting NVDA/AMD/TSMC
- A supply chain agent is evaluating chip availability risk for hardware products
- You need to understand AI chip (H100/A100) supply vs demand dynamics
- A macro agent is assessing tech sector capacity constraints as a growth limiter

Returns per node: process_node, leading_fab, utilisation_pct, lead_time_weeks, supply_signal (SHORTAGE/BALANCED/OVERSUPPLY), primary_customers, capacity_expansion_plans.

Example: getSemiconductorSupply({ nodes: "3nm,5nm" }) → TSMC 3nm: 95% utilisation, 52-week lead time (AI GPU shortage).

Cost: $0.005 USDC per call.`,
    {
      nodes: z.string().default("3nm,5nm,7nm,28nm").describe("Comma-separated semiconductor process nodes to analyse. Use '3nm,5nm' for cutting-edge AI chips (NVDA H-series, Apple Silicon), '7nm' for mainstream high-performance, '28nm' for mature automotive/IoT nodes."),
    },
    { ...READ_ONLY, title: "Get Semiconductor Supply" },
    async ({ nodes }) => call(`${BASE()}/api/v1/semiconductor-supply?nodes=${encodeURIComponent(nodes)}`)
  );

  server.tool(
    "getMergerActivity",
    `Track merger and acquisition (M&A) activity: announced deals, rumoured targets (based on options activity and news signals), deal premiums, regulatory status, and sector consolidation trends.

Use this tool when:
- A trading agent wants to identify potential M&A targets for event-driven trades
- A research agent is building a sector consolidation thesis
- You need to know about pending regulatory approvals for major deals
- An agent is assessing whether a company is an acquisition target or acquirer

Returns per deal: acquirer, target, deal_value_usd, premium_pct, sector, status (RUMOURED/ANNOUNCED/PENDING_REGULATORY/CLOSED/WITHDRAWN), regulatory_risk, synergy_rationale.

Example: getMergerActivity({ sector: "ai", days: 30 }) → Google/HubSpot rumoured ($35B), Microsoft/gaming regulatory, 3 AI startups acquired.

Cost: $0.005 USDC per call.`,
    {
      sector: z.string().default("tech").describe("Industry sector to focus M&A intelligence on. Options: 'tech', 'ai', 'finance', 'healthcare', 'energy', 'telecom', 'media', 'retail', 'all'. Use 'ai' to track AI startup acquisitions."),
      days:   z.number().int().default(30).describe("Number of days back to scan for M&A announcements and rumours. Use 7 for recent deals, 30 for monthly deal flow, 90-180 for quarterly trend analysis. Range: 1-180."),
    },
    { ...READ_ONLY, title: "Get Merger Activity" },
    async ({ sector, days }) => call(`${BASE()}/api/v1/merger-activity?sector=${encodeURIComponent(sector)}&days=${days}`)
  );

  server.tool(
    "getPrivateEquity",
    `Fetch private equity (PE) and venture capital (VC) deal flow: funding rounds, exits (IPOs and acquisitions), dry powder levels, sector focus shifts, and notable investor activity.

Use this tool when:
- A research agent is tracking startup funding trends and investor activity
- An agent wants to know which sectors VCs are currently prioritising
- You need to assess private market valuations as a leading indicator for public markets
- A BD agent is identifying well-funded startups as potential customers or partners

Returns per deal: company, sector, round_type (SEED/A/B/C/GROWTH), amount_usd, lead_investors, valuation_usd, date, country. Also returns: sector_heat_map, top_investors_by_deal_count, dry_powder_estimate.

Example: getPrivateEquity({ sector: "ai", days: 30 }) → 47 AI funding rounds this month, $2.8B total — Series A median $12M.

Cost: $0.005 USDC per call.`,
    {
      sector: z.string().default("ai").describe("Industry sector to filter PE/VC deals for. Options: 'ai', 'fintech', 'biotech', 'deeptech', 'crypto', 'climate', 'defense', 'all'. Use 'ai' to track AI/ML startup investment."),
      days:   z.number().int().default(30).describe("Number of days back to include private equity and venture capital deals. Use 7 for recent activity, 30 for monthly trend, 90-180 for quarterly analysis. Range: 1-180."),
    },
    { ...READ_ONLY, title: "Get Private Equity" },
    async ({ sector, days }) => call(`${BASE()}/api/v1/private-equity?sector=${encodeURIComponent(sector)}&days=${days}`)
  );

  server.tool(
    "getRealEstateMarket",
    `Fetch US real estate market data: median home prices, mortgage rates (30yr fixed, 15yr fixed, ARM), active inventory, days-on-market, affordability index, and regional price trends.

Use this tool when:
- A macro agent needs housing data to assess consumer wealth effects and inflation
- A REIT investment agent wants to understand regional real estate trends
- You need mortgage rate data as a leading indicator for housing demand
- An agent is assessing the impact of Fed rate decisions on the housing market

Returns: median_sale_price, 12m_change_pct, mortgage_rate_30yr, mortgage_rate_15yr, active_inventory, months_of_supply, days_on_market, affordability_index, regional_breakdown (top 10 metros).

Example: getRealEstateMarket({ region: "national" }) → US median $425k (+4.2%), 30yr mortgage 7.1%, 3.2 months supply.
Example: getRealEstateMarket({ region: "miami" }) → Miami median $620k (+8.1%), inventory down 15%.

Cost: $0.005 USDC per call.`,
    {
      region: z.string().default("national").describe("US region or metro area to get real estate data for. Options: 'national', 'new-york', 'los-angeles', 'miami', 'chicago', 'houston', 'dallas', 'phoenix', 'seattle', 'denver', 'austin'. Use 'national' for the overall US market."),
    },
    { ...READ_ONLY, title: "Get Real Estate Market" },
    async ({ region }) => call(`${BASE()}/api/v1/real-estate-market?region=${encodeURIComponent(region)}`)
  );

  server.tool(
    "getGithubTrending",
    `Fetch trending GitHub repositories by stars today/this week/this month. Filter by programming language and topic. AI/ML repositories and agentic frameworks are highlighted.

Use this tool when:
- A research agent is discovering new tools, frameworks, or libraries gaining traction
- An agent wants early signals on emerging tech trends before they go mainstream
- You need to find the hottest open-source projects in a specific domain
- A developer agent is scouting for relevant libraries to recommend or integrate

Returns per repo: name, owner, description, stars, stars_today, language, topics, url, breakthrough_signal (if exceptional growth).

Example: getGithubTrending({ topic: "mcp", period: "weekly" }) → top MCP repos gaining stars this week.
Example: getGithubTrending({ language: "python", topic: "agents", period: "daily" }) → hottest Python agent repos today.

Cost: $0.005 USDC per call.`,
    {
      language: z.string().default("").describe("Programming language to filter repositories by (e.g. 'python', 'typescript', 'rust', 'go', 'c++'). Leave empty to include all languages and find the most broadly trending repos."),
      topic:    z.string().default("ai").describe("GitHub topic tag to filter repositories by (e.g. 'ai', 'llm', 'agents', 'mcp', 'rag', 'rust', 'blockchain'). Use 'llm' or 'agents' to focus on AI agent tooling."),
      period:   z.enum(["daily","weekly","monthly"]).default("daily").describe("Trending time window: 'daily' (stars gained today — very fresh), 'weekly' (past 7 days — sustained momentum), 'monthly' (past 30 days — established growth trends)."),
    },
    { ...READ_ONLY, title: "Get GitHub Trending" },
    async ({ language, topic, period }) => call(`${BASE()}/api/v1/github-trending?language=${encodeURIComponent(language)}&topic=${encodeURIComponent(topic)}&period=${period}`)
  );

  // ── TIER 2 — $5–$25/call ─────────────────────────────────────────────────────

  server.tool(
    "getB2bIntel",
    `Generate Golden Lead packets for B2B sales agents. Cross-references SEC filings, GitHub activity, and job postings to score companies as HOT/WARM/COLD leads with AI pivot signals and recommended outreach angles.

Use this tool when:
- A sales agent needs to prioritise outreach to companies most likely to buy AI services
- You want to detect which companies are actively transitioning to AI and need vendors
- A BD agent is building a prospect list with data-backed prioritisation
- You need company intelligence that goes beyond basic firmographic data

Returns per company: lead_score (HOT/WARM/COLD), ai_pivot_signal, recent_sec_mentions_of_ai, github_ai_repos_added, open_ai_roles, funding_stage, recommended_outreach_angle, key_contacts.

Example: getB2bIntel({ companies: ["salesforce", "oracle", "sap"] }) → Salesforce HOT (12 AI roles, $2B AI capex in 10-K), Oracle WARM, SAP COLD.

Cost: $5 USDC per call.`,
    {
      companies: z.array(z.string()).min(1).max(10).default(["microsoft","salesforce","oracle"]).describe("List of 1-10 company names or domains to generate B2B intelligence for (e.g. ['salesforce', 'oracle', 'sap']). Use exact company names or domain names (e.g. 'salesforce.com')."),
    },
    { ...READ_ONLY, title: "Get B2B Intel" },
    async ({ companies }) =>
      call(`${BASE()}/api/v2/intel`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ companies }) })
  );

  server.tool(
    "getGithubVelocity",
    `Analyse a company's GitHub organisation for AI pivot signals: new AI/ML repositories, topic tag changes, star velocity, commit frequency, and contributor growth. Returns an AI adoption score.

Use this tool when:
- You need to verify whether a company is genuinely building AI (vs just talking about it)
- A sales agent wants to time outreach to match a company's AI development phase
- A research agent is assessing a company's technical capabilities and momentum
- An investor wants to quantify a company's open-source AI activity as a due diligence signal

Returns: ai_pivot_score (0-100), new_ai_repos, ai_topic_repos, total_stars_gained, commit_velocity, top_contributors, breakthrough_repos (fastest-growing), inferred_ai_focus_areas.

Example: getGithubVelocity({ org: "microsoft", days: 30 }) → score 94, 8 new AI repos, 42k stars this month — HEAVY AI pivot.

Cost: $5 USDC per call.`,
    {
      org:  z.string().describe("GitHub organisation slug to analyse for AI activity (e.g. 'openai', 'anthropic', 'microsoft', 'google', 'meta'). Must be the exact GitHub org handle."),
      days: z.number().int().default(30).describe("Number of days back to measure repository activity and velocity. Use 7 for recent sprint, 30 for monthly, 90 for quarterly trend. Range: 1-365."),
    },
    { ...READ_ONLY, title: "Get GitHub Velocity" },
    async ({ org, days }) => call(`${BASE()}/api/v2/github-velocity?org=${encodeURIComponent(org)}&days=${days}`)
  );

  server.tool(
    "getJobPivots",
    `Identify companies actively hiring for agentic AI roles from Greenhouse, Lever, HackerNews Who's Hiring, and Remotive. Job posting spikes are a strong buyer intent signal — companies building AI need AI tools.

Use this tool when:
- A sales agent wants to find companies in active AI build mode (highest conversion likelihood)
- You need to detect which companies are expanding their AI teams right now
- A market research agent is quantifying AI adoption by measuring hiring demand
- A VC/investor agent wants to identify companies where AI is a strategic priority

Returns per company: company_name, open_ai_roles_count, role_titles, avg_salary, seniority_mix, hiring_velocity (vs 30d_prior), inferred_ai_focus, recommended_tools_to_pitch.

Example: getJobPivots({ roles: ["AI Engineer", "LLM Engineer"] }) → Stripe: 12 AI roles (up 4x), Shopify: 8, Figma: 6.

Cost: $5 USDC per call.`,
    {
      roles:     z.array(z.string()).default(["AI Engineer","ML Engineer","Agentic Systems"]).describe("List of job title keywords to search for as AI hiring signals (e.g. ['AI Engineer', 'LLM Engineer', 'Prompt Engineer', 'AI Product Manager']). More specific titles = more precise signals."),
      companies: z.array(z.string()).default([]).describe("Optional list of specific company names to filter results for (e.g. ['stripe', 'shopify', 'figma']). Leave empty to scan the entire market and return top companies by AI hiring activity."),
    },
    { ...READ_ONLY, title: "Get Job Pivots" },
    async ({ roles, companies }) =>
      call(`${BASE()}/api/v2/job-pivots`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ roles, companies }) })
  );

  server.tool(
    "getSecFilings",
    `Search real-time SEC filings (8-K, 10-K, 10-Q, S-1) for AI/autonomous operations mentions. Returns filings ranked by AI-relevance score with key extracted passages.

Use this tool when:
- A research agent needs to know what public companies are saying about AI in their official filings
- An investor agent is identifying companies making material AI investments or disclosures
- You need to detect new AI risk factors companies are disclosing to regulators
- A compliance agent is monitoring for AI-related regulatory disclosures

Returns per filing: company, ticker, form_type, filed_date, ai_relevance_score (0-100), key_passages, ai_keywords_found, material_disclosure (YES/NO), filing_url.

Example: getSecFilings({ query: "large language model autonomous agents", forms: "10-K", days: 30 }) → MSFT 10-K: score 94, "$13B AI capex" passage flagged.

Cost: $5 USDC per call.`,
    {
      query:    z.string().default("agentic AI autonomous").describe("Keywords to search within SEC filing text (e.g. 'large language model autonomous agents', 'artificial intelligence capital expenditure', 'AI risk'). Supports boolean operators: 'AI AND autonomous AND revenue'."),
      days:     z.number().int().default(7).describe("Number of days back to search for relevant SEC filings. Use 1-7 for breaking disclosures, 30 for monthly review, 90 for quarterly sweep. Range: 1-90."),
      forms:    z.string().default("8-K").describe("Comma-separated SEC form types to include. Common types: '8-K' (material events, breaking), '10-K' (annual report), '10-Q' (quarterly), 'S-1' (IPO filing), 'DEF 14A' (proxy statement). Use '8-K,10-K' for the most important filings."),
      minScore: z.number().int().default(0).describe("Minimum AI-relevance score threshold (0-100) to filter results. Use 0 for all matches, 50 for meaningfully AI-focused filings, 80+ for filings where AI is a primary topic. Range: 0-100."),
    },
    { ...READ_ONLY, title: "Get SEC Filings" },
    async ({ query, days, forms, minScore }) => call(`${BASE()}/api/v2/sec-filings?${new URLSearchParams({ query, days: String(days), forms, minScore: String(minScore) })}`)
  );

  server.tool(
    "getAiPatents",
    `Search USPTO patent database for AI-related filings: applicant companies, patent titles, abstract summaries, filing dates, and technology classification. Reveals who is building what in neural networks, autonomous agents, and LLMs.

Use this tool when:
- A research agent is building a competitive intelligence map of AI patent activity
- An investor agent wants to assess a company's AI IP portfolio strength
- You need to track which companies are filing the most AI patents (leading indicator of R&D)
- A legal/compliance agent is conducting freedom-to-operate analysis for AI systems

Returns per patent: patent_number, title, assignee_company, filing_date, abstract_summary, technology_class, citation_count, similar_patents, competitive_threat_score.

Example: getAiPatents({ query: "autonomous agent planning", companies: "google,microsoft" }) → Google: 14 patents on agent planning this quarter.

Cost: $5 USDC per call.`,
    {
      query:     z.string().default("artificial intelligence agentic").describe("Patent search keywords covering the technical domain (e.g. 'autonomous agents LLM', 'neural network inference optimisation', 'multimodal AI system', 'transformer architecture'). More specific = more relevant results."),
      companies: z.string().default("").describe("Comma-separated company/assignee names to filter patents for (e.g. 'google,microsoft,amazon,apple'). Leave empty to search across all companies and identify the most active patent filers."),
      days:      z.number().int().default(90).describe("Number of days back to search for new patent applications and grants. Use 30 for recent filings, 90 for quarterly, 365 for annual landscape analysis. Range: 1-365."),
    },
    { ...READ_ONLY, title: "Get AI Patents" },
    async ({ query, companies, days }) => call(`${BASE()}/api/v2/patents?${new URLSearchParams({ query, companies, days: String(days) })}`)
  );

  server.tool(
    "getCompanyProfile",
    `Build a full company intelligence dossier by combining SEC filings + GitHub velocity + hiring signals + patent activity + HackerNews sentiment. Returns a HOT/WARM/COLD lead score with recommended action.

Use this tool when:
- A sales or BD agent needs a comprehensive one-stop company briefing before outreach
- An investor agent is doing rapid due diligence on a prospect
- You need a 360-degree view of a company's AI posture and financial health
- A research agent is comparing multiple companies and needs standardised profiles

Returns: lead_score, ai_pivot_score, financial_health_summary, ai_github_activity, open_ai_roles, recent_sec_ai_mentions, patent_count, hn_sentiment, recommended_outreach_angle, key_contacts, competitor_landscape.

Example: getCompanyProfile({ company: "notion", github: "makenotion", days: 30 }) → HOT — 8 AI repos, 15 AI roles, positive HN sentiment on AI features.

Cost: $5 USDC per call.`,
    {
      company: z.string().describe("Company name or domain to generate the full intelligence dossier for (e.g. 'notion', 'stripe', 'figma', 'shopify'). Use the common name, not the legal entity name."),
      github:  z.string().default("").describe("GitHub organisation slug for the company (e.g. 'makenotion' for Notion, 'stripe' for Stripe). Leave empty to auto-detect the GitHub org from the company name."),
      days:    z.number().int().default(30).describe("Lookback window in days for all data sources in the dossier. Use 7 for current snapshot, 30 for monthly, 90 for quarterly view. Range: 1-180."),
    },
    { ...READ_ONLY, title: "Get Company Profile" },
    async ({ company, github, days }) =>
      call(`${BASE()}/api/v2/company-profile`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ company, github, days }) })
  );

  server.tool(
    "getWhaleTracker",
    `Monitor on-chain large wallet movements: significant BTC and ETH transfers, exchange inflows (bearish — selling pressure) and outflows (bullish — self-custody), and smart money wallet behaviour.

Use this tool when:
- A crypto trading agent wants to detect institutional buying or selling before it hits price
- You need to know if large amounts of BTC/ETH are moving to exchanges (sell signal) or away (hold/buy signal)
- An agent is tracking known whale wallets for directional intelligence
- A DeFi agent wants to detect large capital flows into or out of protocols

Returns per transaction: wallet_address, amount_token, amount_usd, direction (EXCHANGE_INFLOW/EXCHANGE_OUTFLOW/WALLET_TO_WALLET), exchange (if applicable), timestamp, signal (BULLISH/BEARISH/NEUTRAL).

Example: getWhaleTracker({ chain: "btc", minValueUSD: 5000000 }) → 3 wallets moved 1,200 BTC ($78M) to Coinbase — BEARISH exchange inflow.

Cost: $5 USDC per call.`,
    {
      chain:        z.enum(["btc","eth","all"]).default("all").describe("Blockchain to monitor for large wallet movements: 'btc' (Bitcoin only), 'eth' (Ethereum and ERC-20 tokens), 'all' (both chains combined for a complete whale picture)."),
      minValueUSD:  z.number().default(1000000).describe("Minimum transaction value in USD to classify as a whale movement. Use 1000000 ($1M) for active monitoring, 5000000 ($5M) for major moves only, 50000000 ($50M) for institutional-scale movements."),
    },
    { ...READ_ONLY, title: "Get Whale Tracker" },
    async ({ chain, minValueUSD }) => call(`${BASE()}/api/v2/whale-tracker?chain=${chain}&minValueUSD=${minValueUSD}`)
  );

  server.tool(
    "getFundingRounds",
    `Fetch VC and PE funding rounds: deal amount, lead investors, valuation (if disclosed), sector, and stage. AI startup deals are highlighted with tech stack and growth signals.

Use this tool when:
- A sales agent wants to target recently funded companies (they have budget to spend)
- A research agent is tracking capital flow into specific sectors
- An investor agent is monitoring competitive funding activity in a portfolio sector
- You want to identify which VCs are most active in AI right now

Returns per deal: company, sector, stage (SEED/A/B/C/GROWTH/PE), amount_usd, valuation_usd, lead_investors, co_investors, date, country, use_of_funds, relevant_to_ai.

Example: getFundingRounds({ sector: "ai", days: 7, minAmountM: 10 }) → Cohere $500M Series E, Perplexity $250M Series B, 4 other AI rounds $10M+.

Cost: $5 USDC per call.`,
    {
      sector:     z.string().default("ai").describe("Industry sector to filter funding rounds for. Options: 'ai', 'fintech', 'biotech', 'deeptech', 'crypto', 'climate', 'saas', 'defense', 'all'. Use 'ai' to track AI/ML investment specifically."),
      days:       z.number().int().default(30).describe("Number of days back to include funding announcements. Use 7 for breaking rounds, 30 for monthly, 90 for quarterly deal flow. Range: 1-180."),
      minAmountM: z.number().default(1).describe("Minimum deal size in millions USD (e.g. 1 for $1M+, 10 for $10M+ Series A+, 100 for $100M+ growth rounds). Higher threshold = fewer but more significant deals."),
    },
    { ...READ_ONLY, title: "Get Funding Rounds" },
    async ({ sector, days, minAmountM }) => call(`${BASE()}/api/v2/funding-rounds?sector=${encodeURIComponent(sector)}&days=${days}&minAmountM=${minAmountM}`)
  );

  server.tool(
    "getCompetitorIntel",
    `Build a competitive intelligence dossier: product launches, pricing changes, hiring signals, patent filings, and funding activity for a company vs its competitors. Returns a competitive position assessment.

Use this tool when:
- A strategy agent needs to understand a company's competitive landscape
- A sales agent wants to know a prospect's competitive pressures (selling opportunity)
- You need to detect competitor moves before they become public knowledge
- An investor agent is assessing competitive moat and differentiation

Returns: competitive_position (LEADER/CHALLENGER/FOLLOWER/NICHE), key_differentiators, competitor_moves (recent launches/pricing/hires), threat_level per competitor, market_share_estimate, strategic_recommendation.

Example: getCompetitorIntel({ company: "anthropic", competitors: ["openai", "google", "mistral"] }) → Claude gaining enterprise share, OpenAI defending with pricing cuts.

Cost: $5 USDC per call.`,
    {
      company:     z.string().describe("Primary company to build competitive intelligence around (e.g. 'anthropic', 'openai', 'notion', 'stripe'). This is the focal company for the analysis."),
      competitors: z.array(z.string()).default([]).describe("List of competitor company names to compare against (e.g. ['openai', 'google', 'mistral']). Leave empty to auto-identify the top 5 competitors from market data."),
    },
    { ...READ_ONLY, title: "Get Competitor Intel" },
    async ({ company, competitors }) =>
      call(`${BASE()}/api/v2/competitor-intel`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ company, competitors }) })
  );

  server.tool(
    "getHedgeFunds",
    `Fetch hedge fund 13F filings from the SEC: top holdings, new positions initiated, positions exited, and sector rotation signals from major funds like Bridgewater, Renaissance, Tiger Global, and Citadel.

Use this tool when:
- An investment agent wants to follow institutional smart money positioning
- You need to detect which sectors hedge funds are rotating into or out of
- A research agent is building a market thesis anchored to institutional flows
- An agent wants to identify stocks that multiple top funds are accumulating (conviction signal)

Returns per fund: fund_name, AUM, top_10_holdings, new_positions (this quarter), closed_positions, sector_allocation_changes, most_bought, most_sold, filing_date.

Example: getHedgeFunds({ fund: "Bridgewater", sector: "technology" }) → Bridgewater 13F: added NVDA, exited TSLA, tech now 22% of portfolio.

Cost: $5 USDC per call.`,
    {
      fund:    z.string().default("").describe("Hedge fund name to filter 13F filings for (e.g. 'Bridgewater', 'Renaissance', 'Tiger Global', 'Citadel', 'Pershing Square'). Leave empty to aggregate data across the top 20 hedge funds by AUM."),
      sector:  z.string().default("technology").describe("Sector to focus position analysis on (e.g. 'technology', 'healthcare', 'energy', 'financials', 'consumer', 'all'). Use 'technology' to track AI-related institutional holdings."),
      quarter: z.string().default("latest").describe("Filing quarter to retrieve (e.g. '2024Q4', '2025Q1', '2025Q2', or 'latest' for the most recent available). Note: 13F filings are delayed by 45 days after quarter-end."),
    },
    { ...READ_ONLY, title: "Get Hedge Funds" },
    async ({ fund, sector, quarter }) => call(`${BASE()}/api/v2/hedge-funds?fund=${encodeURIComponent(fund)}&sector=${encodeURIComponent(sector)}&quarter=${encodeURIComponent(quarter)}`)
  );

  server.tool(
    "getDaoGovernance",
    `Fetch DAO governance activity: active proposals, voting power distribution, treasury size and composition, community sentiment, and quorum status.

Use this tool when:
- A DeFi agent needs to track governance proposals that could change protocol parameters (affecting yields/fees)
- A token holder agent wants to vote or monitor upcoming governance decisions
- You need to assess protocol health via governance participation rates
- An agent is evaluating a protocol's decentralisation (voting power concentration = risk)

Returns per proposal: protocol, proposal_id, title, description, votes_for, votes_against, quorum_reached, status, end_time, proposer, estimated_impact. Also: treasury_value_usd, top_token_holders_pct.

Example: getDaoGovernance({ protocol: "uniswap", status: "active" }) → Uniswap proposal to add 0.15% fee tier — 78M UNI for, 12M against, quorum reached.

Cost: $5 USDC per call.`,
    {
      protocol: z.string().default("").describe("Protocol name to filter DAO governance data for. Supported: 'uniswap', 'aave', 'compound', 'maker', 'curve', 'lido', 'arbitrum', 'optimism', 'ens'. Leave empty to return active proposals across all major DAOs."),
      status:   z.enum(["active","passed","failed","all"]).default("active").describe("Proposal status filter: 'active' (currently voting — most urgent), 'passed' (approved, pending execution), 'failed' (rejected), 'all' (complete history). Use 'active' to find time-sensitive decisions."),
    },
    { ...READ_ONLY, title: "Get DAO Governance" },
    async ({ protocol, status }) => call(`${BASE()}/api/v2/dao-governance?protocol=${encodeURIComponent(protocol)}&status=${status}`)
  );

  server.tool(
    "getGeopoliticalCrisis",
    `Real-time geopolitical crisis monitoring using GDELT event database, OFAC alerts, and social signal analysis. Returns crisis scores, escalation risk, projected market impact on oil/gold/USD/defence stocks, and Reddit/HackerNews viral intelligence.

Use this tool when:
- A macro agent needs to assess geopolitical tail risk before taking large positions
- A trading agent wants to know how a crisis event is likely to move oil, gold, and safe-haven currencies
- You need an early warning system for escalating conflicts before they move markets
- A risk agent is stress-testing a portfolio against geopolitical scenarios

Returns per region: crisis_score (0-100), escalation_risk (LOW/MEDIUM/HIGH/CRITICAL), active_events, market_impact (oil_pct, gold_pct, USD_pct, defence_stocks_pct), OFAC_alerts, social_signal_viral_events, recommended_hedges.

Example: getGeopoliticalCrisis({ regions: "middle-east" }) → Crisis score 78 (HIGH), Iran-Israel: oil +8% projected, gold +4%, USD +2%.

Cost: $25 USDC per call.`,
    {
      regions:             z.string().default("middle-east,ukraine,taiwan").describe("Comma-separated geopolitical regions to monitor. Supported: 'middle-east' (Iran/Israel/Gaza), 'ukraine' (Russia/NATO), 'taiwan' (China/US), 'korea' (DPRK), 'global' (all regions). Use 'middle-east,ukraine' for the two highest-risk current flashpoints."),
      includeMarketImpact: z.boolean().default(true).describe("Set to true (recommended) to include projected market impact estimates on oil, gold, USD, and defence stocks for each crisis scenario. Set to false for raw event data only."),
    },
    { ...READ_ONLY, title: "Get Geopolitical Crisis" },
    async ({ regions, includeMarketImpact }) => call(`${BASE()}/api/v2/geopolitical-crisis?regions=${encodeURIComponent(regions)}&includeMarketImpact=${includeMarketImpact}`)
  );

  // ── BUNDLES — $0.50–$500 ─────────────────────────────────────────────────────

  server.tool(
    "runBundleStarter",
    `AI Agent Starter Pack — calls compliance + market sentiment + trading signals + macro data + news in a single bundled request. Ideal for agents that need a broad market context snapshot.

Use this tool when:
- An agent is initialising and needs a full market brief before starting work
- You want 5 tools' worth of data in one call at a fraction of the individual cost ($0.50 vs $0.025 individual)
- A morning brief agent is generating a daily market overview for a user
- An agent needs to orient itself before deciding which deeper tools to call

Returns: compliance_status, market_sentiment (RISK_ON/OFF), trading_signal (for specified symbol), macro_overview (rates/inflation), top_5_news_stories.

Example: runBundleStarter({ symbol: "XAUUSD", assets: "BTC,ETH,GOLD" }) → Full gold trading context: macro environment, sentiment, signal, news — in one call.

Cost: $0.50 USDC per call (equivalent to 5 Tier 1 tools for $0.025 if called separately).`,
    {
      symbol: z.string().default("XAUUSD").describe("Primary trading symbol to generate signals for in the starter bundle (e.g. 'XAUUSD' for Gold, 'BTCUSD' for Bitcoin, 'EURUSD' for Euro/Dollar, 'SPY' for S&P 500 ETF)."),
      assets: z.string().default("BTC,ETH,GOLD").describe("Comma-separated asset tickers to include in sentiment and market data section of the bundle (e.g. 'BTC,ETH,GOLD,SPY')."),
    },
    { ...READ_ONLY, title: "Run Starter Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/starter`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "runBundleMarketIntel",
    `Market Intelligence Pack — combines trading signals + on-chain data + macro + options flow + insider trades + earnings into a comprehensive market intelligence report. Best value for active trading agents.

Use this tool when:
- A trading agent wants a full-spectrum market view before sizing into positions
- You need to cross-reference technical signals with institutional flow (options + insider)
- An agent is doing pre-market prep and needs all data sources in one efficient call
- A risk manager needs a complete market health assessment

Returns: trading_signals (per symbol), onchain_metrics, macro_environment, unusual_options_flow, insider_buying_selling, upcoming_earnings_risks.

Example: runBundleMarketIntel({ symbols: ["XAUUSD", "BTCUSD", "SPY"] }) → Full market intel for 3 assets: all signals, flows, and earnings in one response.

Cost: $25 USDC per call.`,
    {
      symbols: z.array(z.string()).default(["XAUUSD","BTCUSD","SPY"]).describe("List of trading symbols to include in the market intelligence bundle. Supports up to 10 symbols (e.g. ['XAUUSD', 'BTCUSD', 'EURUSD', 'SPY', 'NVDA']). Mix asset classes for a diversified market view."),
    },
    { ...READ_ONLY, title: "Run Market Intel Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/market-intel`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "runBundleCompanyDeep",
    `Company Deep Dive — runs full company profile + competitor intel + hedge fund positioning + analyst ratings + SEC filings for a single company. The most comprehensive company intelligence available.

Use this tool when:
- An investor agent needs exhaustive due diligence on a company before a major investment decision
- A sales agent wants a complete brief on a key prospect before an executive meeting
- You need to understand a company's AI posture, competitive position, and institutional sentiment simultaneously
- A research agent is writing a detailed company report

Returns: company_profile, competitive_position, hedge_fund_holdings, analyst_consensus, recent_sec_disclosures, ai_adoption_score, investment_thesis (BULL/BEAR/NEUTRAL), key_risks.

Example: runBundleCompanyDeep({ company: "nvidia", github: "nvidia" }) → Full NVDA brief: 94/100 AI score, held by 8 top funds, analyst PT $1,100, no SEC red flags.

Cost: $50 USDC per call.`,
    {
      company: z.string().describe("Company name to run the full deep-dive intelligence bundle on (e.g. 'nvidia', 'microsoft', 'openai', 'stripe'). Use the company's common name."),
      github:  z.string().default("").describe("GitHub organisation slug for the company (e.g. 'nvidia', 'microsoft', 'openai'). Leave empty to auto-detect."),
    },
    { ...READ_ONLY, title: "Run Company Deep Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/company-deep`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "runBundleCryptoAlpha",
    `Crypto Alpha Pack — aggregates on-chain metrics + whale tracker + DeFi yields + AI tokens + crypto derivatives + stablecoin health into a single crypto market intelligence report.

Use this tool when:
- A crypto trading agent needs a complete on-chain and derivatives picture before executing
- A DeFi agent wants to simultaneously assess network health, yields, and market positioning
- You need to identify alpha opportunities across the crypto ecosystem in one efficient call
- A portfolio agent is rebalancing crypto holdings and needs a full market read

Returns: network_metrics (BTC/ETH), whale_movements, best_defi_yields, ai_token_performance, derivatives_sentiment (funding/OI), stablecoin_health, overall_crypto_signal.

Example: runBundleCryptoAlpha({ chains: "btc,eth" }) → BTC whale outflows (bullish), ETH gas 18gwei, AAVE 9% yield, BTC funding +0.04% (neutral), all stables pegged.

Cost: $25 USDC per call.`,
    {
      chains: z.string().default("btc,eth").describe("Comma-separated blockchain networks to include in the crypto alpha bundle. Supported: 'btc', 'eth', 'sol', 'base', 'arbitrum', 'polygon'. Use 'btc,eth' for the two dominant networks."),
    },
    { ...READ_ONLY, title: "Run Crypto Alpha Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/crypto-alpha`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "runBundleMacroGlobal",
    `Global Macro Pack — aggregates macro indicators + FX rates + interest rate environment + inflation data + consumer/labour data across multiple economies into a single macro intelligence report.

Use this tool when:
- A macro-driven trading agent needs a complete global economic picture
- A portfolio agent is assessing macro regime (risk-on/risk-off, hawkish/dovish) for asset allocation
- You need to compare economic conditions across multiple countries simultaneously
- A currency trading agent wants macro context for FX positioning

Returns per country: interest_rate, CPI, GDP_growth, unemployment, yield_curve, currency_strength, macro_regime (HAWKISH/DOVISH/NEUTRAL). Also: global_risk_score, recommended_asset_allocation.

Example: runBundleMacroGlobal({ countries: "US,EU,JP" }) → US HAWKISH (5.5% rate, 3.2% CPI), EU NEUTRAL, JP ultra-DOVISH — buy USD/JPY thesis.

Cost: $50 USDC per call.`,
    {
      countries: z.string().default("US,EU,JP,GB,CN").describe("Comma-separated ISO country codes to include in the global macro bundle. Supported: US, EU, GB, JP, CN, AU, CA, CH, SE, NO, BR. Use 'US,EU,JP' for the three major currency blocs."),
    },
    { ...READ_ONLY, title: "Run Global Macro Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/macro-global`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "runBundleAiEconomy",
    `AI Economy Intelligence — aggregates ArXiv research + GitHub trending + job pivots + AI model prices + AI tokens + AI regulatory news into a comprehensive AI industry intelligence report.

Use this tool when:
- An AI-focused research agent needs a complete picture of the AI ecosystem in one call
- A VC agent wants to assess AI industry momentum across research, hiring, and markets
- You need to track AI adoption signals across multiple dimensions simultaneously
- A strategy agent is building an AI market thesis and needs comprehensive inputs

Returns: latest_arxiv_breakthroughs, github_trending_ai_repos, top_ai_hiring_companies, model_price_changes, ai_token_performance, regulatory_updates, ai_economy_momentum_score.

Example: runBundleAiEconomy({ focus: "agentic ai autonomous" }) → 3 breakthrough papers on agents, top hiring: Anthropic/OpenAI/Google, Claude price cut 15%.

Cost: $100 USDC per call.`,
    {
      focus: z.string().default("agentic ai autonomous").describe("Keywords describing the AI economy area to focus the bundle on (e.g. 'agentic ai autonomous', 'multimodal llm vision', 'ai safety alignment', 'open source models'). This shapes the research and news filtering across all sub-calls."),
    },
    { ...READ_ONLY, title: "Run AI Economy Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/ai-economy`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "runBundleSovereign",
    `Sovereign Intelligence — the most comprehensive bundle: ALL 56 endpoints combined into a single sovereign-grade intelligence report. Full macro + geopolitical crisis + company + crypto + hedge funds + AI economy.

Use this tool when:
- An agent needs the absolute maximum intelligence context in a single call
- A sovereign fund or family office agent is doing top-level portfolio allocation
- You need a complete world state snapshot for high-stakes decision making
- A war-room agent is preparing a comprehensive intelligence brief for leadership

Returns: complete macro environment (all major economies), geopolitical crisis scores, crypto market health, AI economy metrics, hedge fund flows, top company signals — fully synthesised with a global risk score and recommended positioning.

Cost: $500 USDC per call (vs $100+ if all endpoints called separately).`,
    {
      regions:   z.string().default("all").describe("Geopolitical regions to include in the sovereign intelligence sweep. Use 'all' for complete global coverage, or specify regions like 'middle-east,ukraine,taiwan' to focus the geopolitical section."),
      companies: z.array(z.string()).default([]).describe("Optional list of specific companies to include deep-dive analysis for in the sovereign bundle (e.g. ['nvidia', 'microsoft', 'tsmc']). Leave empty for market-wide company signals."),
    },
    { ...READ_ONLY, title: "Run Sovereign Bundle" },
    async (params) =>
      call(`${BASE()}/api/bundle/sovereign`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(params) })
  );

  server.tool(
    "runBundleGeopolitical",
    `Geopolitical War Room — the deepest geopolitical intelligence bundle: GDELT crisis monitoring + escalation scoring + oil/gold/USD/defence market impact modelling + OFAC sanctions alerts + Reddit/HackerNews viral signal processing. Built for agents that need to act on geopolitical events faster than the market.

Use this tool when:
- A macro trading agent needs to react to geopolitical events with precise market impact estimates
- A risk agent is stress-testing portfolio exposure to specific crisis scenarios
- You need real-time crisis intelligence combined with actionable hedging recommendations
- An agent is monitoring multiple conflict zones simultaneously for emerging risks

Returns: crisis_scores per region, escalation_trajectory (ESCALATING/STABLE/DE-ESCALATING), market_impact_estimates (oil/gold/USD/defence), OFAC_new_alerts, social_viral_signals (Reddit/HN sentiment), recommended_hedges, scenario_analysis.

Example: runBundleGeopolitical({ regions: "middle-east,ukraine", depth: "deep" }) → Middle East crisis 82/100 ESCALATING, oil +12% projected, gold +6%, short EUR hedge recommended.

Cost: $200 USDC per call.`,
    {
      regions: z.string().default("middle-east,ukraine,taiwan").describe("Comma-separated geopolitical regions to cover in the war room bundle. Supported: 'middle-east' (Iran/Israel/Gulf), 'ukraine' (Russia/NATO), 'taiwan' (China/US), 'korea' (DPRK), 'global' (all). Specify multiple regions for a multi-theatre view."),
      depth:   z.enum(["standard","deep"]).default("deep").describe("Analysis depth: 'standard' (fast overview — 30s response, key metrics) or 'deep' (full GDELT + social signal processing — 60-90s response, complete scenario modelling). Use 'deep' for critical decisions."),
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
          tier1:   { priceUSDC: 0.005, tools: 36, examples: ["getTradingSignal","getMacroData","getAiNews"] },
          tier2:   { priceUSDC: "5–25", tools: 12, examples: ["getB2bIntel","getCompanyProfile","getGeopoliticalCrisis"] },
          bundles: { priceUSDC: "0.50–500", tools: 8, examples: ["runBundleStarter","runBundleSovereign"] },
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
          text: "Omni Service Node is a pay-per-call data marketplace for AI agents. Call any tool directly — payment is handled automatically via x402 USDC on Base Mainnet. Tier 1 endpoints cost $0.005 each, Tier 2 cost $5–$25, and Bundles cost $0.50–$500. No API keys or subscriptions required. Start with getTradingSignal or getMarketSentiment for market data, getMacroData for economics, getGeopoliticalCrisis for geopolitical risk, or runBundleStarter for a full overview.",
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

MARKET SIGNALS ($0.005): getTradingSignal, getMarketSentiment, getMarketMovers, getFearIndex, getOptionsFlow, getInsiderTrades, getAnalystRatings, getEarnings, getIpoCalendar

MACRO & FX ($0.005): getMacroData, getFxRates, getEconomicCalendar, getCommodities, getEnergyPrices

CRYPTO & DEFI ($0.005): getOnchainData, getDefiYields, getStablecoins, getCryptoDerivatives, getTokenUnlocks, getNftMarket, getAiTokens, getVirtualsProtocol, getBittensor

INTELLIGENCE ($0.005): getAiNews, getArxivResearch, getGithubTrending, getModelPrices, getSpaceWeather, getEarthquakeMonitor, getShippingRates, getSemiconductorSupply

MACRO RISKS ($0.005): getMergerActivity, getPrivateEquity, getRealEstateMarket

SANCTIONS & COMPLIANCE ($0.005): screenSanctions, checkAiCompliance

TIER 2 DEEP INTEL ($5–$25): getB2bIntel, getGithubVelocity, getJobPivots, getSecFilings, getAiPatents, getCompanyProfile, getWhaleTracker, getFundingRounds, getCompetitorIntel, getHedgeFunds, getDaoGovernance, getGeopoliticalCrisis

BUNDLES ($0.50–$500): runBundleStarter, runBundleMarketIntel, runBundleCompanyDeep, runBundleCryptoAlpha, runBundleMacroGlobal, runBundleAiEconomy, runBundleSovereign, runBundleGeopolitical`,
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

      // Hook into transport to ensure SSE stream is properly closed with done event
      const originalSend = transport.send.bind(transport);
      let streamEnded = false;

      transport.send = async function(message, options) {
        try {
          return await originalSend(message, options);
        } finally {
          // Check if this was the final response - if so, close the stream gracefully
          if (!streamEnded && (message.result || message.error)) {
            streamEnded = true;
            // Give a small delay to ensure response fully queued, then signal completion
            setImmediate(() => {
              try {
                // Send SSE done event to signal stream closure to client
                res.write('event: done\n');
                res.write('data: {}\n\n');
                res.end();
              } catch (e) {
                // Response might already be sent, that's OK
              }
            });
          }
        }
      };

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
