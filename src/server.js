import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createPaymentMiddleware } from "./payment/basePayment.js";

// ── Tier 1 services — $0.005/call ─────────────────────────────────────────────
import { compliance }  from "./services/tier1/compliance.js";
import { sentiment }   from "./services/tier1/sentiment.js";
import { sanctions }   from "./services/tier1/sanctions.js";
import { signals }     from "./services/tier1/signals.js";
import { macro }       from "./services/tier1/macro.js";
import { news }        from "./services/tier1/news.js";
import { arxiv }       from "./services/tier1/arxiv.js";
import { onchain }     from "./services/tier1/onchain.js";

// ── Tier 2 services — $5.00/call ──────────────────────────────────────────────
import { intel }          from "./services/tier2/intel.js";
import { githubVelocity } from "./services/tier2/github.js";
import { jobPivots }      from "./services/tier2/jobs.js";
import { secFilings }     from "./services/tier2/filings.js";
import { patents }        from "./services/tier2/patents.js";
import { companyProfile } from "./services/tier2/companyProfile.js";

// ── Infrastructure ────────────────────────────────────────────────────────────
import { createMcpRouter }   from "./mcp/server.js";
import { startAcpRuntime }   from "./acp/handler.js";
import { startBountyHunter } from "./autonomous/bountyHunter.js";
import { startScaler }       from "./autonomous/scaler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "2mb" }));

// ── Request telemetry ─────────────────────────────────────────────────────────
const stats = { tier1: 0, tier2: 0, startedAt: Date.now(), revenue: 0 };

// ── CORS — open for all agents ─────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-PAYMENT,Authorization,X-PAYMENT-RESPONSE,Payment-Signature");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Base Mainnet USDC payments — real money, no CDP keys needed ───────────────
// Direct USDC transfer verification via public Base RPC (https://mainnet.base.org)
// Agent sends USDC → server verifies tx on-chain → data served
// No facilitator, no gas from server, no third-party dependencies
const NETWORK_NAME = "Base Mainnet";
const WALLET       = process.env.WALLET_ADDRESS;

const paymentRoutes = {
  // ── Tier 1 — $0.005 USDC ───────────────────────────────────────────────────
  "GET /api/v1/compliance":   { price: "$0.005" },
  "POST /api/v1/sanctions":   { price: "$0.005" },
  "GET /api/v1/sentiment":    { price: "$0.005" },
  "GET /api/v1/signals":      { price: "$0.005" },
  "GET /api/v1/macro":        { price: "$0.005" },
  "GET /api/v1/news":         { price: "$0.005" },
  "GET /api/v1/arxiv":        { price: "$0.005" },
  "GET /api/v1/onchain":      { price: "$0.005" },
  // ── Tier 2 — $5.00 USDC ────────────────────────────────────────────────────
  "POST /api/v2/intel":           { price: "$5.00" },
  "GET /api/v2/github-velocity":  { price: "$5.00" },
  "POST /api/v2/job-pivots":      { price: "$5.00" },
  "GET /api/v2/sec-filings":      { price: "$5.00" },
  "GET /api/v2/patents":          { price: "$5.00" },
  "POST /api/v2/company-profile": { price: "$5.00" },
};

app.use(createPaymentMiddleware(paymentRoutes, WALLET));

// ── Revenue tracking ──────────────────────────────────────────────────────────
app.use("/api/v1", (req, res, next) => { stats.tier1++; stats.revenue += 0.005; next(); });
app.use("/api/v2", (req, res, next) => { stats.tier2++; stats.revenue += 5.00;  next(); });

// ── TIER 1 — Fuel ($0.005/call) ───────────────────────────────────────────────
// GET /api/v1/compliance?company=OpenAI&system=GPT-5
app.get("/api/v1/compliance", compliance);

// GET /api/v1/sentiment?assets=BTC,VIRTUAL,GOLD
app.get("/api/v1/sentiment", sentiment);

// POST /api/v1/sanctions  { name: "Entity Name", country?: "US" }
app.post("/api/v1/sanctions", sanctions);

// GET /api/v1/signals?symbol=XAUUSD&tf=1h
app.get("/api/v1/signals", signals);

// GET /api/v1/macro?countries=US,CN,EU
app.get("/api/v1/macro", macro);

// GET /api/v1/news?category=ai&hours=24&limit=30
app.get("/api/v1/news", news);

// GET /api/v1/arxiv?category=all&days=3&limit=20&query=agentic
app.get("/api/v1/arxiv", arxiv);

