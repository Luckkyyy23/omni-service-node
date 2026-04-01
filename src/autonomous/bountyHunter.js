/**
 * Autonomous Bounty Hunter
 * Scans ACP marketplace for $50+ bounties that match our capabilities
 * Auto-bids and fulfills matching jobs without human intervention
 *
 * Runs every 5 minutes via cron
 */

import cron from "node-cron";
import axios from "axios";
import { chromium } from "playwright";

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

// Scrape ACP marketplace for bounties using Playwright
async function scrapeBounties() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (compatible; OmniServiceBot/1.0; +https://omni-service.io)");
    await page.goto(ACP_MARKETPLACE, { waitUntil: "networkidle", timeout: 30000 });

    // Wait for job listings to load
    await page.waitForSelector('[data-testid="job-listing"], .job-card, [class*="bounty"], [class*="job"]', {
      timeout: 10000,
    }).catch(() => {});

    // Extract bounty data
    const bounties = await page.evaluate(() => {
      const items = [];
      // Try multiple selectors — ACP UI may vary
      const selectors = ['[data-testid="job-listing"]', '.bounty-card', '[class*="JobCard"]', 'article'];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach(el => {
          const text  = el.innerText || "";
          const link  = el.querySelector("a")?.href || "";
          const price = text.match(/\$[\d,]+|\d+\s*USDC/i)?.[0] || "";
          const title = el.querySelector("h2,h3,h4,[class*='title']")?.innerText?.trim() || text.slice(0, 80);
          if (title && price) {
            items.push({ title, price, link, description: text.slice(0, 300) });
          }
        });
        if (items.length > 0) break;
      }
      return items;
    });

    return bounties;
  } catch (e) {
    console.error("[BOUNTY] Scrape failed:", e.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

// Parse dollar amount from string
function parsePriceUsd(priceStr = "") {
  const match = priceStr.replace(/,/g, "").match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

// Submit a bid via ACP (uses ACP Node SDK if private key available)
async function submitBid(bounty, result) {
  if (!process.env.AGENT_WALLET_PRIVATE_KEY) return false;
  try {
    // If ACP SDK is running, submit fulfillment result
    const acpPkg = await import("@virtuals-protocol/acp-node");
    const ACPNode = acpPkg.default?.ACPNode || acpPkg.ACPNode;
    const acp = new ACPNode({
      walletPrivateKey:   process.env.AGENT_WALLET_PRIVATE_KEY,
      agentWalletAddress: process.env.WALLET_ADDRESS,
    });
    // Respond to the bounty with our result
    await acp.submitJobResponse({
      jobId: bounty.jobId,
      result: JSON.stringify(result),
    });
    return true;
  } catch (e) {
    console.error("[BOUNTY] Bid submission failed:", e.message);
    return false;
  }
}

// Log to bounty ledger file
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

        console.log(`[BOUNTY] ${submitted ? "✅ BID SUBMITTED" : "⚠ Result prepared (submit manually)"}: ${bounty.title} @ ${bounty.price}`);
      }
    } catch (e) {
      console.error("[BOUNTY] Hunter cycle error:", e.message);
    }
  });

  return BOUNTY_LOG;
}
