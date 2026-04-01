/**
 * Autonomous Scaler
 * Monitors traffic and spins up a second worker on Railway if Tier 1 exceeds 100k req/hr
 *
 * Railway GraphQL API: https://backboard.railway.app/graphql/v2
 */

import cron from "node-cron";
import axios from "axios";

const RAILWAY_API = "https://backboard.railway.app/graphql/v2";
const SCALE_THRESHOLD_RPH = 100000;  // 100k req/hr
let scaledOut = false;
let lastScaleTime = 0;
const SCALE_COOLDOWN = 30 * 60 * 1000; // 30 min cooldown

// Deploy a second worker on Railway via GraphQL API
async function deployRailwayWorker() {
  if (!process.env.RAILWAY_TOKEN || !process.env.RAILWAY_PROJECT_ID || !process.env.RAILWAY_SERVICE_ID) {
    console.warn("[SCALER] Railway credentials not set — manual scaling required");
    return false;
  }

  const mutation = `
    mutation ServiceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId) {
        id
        status
      }
    }
  `;

  try {
    // Get environment ID first
    const envQuery = await axios.post(
      RAILWAY_API,
      {
        query: `query { project(id: "${process.env.RAILWAY_PROJECT_ID}") { environments { edges { node { id name } } } } }`,
      },
      {
        headers: { Authorization: `Bearer ${process.env.RAILWAY_TOKEN}`, "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    const environments = envQuery.data?.data?.project?.environments?.edges || [];
    const prodEnv = environments.find(e => e.node.name === "production") || environments[0];
    if (!prodEnv) throw new Error("No Railway environment found");

    const result = await axios.post(
      RAILWAY_API,
      {
        query: mutation,
        variables: {
          serviceId:     process.env.RAILWAY_SERVICE_ID,
          environmentId: prodEnv.node.id,
        },
      },
      {
        headers: { Authorization: `Bearer ${process.env.RAILWAY_TOKEN}`, "Content-Type": "application/json" },
        timeout: 15000,
      }
    );

    const deployment = result.data?.data?.serviceInstanceRedeploy;
    console.log("[SCALER] ✅ Railway scale-out triggered — deployment:", deployment?.id);
    return true;
  } catch (e) {
    console.error("[SCALER] Railway deploy failed:", e.message);
    return false;
  }
}

// ── Scaler loop ───────────────────────────────────────────────────────────────
export function startScaler(stats) {
  // Check traffic every minute
  cron.schedule("* * * * *", async () => {
    try {
      const uptimeSecs = (Date.now() - stats.startedAt) / 1000;
      const hours = Math.max(uptimeSecs / 3600, 1 / 60);
      const tier1Rph = Math.round(stats.tier1 / hours);

      if (tier1Rph >= SCALE_THRESHOLD_RPH && !scaledOut && Date.now() - lastScaleTime > SCALE_COOLDOWN) {
        console.log(`[SCALER] 🔥 Traffic: ${tier1Rph.toLocaleString()} req/hr — THRESHOLD EXCEEDED — scaling out`);
        const success = await deployRailwayWorker();
        if (success) {
          scaledOut = true;
          lastScaleTime = Date.now();
          // Reset scale-out flag after 1 hour to allow scaling again
          setTimeout(() => { scaledOut = false; }, 60 * 60 * 1000);
        }
      }

      // Log traffic every 10 minutes
      if (Math.floor(uptimeSecs) % 600 === 0 && uptimeSecs > 60) {
        console.log(`[SCALER] Traffic: T1=${tier1Rph.toLocaleString()}/hr T2=${Math.round(stats.tier2 / hours).toLocaleString()}/hr Revenue=$${stats.revenue.toFixed(2)} USDC`);
      }
    } catch (e) {
      console.error("[SCALER] Error:", e.message);
    }
  });

  console.log("[SCALER] Auto-scaler active — threshold:", SCALE_THRESHOLD_RPH.toLocaleString(), "req/hr");
}