// GET /api/v1/onchain?chain=all
app.get("/api/v1/onchain", onchain);

// ── TIER 2 — Premium ($5.00/call) ─────────────────────────────────────────────
// POST /api/v2/intel  { companies: ["Microsoft","Salesforce"] }
app.post("/api/v2/intel", intel);

// GET /api/v2/github-velocity?org=microsoft&days=30
app.get("/api/v2/github-velocity", githubVelocity);

// POST /api/v2/job-pivots  { roles: ["Agentic Security Lead"], companies?: [] }
app.post("/api/v2/job-pivots", jobPivots);

// GET /api/v2/sec-filings?query=agentic+AI&days=7&forms=8-K
app.get("/api/v2/sec-filings", secFilings);

// GET /api/v2/patents?query=autonomous+agent&days=90&companies=Microsoft,Google
app.get("/api/v2/patents", patents);

// POST /api/v2/company-profile  { company: "Salesforce", github?: "salesforce", days?: 30 }
app.post("/api/v2/company-profile", companyProfile);

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
    tier1:     { requests: stats.tier1, rph: Math.round(stats.tier1 / hrs) },
    tier2:     { requests: stats.tier2, rph: Math.round(stats.tier2 / hrs) },
    revenue:   { usdc: stats.revenue.toFixed(3), usd: `$${stats.revenue.toFixed(2)}` },
    wallet:    WALLET,
    network:   NETWORK_NAME,
    endpoints: { tier1: 8, tier2: 6, total: 14 },
    timestamp: new Date().toISOString(),
  });
});

app.get("/stats", (_req, res) => {
  res.json({
    node:    "omni-service-node",
    version: "2.0.0",
    tiers: {
      fuel: {
        endpoint: "/api/v1",
        price:    "$0.005 USDC",
        network:  NETWORK_NAME,
        services: [
          { id: "compliance",  method: "GET",  description: "EU AI Act risk classification + CISA alerts + AI incident history" },
          { id: "sentiment",   method: "GET",  description: "Crypto/AI fear-greed + CoinGecko market data + trending tokens" },
          { id: "sanctions",   method: "POST", description: "OFAC/EU/UN/UK sanctions screening via OpenSanctions" },
          { id: "signals",     method: "GET",  description: "Gold/BTC/FX directional signals — BUY/SELL/HOLD + confidence" },
          { id: "macro",       method: "GET",  description: "Global macro: Fed rate, CPI, M2, GDP, yield curve, FX" },
          { id: "news",        method: "GET",  description: "Real-time AI/tech/market news — HackerNews + Reddit + NewsAPI" },
          { id: "arxiv",       method: "GET",  description: "Latest AI/ML research papers from ArXiv — breakthroughs + trending" },
          { id: "onchain",     method: "GET",  description: "BTC/ETH/DeFi on-chain data — fees, gas, TVL, top yields" },
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
    },
    payment:   { protocol: "direct-transfer", network: NETWORK_NAME, networkId: "eip155:8453", token: "USDC" },
    discovery: { agentCard: "/.well-known/agent-card.json", mcp: "/mcp", llms: "/llms.txt", manifest: "/mcp/manifest" },
    acp:       { marketplace: "https://app.virtuals.io/research/agent-commerce-protocol" },
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`\n OMNI SERVICE NODE v2.0`);
  console.log(`   Port     : ${PORT}`);
  console.log(`   Wallet   : ${process.env.WALLET_ADDRESS}`);
  console.log(`   Network  : ${NETWORK_NAME} (eip155:8453)`);
  console.log(`   Tier 1   : /api/v1/* — $0.005 USDC  [8 endpoints]`);
  console.log(`   Tier 2   : /api/v2/* — $5.00  USDC  [6 endpoints]`);
  console.log(`   MCP      : /mcp`);
  console.log(`   Card     : /.well-known/agent-card.json\n`);

  console.log(`[payment] Base Mainnet USDC — real money active`);
  console.log(`[payment] Wallet: ${WALLET}`);
  console.log(`[payment] RPC: https://mainnet.base.org\n`);

  // ACP seller runtime
  if (process.env.AGENT_WALLET_PRIVATE_KEY) {
    await startAcpRuntime().catch(e => console.error("[ACP] Runtime error:", e.message));
  } else {
    console.warn("[ACP] AGENT_WALLET_PRIVATE_KEY not set — ACP disabled");
  }

  startBountyHunter();
  startScaler(stats);
});

export { stats };
