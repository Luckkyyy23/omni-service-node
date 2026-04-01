/**
 * TIER 1 — Earnings Calendar Service
 * Upcoming earnings + recent surprises from FMP demo endpoint
 *
 * Sources (free, demo key works for basic data):
 *   - Financial Modeling Prep: earning_calendar (demo key)
 *   - Yahoo Finance: earnings summary per ticker
 */

import axios from "axios";

const FMP_BASE = "https://financialmodelingprep.com/api/v3";
const FMP_KEY  = "demo";

async function fetchEarningsCalendar() {
  const today = new Date();
  const from  = today.toISOString().split("T")[0];
  const toDate = new Date(today.getTime() + 14 * 86400000).toISOString().split("T")[0];
  const { data } = await axios.get(`${FMP_BASE}/earning_calendar`, {
    params: { from, to: toDate, apikey: FMP_KEY },
    timeout: 10000,
  });
  return (Array.isArray(data) ? data : []).slice(0, 30).map(e => ({
    symbol:       e.symbol,
    company:      e.company || e.symbol,
    date:         e.date,
    epsEstimate:  e.epsEstimated ?? null,
    epsActual:    e.eps ?? null,
    revEstimate:  e.revenueEstimated ?? null,
    revActual:    e.revenue ?? null,
    surprise:     e.eps != null && e.epsEstimated != null
      ? +(((e.eps - e.epsEstimated) / Math.abs(e.epsEstimated || 1)) * 100).toFixed(2)
      : null,
    time:         e.time || "unknown",
  }));
}

async function fetchRecentSurprises() {
  const pastFrom = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
  const today    = new Date().toISOString().split("T")[0];
  const { data } = await axios.get(`${FMP_BASE}/earning_calendar`, {
    params: { from: pastFrom, to: today, apikey: FMP_KEY },
    timeout: 10000,
  });
  return (Array.isArray(data) ? data : [])
    .filter(e => e.eps != null && e.epsEstimated != null)
    .map(e => ({
      symbol:   e.symbol,
      date:     e.date,
      epsActual: e.eps,
      epsEstimate: e.epsEstimated,
      surprisePct: +(((e.eps - e.epsEstimated) / Math.abs(e.epsEstimated || 1)) * 100).toFixed(2),
      beat: e.eps >= e.epsEstimated,
    }))
    .sort((a, b) => Math.abs(b.surprisePct) - Math.abs(a.surprisePct))
    .slice(0, 10);
}

export async function earnings(req, res) {
  const [upcoming, surprises] = await Promise.all([
    fetchEarningsCalendar().catch(() => []),
    fetchRecentSurprises().catch(() => []),
  ]);

  const beats   = surprises.filter(s => s.beat).length;
  const misses  = surprises.filter(s => !s.beat).length;

  res.json({
    status: "ok",
    upcoming,
    recentSurprises: surprises,
    summary: {
      upcomingCount: upcoming.length,
      recentBeats:   beats,
      recentMisses:  misses,
      beatRate:      surprises.length ? +((beats / surprises.length) * 100).toFixed(1) : null,
    },
    meta: {
      sources:     ["financialmodelingprep.com (demo)"],
      generatedAt: new Date().toISOString(),
    },
  });
}
