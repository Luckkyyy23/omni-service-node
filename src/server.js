import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createPaymentMiddleware } from "./payment/basePayment.js";

// ── Tier 1 services — $0.005/call ─────────────────────────────────────────────
import { compliance }       from "./services/tier1/compliance.js";
import { sentiment }        from "./services/tier1/sentiment.js";
import { sanctions }        from "./services/tier1/sanctions.js";
import { signals }          from "./services/tier1/signals.js";
import { macro }            from "./services/tier1/macro.js";
import { news }             from "./services/tier1/news.js";
import { arxiv }            from "./services/tier1/arxiv.js";
import { onchain }          from "./services/tier1/onchain.js";
import { earnings }         from "./services/tier1/earnings.js";
import { commodities }      from "./services/tier1/commodities.js";
import { economicCalendar } from "./services/tier1/economic-calendar.js";
import { insiderTrades }    from "./services/tier1/insider-trades.js";
import { optionsFlow }      from "./services/tier1/options-flow.js";
import { marketMovers }     from "./services/tier1/market-movers.js";
import { ipoCalendar }      from "./services/tier1/ipo-calendar.js";
import { analystRatings }   from "./services/tier1/analyst-ratings.js";
import { fearIndex }        from "./services/tier1/fear-index.js";
import { fxRates }          from "./services/tier1/fx-rates.js";
import { nftMarket }        from "./services/tier1/nft-market.js";
import { defiYields }       from "./services/tier1/defi-yields.js";
import { tokenUnlocks }     from "./services/tier1/token-unlocks.js";
import { cryptoDerivatives } from "./services/tier1/crypto-derivatives.js";
import { stablecoinMonitor } from "./services/tier1/stablecoin-monitor.js";
import { virtualsProtocol } from "./services/tier1/virtuals-protocol.js";
import { aiTokens }         from "./services/tier1/ai-tokens.js";
import { bittensor }        from "./services/tier1/bittensor.js";
import { modelPrices }      from "./services/tier1/model-prices.js";
import { spaceWeather }       from "./services/tier1/space-weather.js";
import { earthquakeMonitor }  from "./services/tier1/earthquake-monitor.js";
import { energyPrices }       from "./services/tier1/energy-prices.js";
import { shippingRates }      from "./services/tier1/shipping-rates.js";
import { semiconductorSupply } from "./services/tier1/semiconductor-supply.js";
import { mergerActivity }     from "./services/tier1/merger-activity.js";
import { privateEquity }      from "./services/tier1/private-equity.js";
import { realEstateMarket }   from "./services/tier1/real-estate-market.js";
import { githubTrending }     from "./services/tier1/github-trending.js";

// ── Tier 2 services — $5.00/call ──────────────────────────────────────────────
import { intel }           from "./services/tier2/intel.js";
import { githubVelocity }  from "./services/tier2/github.js";
import { jobPivots }       from "./services/tier2/jobs.js";
import { secFilings }      from "./services/tier2/filings.js";
import { patents }         from "./services/tier2/patents.js";
import { companyProfile }  from "./services/tier2/companyProfile.js";
import { whaleTracker }    from "./services/tier2/whale-tracker.js";
import { fundingRounds }   from "./services/tier2/funding-rounds.js";
import { competitorIntel }    from "./services/tier2/competitor-intel.js";
import { hedgeFunds }         from "./services/tier2/hedge-funds.js";
import { daoGovernance }      from "./services/tier2/dao-governance.js";
import { geopoliticalCrisis } from "./services/tier2/geopolitical-crisis.js";

// ── Infrastructure ────────────────────────────────────────────────────────────
import { createMcpRouter }   from "./mcp/server.js";
import { startAcpRuntime }   from "./acp/handler.js";
import { startBountyHunter } from "./autonomous/bountyHunter.js";
import { startScaler }       from "./autonomous/scaler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "2mb" }));

// ── Request telemetry ─────────────────────────────────────────────────────────
const stats = { tier1: 0, tier2: 0, bundle: 0, startedAt: Date.now(), revenue: 0 };

// ── CORS — open for all agents ─────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-PAYMENT,Authorization,X-PAYMENT-RESPONSE,Payment-Signature");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Base Mainnet USDC payments — real money ───────────────────────────────────
const NETWORK_NAME = "Base Mainnet";
const WALLET       = process.env.WALLET_ADDRESS;

