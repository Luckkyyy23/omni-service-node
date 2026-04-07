/**
 * Autonomous Bounty Hunter
 * Scans ACP marketplace for $50+ bounties that match our capabilities
 * Auto-bids and fulfills matching jobs without human intervention
 *
 * Runs every 5 minutes via cron
 */

import cron from "node-cron";
import axios from "axios";
import AcpClient, { AcpContractClientV2 } from "@virtuals-protocol/acp-node";

const ACP_MARKETPLACE = "https://app.virtuals.io/research/agent-commerce-protocol";

// Our capabilities — what we can actually fulfill
const OUR_CAPABILITIES = [
  "compliance", "regulation", "eu ai act", "sanctions", "ofac",
  "sentiment", "market", "signal", "trading", "gold", "bitcoin", "btc",
  "sec", "filing", "edgar", "intelligence", "b2b", "sales",
  "github", "repository", "velocity", "job", "hiring",
];

// Match a bounty title/description against our capabilities
function canFulfill(title = "", description = "") {
  const text = `${title} ${description}`.toLowerCase();
  return OUR_CAPABILITIES.some(cap => text.includes(cap));
}

// Fulfill a bounty using our existing services
async function fulfillBounty(bounty) {
  const base = `http://localhost:${process.env.PORT || 3000}`;
  const text = `${bounty.title} ${bounty.description}`.toLowerCase();

  try {
    // Route to appropriate service based on bounty content
    if (text.includes("compliance") || text.includes("regulation") || text.includes("ai act")) {
      const r = await fetch(`${base}/api/v1/compliance?company=${encodeURIComponent(bounty.company || "")}&description=${encodeURIComponent(bounty.description || "")}`);
      return r.json();
    }
    if (text.includes("signal") || text.includes("trading") || text.includes("gold") || text.includes("market")) {
      const r = await fetch(`${base}/api/v1/signals?symbol=XAUUSD&tf=1h`);
      return r.json();
    }
    if (text.includes("sentiment")) {
      const r = await fetch(`${base}/api/v1/sentiment?assets=BTC,VIRTUAL,GOLD`);
      return r.json();
    }
    if (text.includes("sec") || text.includes("filing") || text.includes("edgar")) {
      const r = await fetch(`${base}/api/v2/sec-filings?days=7`);
      return r.json();
    }
    if (text.includes("github") || text.includes("repo") || text.includes("velocity")) {
      const org = bounty.company?.toLowerCase().replace(/[^a-z0-9-]/g, "") || "microsoft";
      const r = await fetch(`${base}/api/v2/github-velocity?org=${org}`);
      return r.json();
    }
    if (text.includes("intel") || text.includes("b2b") || text.includes("lead")) {
      const r = await fetch(`${base}/api/v2/intel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies: [bounty.company || "salesforce"] }),
      });
      return r.json();
    }
    // Generic: return our capabilities summary
    const r = await fetch(`${base}/stats`);
    return r.json();
  } catch (e) {
    return { error: e.message };
  }
}

// Fetch bounties from ACP marketplace via API
async function scrapeBounties() {
  try {
    const res = await axios.get("https://app.virtuals.io/api/acp/jobs", {
      timeout: 10000,
      headers: { "User-Agent": "OmniServiceBot/1.0" },
    });
    const jobs = Array.isArray(res.data) ? res.data : (res.data?.jobs || res.data?.data || []);
    return jobs.map(j => ({
      title:       j.title || j.name || "",
      price:       j.reward || j.budget || j.price || "",
      link:        j.url || j.link || "",
      description: j.description || j.details || "",
      jobId:       j.id || j.jobId || "",
      company:     j.company || j.employer || "",
    }));
  } catch (e) {
    // API not available — silent fail, no browser needed
    return [];
  }
}

// Parse dollar amount from string
function parsePriceUsd(priceStr = "") {
  const match = String(priceStr).replace(/,/g, "").match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

// Build an AcpClient instance for submitting bids (cached)
let _acpClient = null;
async function getAcpClient() {
  if (_acpClient) return _acpClient;

  const privateKey = process.env.AGENT_WALLET_PRIVATE_KEY;
  const agentWalletAddress = process.env.AGENT_WALLET_ADDRESS || process.env.WALLET_ADDRESS;
  if (!privateKey || !agentWalletAddress) return null;

  try {
    const contractClient = await AcpContractClientV2.build(
      privateKey,
      0, // sessionEntityKeyId
      agentWalletAddress,
    );
    _acpClient = new AcpClient({
      acpContractClient: contractClient,
      skipSocketConnection: true, // bounty hunter only needs REST, not WebSocket
    });
    await _acpClient.init(true); // skipSocketConnection = true
    return _acpClient;
  } catch (e) {
    console.error("[BOUNTY] Failed to build AcpClient:", e.message);
    return null;
  }
}

// Submit a bid/deliverable for a job via ACP SDK
async function submitBid(bounty, result) {
  if (!process.env.AGENT_WALLET_PRIVATE_KEY) return false;
  try {
    const client = await getAcpClient();
    if (!client) return false;

    // Try to get the job by ID and deliver our result
    const jobId = typeof bounty.jobId === "number" ? bounty.jobId : parseInt(bounty.jobId, 10);
    if (isNaN(jobId)) {
      console.warn("[BOUNTY] Invalid jobId — cannot submit via ACP SDK");
      return false;
    }

    const job = await client.getJobById(jobId);
    if (!job) {
      console.warn(`[BOUNTY] Job #${jobId} not found on-chain`);
      return false;
    }

    // Accept then deliver
    await job.accept("OmniServiceNode autonomous bounty fulfillment");
    const deliverable = typeof result === "string" ? result : result;
    await job.deliver(deliverable);
    console.log(`[BOUNTY] Delivered result for job #${jobId}`);
    return true;
  } catch (e) {
    console.error("[BOUNTY] Bid submission failed:", e.message);
    return false;
  }
}

// Log to bounty ledger
const BOUNTY_LOG = [];

// ── Main bounty hunter loop ───────────────────────────────────────────────────
export function startBountyHunter() {
  console.log("[BOUNTY] Autonomous bounty hunter armed — scanning every 5 minutes");

  cron.schedule("*/5 * * * *", async () => {
    try {
      const bounties = await scrapeBounties();
      if (bounties.length === 0) return;

      console.log(`[BOUNTY] Found ${bounties.length} bounties on ACP marketplace`);

      for (const bounty of bounties) {
        const priceUsd = parsePriceUsd(bounty.price);
        if (priceUsd < 50) continue;              // only $50+ bounties
        if (!canFulfill(bounty.title, bounty.description)) continue;

        console.log(`[BOUNTY] HOT BOUNTY: "${bounty.title}" @ ${bounty.price}`);

        const result = await fulfillBounty(bounty);
        const submitted = await submitBid(bounty, result);

        BOUNTY_LOG.push({
          timestamp: new Date().toISOString(),
          title:     bounty.title,
          price:     bounty.price,
          priceUsd,
          fulfilled: true,
          submitted,
        });

        console.log(`[BOUNTY] ${submitted ? "BID SUBMITTED" : "Result prepared (submit manually)"}: ${bounty.title} @ ${bounty.price}`);
      }
    } catch (e) {
      console.error("[BOUNTY] Hunter cycle error:", e.message);
    }
  });

  return BOUNTY_LOG;
}
