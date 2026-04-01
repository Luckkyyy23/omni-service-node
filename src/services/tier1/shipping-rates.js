/**
 * TIER 1 — Shipping Rates & Supply Chain Service
 * Container shipping benchmarks and global trade flow signals.
 * World Bank trade data + supply chain stress indicators.
 *
 * Sources (free, no auth):
 *   World Bank API — https://api.worldbank.org/
 *   Note: Live Freightos/FBX data requires subscription; static benchmarks provided.
 */
import axios from "axios";

const WB_BASE = "https://api.worldbank.org/v2";

async function fetchWorldBankIndicator(indicator) {
  try {
    const { data } = await axios.get(
      `${WB_BASE}/country/all/indicator/${indicator}?format=json&mrv=5&per_page=10`,
      { timeout: 10000 }
    );
    const records = data?.[1] || [];
    const valid = records.filter(r => r.value != null);
    return {
      latest: valid[0] ? { value: valid[0].value, year: valid[0].date, country: valid[0].country?.value } : null,
      series: valid.slice(0, 5).map(r => ({ year: r.date, value: r.value, country: r.country?.value })),
    };
  } catch {
    return null;
  }
}

// Static Freightos Baltic Index benchmarks (updated monthly — live requires subscription)
const STATIC_BENCHMARKS = {
  note: "live-data-requires-subscription",
  source: "Freightos Baltic Index (FBX) — static reference benchmarks",
  lastUpdated: "2026-Q1",
  routes: {
    "China-US-West-Coast": { benchmark_usd_per_40ft: 2800, ytdChange: -12, unit: "USD/40ft container" },
    "China-US-East-Coast": { benchmark_usd_per_40ft: 3400, ytdChange: -8, unit: "USD/40ft container" },
    "China-Europe": { benchmark_usd_per_40ft: 2200, ytdChange: -18, unit: "USD/40ft container" },
    "China-Mediterranean": { benchmark_usd_per_40ft: 2500, ytdChange: -15, unit: "USD/40ft container" },
    "Europe-US-East-Coast": { benchmark_usd_per_40ft: 1800, ytdChange: -5, unit: "USD/40ft container" },
    "Global-Average": { benchmark_usd_per_40ft: 2600, ytdChange: -11, unit: "USD/40ft container" },
  },
  peakCovid2021: 11000,
  preCovid2019: 1500,
  interpretation: "Rates well below 2021 peak but above pre-Covid norms — normalizing supply chain",
};

function computeSupplyChainStress(fbx, tradeVolume) {
  // Score from 0–100 based on rate levels vs historical norms
  const avgRate = STATIC_BENCHMARKS.routes["Global-Average"].benchmark_usd_per_40ft;
  const preCovid = STATIC_BENCHMARKS.preCovid2019;
  const peak = STATIC_BENCHMARKS.peakCovid2021;

  const normalizedRate = Math.min(100, Math.max(0, ((avgRate - preCovid) / (peak - preCovid)) * 100));
  const ytdChange = STATIC_BENCHMARKS.routes["Global-Average"].ytdChange;

  let signal = "NORMAL";
  let stressScore = Math.round(normalizedRate * 0.6);

  if (avgRate > 5000) { signal = "HIGH_STRESS"; stressScore = Math.min(85, stressScore + 30); }
  else if (avgRate > 3000) { signal = "ELEVATED"; stressScore = Math.min(60, stressScore + 10); }
  else if (ytdChange < -15) { signal = "DEFLATING"; }
  else { signal = "STABLE"; }

  return { stressScore, signal, ytdChange };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function shippingRates(req, res) {
  const [containerShipResult, importValueResult] = await Promise.allSettled([
    fetchWorldBankIndicator("IS.SHP.GCNW.XQ"), // Container port traffic
    fetchWorldBankIndicator("TM.VAL.MRCH.CD.WT"), // Merchandise imports USD
  ]);

  const portTraffic = containerShipResult.status === "fulfilled" ? containerShipResult.value : null;
  const importValue = importValueResult.status === "fulfilled" ? importValueResult.value : null;

  const stress = computeSupplyChainStress(STATIC_BENCHMARKS, importValue);

  res.json({
    status: "ok",
    summary: {
      signal: stress.signal,
      stressScore: stress.stressScore,
      globalAvgRate: STATIC_BENCHMARKS.routes["Global-Average"].benchmark_usd_per_40ft,
      ytdRateChange: `${STATIC_BENCHMARKS.routes["Global-Average"].ytdChange}%`,
      ratesNote: STATIC_BENCHMARKS.note,
    },
    containerRates: STATIC_BENCHMARKS,
    worldBankData: {
      containerPortTraffic: portTraffic,
      merchandiseImports: importValue,
    },
    tradeFlowSignals: {
      containerPortTEUs: portTraffic?.latest ?? null,
      globalImportValueUSD: importValue?.latest ?? null,
      tradeExpansion: importValue?.series
        ? importValue.series.length >= 2 &&
          importValue.series[0]?.value > importValue.series[1]?.value
          ? "EXPANDING"
          : "CONTRACTING"
        : "UNKNOWN",
    },
    supplyChainStress: stress,
    keyRisks: [
      "Panama Canal drought restrictions (seasonal)",
      "Red Sea/Suez rerouting adds 10-14 days to Asia-Europe routes",
      "Port worker strikes (US East Coast seasonal risk)",
      "China factory holiday disruptions (CNY, Golden Week)",
    ],
    meta: {
      sources: [
        "World Bank API (IS.SHP.GCNW.XQ, TM.VAL.MRCH.CD.WT)",
        "Freightos Baltic Index (FBX) — static benchmarks (live requires subscription)",
      ],
      liveDataNote: "Real-time FBX data requires Freightos subscription at freightos.com/freight-index",
      generatedAt: new Date().toISOString(),
    },
  });
}