const paymentRoutes = {
  // ── Tier 1 — $0.005 USDC ───────────────────────────────────────────────────
  "GET /api/v1/compliance":         { price: "$0.005" },
  "POST /api/v1/sanctions":         { price: "$0.005" },
  "GET /api/v1/sentiment":          { price: "$0.005" },
  "GET /api/v1/signals":            { price: "$0.005" },
  "GET /api/v1/macro":              { price: "$0.005" },
  "GET /api/v1/news":               { price: "$0.005" },
  "GET /api/v1/arxiv":              { price: "$0.005" },
  "GET /api/v1/onchain":            { price: "$0.005" },
  "GET /api/v1/earnings":           { price: "$0.005" },
  "GET /api/v1/commodities":        { price: "$0.005" },
  "GET /api/v1/economic-calendar":  { price: "$0.005" },
  "GET /api/v1/insider-trades":     { price: "$0.005" },
  "GET /api/v1/options-flow":       { price: "$0.005" },
  "GET /api/v1/market-movers":      { price: "$0.005" },
  "GET /api/v1/ipo-calendar":       { price: "$0.005" },
  "GET /api/v1/analyst-ratings":    { price: "$0.005" },
  "GET /api/v1/fear-index":         { price: "$0.005" },
  "GET /api/v1/fx-rates":           { price: "$0.005" },
  "GET /api/v1/nft-market":         { price: "$0.005" },
  "GET /api/v1/defi-yields":        { price: "$0.005" },
  "GET /api/v1/token-unlocks":      { price: "$0.005" },
  "GET /api/v1/crypto-derivatives": { price: "$0.005" },
  "GET /api/v1/stablecoins":        { price: "$0.005" },
  "GET /api/v1/virtuals-protocol":  { price: "$0.005" },
  "GET /api/v1/ai-tokens":          { price: "$0.005" },
  "GET /api/v1/bittensor":          { price: "$0.005" },
  "GET /api/v1/model-prices":       { price: "$0.005" },
  "GET /api/v1/space-weather":      { price: "$0.005" },
  "GET /api/v1/earthquake-monitor": { price: "$0.005" },
  // ── Tier 2 — $5.00 USDC ────────────────────────────────────────────────────
  "POST /api/v2/intel":             { price: "$5.00" },
  "GET /api/v2/github-velocity":    { price: "$5.00" },
  "POST /api/v2/job-pivots":        { price: "$5.00" },
  "GET /api/v2/sec-filings":        { price: "$5.00" },
  "GET /api/v2/patents":            { price: "$5.00" },
  "POST /api/v2/company-profile":   { price: "$5.00" },
  "GET /api/v2/whale-tracker":      { price: "$5.00" },
  "GET /api/v2/funding-rounds":     { price: "$5.00" },
  "POST /api/v2/competitor-intel":  { price: "$5.00" },
  "GET /api/v2/hedge-funds":        { price: "$5.00" },
  "GET /api/v2/dao-governance":     { price: "$5.00" },
  "GET /api/v2/geopolitical-crisis": { price: "$25.00" },
  // ── Geopolitical War Room Bundle — $200 ───────────────────────────────────
  "POST /api/bundle/geopolitical":  { price: "$200.00" },
  // ── Tier 1 new batch ───────────────────────────────────────────────────────
  "GET /api/v1/energy-prices":      { price: "$0.005" },
  "GET /api/v1/shipping-rates":     { price: "$0.005" },
  "GET /api/v1/semiconductor-supply": { price: "$0.005" },
  "GET /api/v1/merger-activity":    { price: "$0.005" },
  "GET /api/v1/private-equity":     { price: "$0.005" },
  "GET /api/v1/real-estate-market": { price: "$0.005" },
  "GET /api/v1/github-trending":    { price: "$0.005" },
  // ── Bundles — $0.50–$500 USDC ──────────────────────────────────────────────
  "POST /api/bundle/starter":       { price: "$0.50" },
  "POST /api/bundle/market-intel":  { price: "$25.00" },
  "POST /api/bundle/company-deep":  { price: "$50.00" },
  "POST /api/bundle/crypto-alpha":  { price: "$25.00" },
  "POST /api/bundle/macro-global":  { price: "$50.00" },
  "POST /api/bundle/ai-economy":    { price: "$100.00" },
  "POST /api/bundle/sovereign":     { price: "$500.00" },
};

app.use(createPaymentMiddleware(paymentRoutes, WALLET));

// ── Revenue tracking ──────────────────────────────────────────────────────────
app.use("/api/v1",     (req, res, next) => { stats.tier1++;  stats.revenue += 0.005;   next(); });
app.use("/api/v2",     (req, res, next) => { stats.tier2++;  stats.revenue += 5.00;    next(); });
app.use("/api/bundle", (req, res, next) => { stats.bundle++; next(); }); // revenue tracked per bundle in handler

