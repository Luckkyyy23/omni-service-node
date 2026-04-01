/**
 * Registration script — submit this node to all agent discovery surfaces
 * Run: node src/register.js
 *
 * Registers on:
 *   1. x402scan.com (x402 payment discovery)
 *   2. Smithery (MCP server registry)
 *   3. Official MCP Registry (modelcontextprotocol.io)
 *   4. ACP Marketplace (Virtuals Protocol)
 */

import "dotenv/config";
import axios from "axios";

const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;

// ── 1. x402scan.com registration ─────────────────────────────────────────────
async function registerX402scan() {
  console.log("\n[x402scan] Registering on x402scan.com...");
  try {
    // x402scan validates that your URL returns a valid 402 response
    const { data } = await axios.post(
      "https://www.x402scan.com/api/register",
      {
        url:         `${PUBLIC_URL}/api/v1/compliance`,
        name:        "Omni Service Node",
        description: "EU AI compliance, sanctions, market signals — $0.005 USDC on Base",
        category:    "data",
        contact:     process.env.CONTACT_EMAIL || "",
      },
      { timeout: 15000 }
    );
    console.log("[x402scan] ✅ Registered:", data);
  } catch (e) {
    console.warn("[x402scan] Registration failed (may need manual submission at https://www.x402scan.com/resources/register):", e.message);
    console.log("[x402scan] Manual URL: https://www.x402scan.com/resources/register");
  }
}

// ── 2. Check endpoints are live ───────────────────────────────────────────────
async function verifyEndpoints() {
  console.log("\n[verify] Checking live endpoints...");
  const endpoints = [
    { path: "/health", method: "GET" },
    { path: "/stats", method: "GET" },
    { path: "/.well-known/agent-card.json", method: "GET" },
    { path: "/mcp/manifest", method: "GET" },
    { path: "/llms.txt", method: "GET" },
  ];
  for (const ep of endpoints) {
    try {
      const r = await axios({ method: ep.method, url: `${PUBLIC_URL}${ep.path}`, timeout: 5000 });
      console.log(`[verify] ✅ ${ep.method} ${ep.path} — ${r.status}`);
    } catch (e) {
      console.error(`[verify] ❌ ${ep.method} ${ep.path} — ${e.message}`);
    }
  }
}

// ── 3. Print manual registration steps ───────────────────────────────────────
function printManualSteps() {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MANUAL REGISTRATION STEPS (do these once after deploying to prod)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. SMITHERY (biggest MCP discovery surface)
   npm install -g @smithery/cli
   smithery mcp publish ${PUBLIC_URL} -n omni-service/omni-service-node

2. OFFICIAL MCP REGISTRY (Claude Desktop, VS Code, Cursor)
   npm install -g mcp-publisher
   mcp-publisher publish --file mcp-server.json

3. x402scan.com (x402 payment discovery)
   Submit URL at: https://www.x402scan.com/resources/register
   URL to submit: ${PUBLIC_URL}/api/v1/compliance

4. ACP VIRTUALS MARKETPLACE
   Visit: https://app.virtuals.io
   Connect wallet: ${process.env.WALLET_ADDRESS}
   Navigate to ACP → New Seller → Import from acp/handler.js offerings

5. AWESOME-MCP-SERVERS (GitHub PR)
   Fork: https://github.com/punkpeye/awesome-mcp-servers
   Add entry with URL: ${PUBLIC_URL}

6. PUBLIC URL DEPLOYMENT
   Your current PUBLIC_URL: ${PUBLIC_URL}
   Deploy to Railway/Render/Fly.io and update PUBLIC_URL in .env
   Then re-run: node src/register.js

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PAYMENT TRACKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Wallet:   ${process.env.WALLET_ADDRESS}
  Network:  Base Mainnet
  Token:    USDC
  Track:    https://basescan.org/address/${process.env.WALLET_ADDRESS}
  x402:     https://www.x402scan.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

// ── Run ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔥 OMNI SERVICE NODE — REGISTRATION");
  console.log(`   Public URL: ${PUBLIC_URL}`);
  console.log(`   Wallet:     ${process.env.WALLET_ADDRESS}`);

  await verifyEndpoints();
  await registerX402scan();
  printManualSteps();
}

main().catch(console.error);
