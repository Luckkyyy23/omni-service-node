/**
 * TIER 1 — Real Estate Market Intelligence
 * Mortgage rates, home price index, housing starts — from FRED public data.
 * Affordability signal and housing cycle positioning.
 *
 * Sources (free, no auth):
 *   FRED (Federal Reserve Economic Data) — public fredgraph.json endpoint
 *   https://fred.stlouisfed.org/graph/fredgraph.json
 */
import axios from "axios";

const FRED_GRAPH = "https://fred.stlouisfed.org/graph/fredgraph.json";

async function fredGraph(seriesId) {
  try {
    const { data } = await axios.get(FRED_GRAPH, {
      params: { id: seriesId },
      timeout: 10000,
    });
    const obs = (data?.observations || []).filter(o => o.value !== ".");
    if (obs.length === 0) return null;
    const latest = obs[obs.length - 1];
    const prev = obs.length >= 2 ? obs[obs.length - 2] : null;
    const yearAgo = obs.length >= 52 ? obs[obs.length - 52] : obs[0];
    return {
      latest: parseFloat(latest.value),
      latestDate: latest.date,
      previous: prev ? parseFloat(prev.value) : null,
      previousDate: prev?.date ?? null,
      yearAgo: yearAgo ? parseFloat(yearAgo.value) : null,
      yoyChange: yearAgo ? parseFloat(latest.value) - parseFloat(yearAgo.value) : null,
      yoyPct:
        yearAgo && parseFloat(yearAgo.value) !== 0
          ? parseFloat(
              (((parseFloat(latest.value) - parseFloat(yearAgo.value)) / parseFloat(yearAgo.value)) * 100).toFixed(2)
            )
          : null,
    };
  } catch {
    return null;
  }
}

function computeAffordabilitySignal(mortgage, caseShiller) {
  if (!mortgage && !caseShiller) return "DATA_UNAVAILABLE";
  const rate = mortgage?.latest ?? 0;
  const hpiYoy = caseShiller?.yoyPct ?? 0;

  // High rates + high appreciation = worst affordability
  if (rate > 7 && hpiYoy > 5) return "SEVERE_AFFORDABILITY_CRISIS";
  if (rate > 7 || (rate > 6 && hpiYoy > 8)) return "POOR_AFFORDABILITY";
  if (rate > 6) return "STRAINED_AFFORDABILITY";
  if (rate < 4 && hpiYoy < 5) return "HEALTHY_AFFORDABILITY";
  if (rate < 5) return "MODERATE_AFFORDABILITY";
  return "NEUTRAL";
}

function cyclePosition(mortgage, housingStarts, caseShiller) {
  const rate = mortgage?.latest ?? 0;
  const starts = housingStarts?.latest ?? 0;
  const hpiYoy = caseShiller?.yoyPct ?? 0;
  const hpiMom = caseShiller?.previous && caseShiller?.latest
    ? caseShiller.latest - caseShiller.previous
    : 0;

  if (rate > 7.5 && starts < 1200 && hpiMom < 0) return "CONTRACTION";
  if (rate > 6.5 && starts < 1400) return "SLOWDOWN";
  if (rate < 5 && starts > 1600 && hpiYoy > 8) return "EXPANSION_OVERHEATING";
  if (rate < 6 && starts > 1400 && hpiYoy > 3) return "EXPANSION";
  if (hpiMom > 0 && starts > 1300) return "EARLY_RECOVERY";
  return "STABILIZING";
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function realEstateMarket(req, res) {
  const [mortgageResult, caseShillerResult, housingStartsResult] = await Promise.allSettled([
    fredGraph("MORTGAGE30US"),
    fredGraph("CSUSHPISA"),
    fredGraph("HOUST"),
  ]);

  const mortgage = mortgageResult.status === "fulfilled" ? mortgageResult.value : null;
  const caseShiller = caseShillerResult.status === "fulfilled" ? caseShillerResult.value : null;
  const housingStarts = housingStartsResult.status === "fulfilled" ? housingStartsResult.value : null;

  const affordability = computeAffordabilitySignal(mortgage, caseShiller);
  const cycle = cyclePosition(mortgage, housingStarts, caseShiller);

  // Monthly mortgage payment estimate ($400k home, 20% down)
  const loanAmount = 320000;
  const monthlyPayment = mortgage?.latest
    ? Math.round(
        (loanAmount * (mortgage.latest / 100 / 12)) /
          (1 - Math.pow(1 + mortgage.latest / 100 / 12, -360))
      )
    : null;

  res.json({
    status: "ok",
    summary: {
      signal: affordability,
      cyclePosition: cycle,
      mortgageRate30yr: mortgage?.latest ?? null,
      caseShillerIndex: caseShiller?.latest ?? null,
      caseShillerYoY: caseShiller?.yoyPct ? `${caseShiller.yoyPct}%` : null,
      housingStartsThousands: housingStarts?.latest ?? null,
      mortgageRateDate: mortgage?.latestDate ?? null,
    },
    mortgage: {
      rate30yr: mortgage?.latest ?? null,
      previousWeek: mortgage?.previous ?? null,
      weeklyChange: mortgage && mortgage.latest && mortgage.previous
        ? parseFloat((mortgage.latest - mortgage.previous).toFixed(3))
        : null,
      date: mortgage?.latestDate ?? null,
      data: mortgage,
    },
    homePrices: {
      caseShillerIndex: caseShiller?.latest ?? null,
      yoyChange: caseShiller?.yoyPct ? `${caseShiller.yoyPct}%` : null,
      momChange: caseShiller?.latest && caseShiller?.previous
        ? parseFloat((caseShiller.latest - caseShiller.previous).toFixed(2))
        : null,
      date: caseShiller?.latestDate ?? null,
      data: caseShiller,
    },
    housingStarts: {
      thousandUnitsAnnualized: housingStarts?.latest ?? null,
      momChange: housingStarts?.latest && housingStarts?.previous
        ? parseFloat((housingStarts.latest - housingStarts.previous).toFixed(1))
        : null,
      date: housingStarts?.latestDate ?? null,
      data: housingStarts,
    },
    affordability: {
      signal: affordability,
      estimatedMonthlyPayment400kHome: monthlyPayment,
      paymentNote: "Based on $320k loan (80% LTV on $400k home), 30yr fixed",
      keyThreshold: "Monthly payment >40% median household income = stress zone",
    },
    cycleAnalysis: {
      position: cycle,
      thesis:
        cycle === "CONTRACTION"
          ? "High rates + declining starts + softening prices = housing recession underway"
          : cycle === "EXPANSION_OVERHEATING"
          ? "Rapid appreciation + high starts = overheating; watch for rate shock"
          : cycle === "EARLY_RECOVERY"
          ? "Prices stabilizing and starts recovering — early cycle tailwinds for builders/REITs"
          : "Housing market in transition — rate-sensitive sector awaiting Fed pivot",
    },
    meta: {
      sources: [
        "FRED MORTGAGE30US (30-year fixed mortgage rate)",
        "FRED CSUSHPISA (S&P/Case-Shiller Home Price Index)",
        "FRED HOUST (Housing Starts, thousands, SAAR)",
      ],
      generatedAt: new Date().toISOString(),
    },
  });
}