// ── TIER 1 — Fuel ($0.005/call) ───────────────────────────────────────────────
app.get("/api/v1/compliance",         compliance);
app.get("/api/v1/sentiment",          sentiment);
app.post("/api/v1/sanctions",         sanctions);
app.get("/api/v1/signals",            signals);
app.get("/api/v1/macro",              macro);
app.get("/api/v1/news",               news);
app.get("/api/v1/arxiv",              arxiv);
app.get("/api/v1/onchain",            onchain);
app.get("/api/v1/earnings",           earnings);
app.get("/api/v1/commodities",        commodities);
app.get("/api/v1/economic-calendar",  economicCalendar);
app.get("/api/v1/insider-trades",     insiderTrades);
app.get("/api/v1/options-flow",       optionsFlow);
app.get("/api/v1/market-movers",      marketMovers);
app.get("/api/v1/ipo-calendar",       ipoCalendar);
app.get("/api/v1/analyst-ratings",    analystRatings);
app.get("/api/v1/fear-index",         fearIndex);
app.get("/api/v1/fx-rates",           fxRates);
app.get("/api/v1/nft-market",         nftMarket);
app.get("/api/v1/defi-yields",        defiYields);
app.get("/api/v1/token-unlocks",      tokenUnlocks);
app.get("/api/v1/crypto-derivatives", cryptoDerivatives);
app.get("/api/v1/stablecoins",        stablecoinMonitor);
app.get("/api/v1/virtuals-protocol",  virtualsProtocol);
app.get("/api/v1/ai-tokens",          aiTokens);
app.get("/api/v1/bittensor",          bittensor);
app.get("/api/v1/model-prices",       modelPrices);
app.get("/api/v1/space-weather",      spaceWeather);
app.get("/api/v1/earthquake-monitor",   earthquakeMonitor);
app.get("/api/v1/energy-prices",        energyPrices);
app.get("/api/v1/shipping-rates",       shippingRates);
app.get("/api/v1/semiconductor-supply", semiconductorSupply);
app.get("/api/v1/merger-activity",      mergerActivity);
app.get("/api/v1/private-equity",       privateEquity);
app.get("/api/v1/real-estate-market",   realEstateMarket);
app.get("/api/v1/github-trending",      githubTrending);

// ── TIER 2 — Premium ($5.00/call) ─────────────────────────────────────────────
app.post("/api/v2/intel",             intel);
app.get("/api/v2/github-velocity",    githubVelocity);
app.post("/api/v2/job-pivots",        jobPivots);
app.get("/api/v2/sec-filings",        secFilings);
app.get("/api/v2/patents",            patents);
app.post("/api/v2/company-profile",   companyProfile);
app.get("/api/v2/whale-tracker",      whaleTracker);
app.get("/api/v2/funding-rounds",     fundingRounds);
app.post("/api/v2/competitor-intel",    competitorIntel);
app.get("/api/v2/hedge-funds",          hedgeFunds);
app.get("/api/v2/dao-governance",       daoGovernance);
app.get("/api/v2/geopolitical-crisis",  geopoliticalCrisis);

// ── BUNDLES — handled after agents complete building bundle files ──────────────
// Bundle routes are registered below — handlers loaded dynamically
async function loadBundle(file) {
  try {
    return (await import(`./services/bundles/${file}`));
  } catch { return null; }
}

app.post("/api/bundle/starter",      async (req, res) => { const m = await loadBundle("bundle-starter.js");      m ? m.bundleStarter(req, res)      : res.status(503).json({ error: "Bundle loading" }); });
app.post("/api/bundle/market-intel", async (req, res) => { const m = await loadBundle("bundle-market-intel.js"); m ? m.bundleMarketIntel(req, res)   : res.status(503).json({ error: "Bundle loading" }); });
app.post("/api/bundle/company-deep", async (req, res) => { const m = await loadBundle("bundle-company-deep.js"); m ? m.bundleCompanyDeep(req, res)   : res.status(503).json({ error: "Bundle loading" }); });
app.post("/api/bundle/crypto-alpha", async (req, res) => { const m = await loadBundle("bundle-crypto-alpha.js"); m ? m.bundleCryptoAlpha(req, res)   : res.status(503).json({ error: "Bundle loading" }); });
app.post("/api/bundle/macro-global", async (req, res) => { const m = await loadBundle("bundle-macro-global.js"); m ? m.bundleMacroGlobal(req, res)   : res.status(503).json({ error: "Bundle loading" }); });
app.post("/api/bundle/ai-economy",   async (req, res) => { const m = await loadBundle("bundle-ai-economy.js");   m ? m.bundleAiEconomy(req, res)     : res.status(503).json({ error: "Bundle loading" }); });
app.post("/api/bundle/sovereign",    async (req, res) => { const m = await loadBundle("bundle-sovereign.js");    m ? m.bundleSovereign(req, res)     : res.status(503).json({ error: "Bundle loading" }); });
app.post("/api/bundle/geopolitical", async (req, res) => { const m = await loadBundle("bundle-geopolitical.js"); m ? m.bundleGeopolitical(req, res)  : res.status(503).json({ error: "Bundle loading" }); });

