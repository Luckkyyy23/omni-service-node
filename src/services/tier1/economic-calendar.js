/**
 * TIER 1 — Economic Calendar Service
 * Upcoming high-impact economic events from ForexFactory public JSON feed
 *
 * Sources (free, no auth):
 *   - ForexFactory weekly calendar: https://nfs.faireconomy.media/ff_calendar_thisweek.json
 *   - US Treasury fiscal data as supplemental context
 */

import axios from "axios";

const FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const IMPACT_ORDER = { High: 3, Medium: 2, Low: 1, Holiday: 0 };

async function fetchForexFactoryCalendar() {
  const { data } = await axios.get(FF_URL, {
    timeout: 10000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  return Array.isArray(data) ? data : [];
}

function classifyEvent(event) {
  const title = (event.title || "").toLowerCase();
  let marketImpact = "MONITOR";
  if (event.impact === "High") {
    if (title.includes("cpi") || title.includes("inflation") || title.includes("rate decision"))
      marketImpact = "CRITICAL";
    else if (title.includes("nfp") || title.includes("gdp") || title.includes("payroll"))
      marketImpact = "MAJOR";
    else
      marketImpact = "HIGH";
  } else if (event.impact === "Medium") {
    marketImpact = "MEDIUM";
  }
  return marketImpact;
}

export async function economicCalendar(req, res) {
  const { impact = "all", country = "all" } = req.query;

  const raw = await fetchForexFactoryCalendar().catch(() => []);

  let events = raw.map(e => ({
    title:       e.title,
    country:     e.country,
    date:        e.date,
    time:        e.time,
    impact:      e.impact,
    forecast:    e.forecast || null,
    previous:    e.previous || null,
    actual:      e.actual || null,
    marketImpact: classifyEvent(e),
    hasSurprise: e.actual && e.forecast
      ? e.actual !== e.forecast
      : false,
  }));

  if (impact !== "all") {
    const imp = impact.charAt(0).toUpperCase() + impact.slice(1).toLowerCase();
    events = events.filter(e => e.impact === imp);
  }
  if (country !== "all") {
    events = events.filter(e => e.country?.toUpperCase() === country.toUpperCase());
  }

  events.sort((a, b) => (IMPACT_ORDER[b.impact] || 0) - (IMPACT_ORDER[a.impact] || 0));

  const highImpact = events.filter(e => e.impact === "High");
  const upcoming   = events.filter(e => !e.actual);
  const released   = events.filter(e => e.actual);

  res.json({
    status: "ok",
    summary: {
      total:         events.length,
      highImpact:    highImpact.length,
      upcoming:      upcoming.length,
      released:      released.length,
    },
    highImpactEvents: highImpact,
    events,
    meta: {
      sources:     ["nfs.faireconomy.media (ForexFactory)"],
      generatedAt: new Date().toISOString(),
    },
  });
}