// ── MCP Server (Model Context Protocol — HTTP transport) ──────────────────────
app.use("/mcp", createMcpRouter());

// ── Static public files + discovery ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, "../public")));

app.get("/health", (_req, res) => {
  const uptime = Math.round((Date.now() - stats.startedAt) / 1000);
  const hrs    = uptime / 3600 || 1;
  res.json({
    status:    "ok",
    uptime:    `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    tier1:     { requests: stats.tier1,  rph: Math.round(stats.tier1  / hrs) },
    tier2:     { requests: stats.tier2,  rph: Math.round(stats.tier2  / hrs) },
    bundles:   { requests: stats.bundle, rph: Math.round(stats.bundle / hrs) },
    revenue:   { usdc: stats.revenue.toFixed(3), usd: `$${stats.revenue.toFixed(2)}` },
    wallet:    WALLET,
    network:   NETWORK_NAME,
    endpoints: { tier1: 36, tier2: 12, bundles: 8, total: 56 },
    timestamp: new Date().toISOString(),
  });
});

app.get("/stats", (_req, res) => {
  res.json({
    node:    "omni-service-node",
    version: "3.0.0",
    tiers: {
      fuel: {
        endpoint: "/api/v1",
        price:    "$0.005 USDC",
        network:  NETWORK_NAME,
        services: [
          { id: "compliance",         method: "GET",  description: "EU AI Act risk classification + CISA alerts + AI incident history" },
          { id: "sentiment",          method: "GET",  description: "Crypto/AI fear-greed + CoinGecko market data + trending tokens" },
          { id: "sanctions",          method: "POST", description: "OFAC/EU/UN/UK sanctions screening via OpenSanctions" },
          { id: "signals",            method: "GET",  description: "Gold/BTC/FX directional signals — BUY/SELL/HOLD + confidence" },
          { id: "macro",              method: "GET",  description: "Global macro: Fed rate, CPI, M2, GDP, yield curve, FX" },
          { id: "news",               method: "GET",  description: "Real-time AI/tech/market news — HackerNews + Reddit + NewsAPI" },
          { id: "arxiv",              method: "GET",  description: "Latest AI/ML research papers from ArXiv — breakthroughs + trending" },
          { id: "onchain",            method: "GET",  description: "BTC/ETH/DeFi on-chain data — fees, gas, TVL, top yields" },
          { id: "earnings",           method: "GET",  description: "Upcoming + recent earnings — EPS, revenue, beat/miss signals" },
          { id: "commodities",        method: "GET",  description: "Gold, silver, oil, wheat, corn, copper — spot prices + trends" },
          { id: "economic-calendar",  method: "GET",  description: "High-impact economic events — CPI, NFP, FOMC, GDP releases" },
          { id: "insider-trades",     method: "GET",  description: "SEC Form 4 insider buys/sells — bullish/bearish signal" },
          { id: "options-flow",       method: "GET",  description: "Unusual options activity — volume/OI spikes on SPY, QQQ, NVDA" },
          { id: "market-movers",      method: "GET",  description: "Top gainers, losers, most active stocks with volume surge" },
          { id: "ipo-calendar",       method: "GET",  description: "Upcoming + recent IPOs — size, pricing, market cap" },
          { id: "analyst-ratings",    method: "GET",  description: "Upgrades/downgrades on AI/tech stocks — firm + price target" },
          { id: "fear-index",         method: "GET",  description: "VIX + Fear & Greed index — market risk temperature" },
          { id: "fx-rates",           method: "GET",  description: "Live FX rates — major, minor, crypto vs USD" },
          { id: "nft-market",         method: "GET",  description: "NFT market conditions — floor prices, volume, sentiment" },
          { id: "defi-yields",        method: "GET",  description: "DeFi yield opportunities across major protocols" },
          { id: "token-unlocks",      method: "GET",  description: "Upcoming token unlocks — supply pressure signals" },
          { id: "crypto-derivatives", method: "GET",  description: "Crypto futures + options — funding rates, open interest" },
          { id: "stablecoins",        method: "GET",  description: "Stablecoin health — peg deviation, supply, depeg risk" },
          { id: "virtuals-protocol",  method: "GET",  description: "Virtuals Protocol AI agents — prices, market cap, volume" },
          { id: "ai-tokens",          method: "GET",  description: "AI/ML crypto tokens — sector performance + trending" },
          { id: "bittensor",          method: "GET",  description: "Bittensor TAO subnet activity — validator rewards, subnets" },
          { id: "model-prices",       method: "GET",  description: "AI model pricing comparison — cost per 1M tokens across providers" },
          { id: "space-weather",      method: "GET",  description: "NOAA KP index, solar flux, geomagnetic storm alerts" },
          { id: "earthquake-monitor", method: "GET",  description: "USGS significant earthquakes — magnitude, region, risk" },
        ],
      },
      premium: {
        endpoint: "/api/v2",
        price:    "$5.00 USDC",
        network:  NETWORK_NAME,
        services: [
          { id: "intel",           method: "POST", description: "B2B AI pivot intelligence — Golden Lead packets with buy scores" },
          { id: "github-velocity", method: "GET",  description: "Fortune 500 GitHub velocity + AI repo detection + topic pivots" },
          { id: "job-pivots",      method: "POST", description: "Companies hiring agentic/AI roles — buyer intent signal" },
          { id: "sec-filings",     method: "GET",  description: "Real-time 8-K/10-K filings mentioning AI/agentic pivots" },
          { id: "patents",         method: "GET",  description: "USPTO AI patent filings — who is building what" },
          { id: "company-profile", method: "POST", description: "Full company dossier: SEC + GitHub + Jobs + Patents + Sentiment" },
        ],
      },
      bundles: {
        endpoint: "/api/bundle",
        description: "Pre-packaged multi-source intelligence packets — best value for high-volume agents",
        packages: [
          { id: "starter",      method: "POST", price: "$0.50",  description: "AI Agent Starter Pack — compliance + sentiment + signals + macro + news" },
          { id: "market-intel", method: "POST", price: "$25.00", description: "Market Intelligence — signals + onchain + macro + options flow + insider trades + earnings" },
          { id: "company-deep", method: "POST", price: "$50.00", description: "Company Deep Dive — profile + intel + competitor + hedge funds + analyst ratings + filings" },
          { id: "crypto-alpha", method: "POST", price: "$25.00", description: "Crypto Alpha — onchain + whale + DeFi yields + AI tokens + derivatives + stablecoins" },
          { id: "macro-global", method: "POST", price: "$50.00", description: "Global Macro — macro + bonds + FX + interest rates + inflation + consumer + labor" },
          { id: "ai-economy",   method: "POST", price: "$100.00", description: "AI Economy Intelligence — arxiv + github + jobs + model prices + AI tokens + regulatory" },
          { id: "sovereign",    method: "POST", price: "$500.00", description: "Sovereign Intelligence — ALL endpoints + company dossier + geopolitical + hedge funds" },
        ],
      },
    },
    payment:   { protocol: "direct-transfer", network: NETWORK_NAME, networkId: "eip155:8453", token: "USDC" },
    discovery: { agentCard: "/.well-known/agent-card.json", mcp: "/mcp", llms: "/llms.txt", manifest: "/mcp/manifest" },
    acp:       { marketplace: "https://app.virtuals.io/research/agent-commerce-protocol" },
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`\n OMNI SERVICE NODE v3.0`);
  console.log(`   Port     : ${PORT}`);
  console.log(`   Wallet   : ${process.env.WALLET_ADDRESS}`);
  console.log(`   Network  : ${NETWORK_NAME} (eip155:8453)`);
  console.log(`   Tier 1   : /api/v1/* — $0.005 USDC  [36 endpoints]`);
  console.log(`   Tier 2   : /api/v2/* — $5.00–$25   [12 endpoints]`);
  console.log(`   Bundles  : /api/bundle/* — $0.50–$500 [8 packages]`);
  console.log(`   MCP      : /mcp`);
  console.log(`   Card     : /.well-known/agent-card.json\n`);

  console.log(`[payment] Base Mainnet USDC — real money active`);
  console.log(`[payment] Wallet: ${WALLET}`);
  console.log(`[payment] RPC: https://mainnet.base.org\n`);

  if (process.env.AGENT_WALLET_PRIVATE_KEY) {
    await startAcpRuntime().catch(e => console.error("[ACP] Runtime error:", e.message));
  } else {
    console.warn("[ACP] AGENT_WALLET_PRIVATE_KEY not set — ACP disabled");
  }

  startBountyHunter();
  startScaler(stats);
});

export { stats };
