/**
 * TIER 1 — IPO Calendar Service
 * Upcoming and recent IPOs via FMP demo endpoint
 *
 * Sources (free, demo key):
 *   - Financial Modeling Prep ipo_calendar
 */

import axios from "axios";

const FMP_BASE = "https://financialmodelingprep.com/api/v3";
const FMP_KEY  = "demo";

async function fetchIPOs(from, to) {
  const { data } = await axios.get(`${FMP_BASE}/ipo_calendar`, {
    params: { from, to, apikey: FMP_KEY },
    timeout: 10000,
  });
  return Array.isArray(data) ? data : [];
}

function classifyIPO(ipo) {
  const shares = Number(ipo.shares || 0);
  const low    = Number((ipo.priceRange || "0").split("-")[0]) || 0;
  const high   = Number((ipo.priceRange || "0").split("-")[1] || low) || low;
  const midPx  = (low + high) / 2 || 0;
  const offeringSize = shares * midPx;

  return {
    size:   offeringSize > 1e9 ? "MEGA" : offeringSize > 1e8 ? "LARGE" : offeringSize > 1e7 ? "MID" : "SMALL",
    signal: offeringSize > 5e8 ? "HIGH_ATTENTION" : "STANDARD",
  };
}

export async function ipoCalendar(req, res) {
  const today    = new Date();
  const pastFrom = new Date(today.getTime() - 30 * 86400000).toISOString().split("T")[0];
  const future   = new Date(today.getTime() + 30 * 86400000).toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];

  const [upcoming, recent] = await Promise.all([
    fetchIPOs(todayStr, future).catch(() => []),
    fetchIPOs(pastFrom, todayStr).catch(() => []),
  ]);

  const normalize = (ipos, status) =>
    ipos.map(i => {
      const cls = classifyIPO(i);
      return {
        company:    i.company,
        symbol:     i.symbol,
        exchange:   i.exchange,
        date:       i.date,
        shares:     i.shares || null,
        priceRange: i.priceRange || null,
        marketCap:  i.marketCap || null,
        status,
        ...cls,
      };
    });

  const upcomingList = normalize(upcoming, "UPCOMING");
  const recentList   = normalize(recent,   "PRICED");

  res.json({
    status: "ok",
    summary: {
      upcoming: upcomingList.length,
      recent:   recentList.length,
      megaIPOs: [...upcomingList, ...recentList].filter(i => i.size === "MEGA").length,
    },
    upcoming: upcomingList,
    recent:   recentList.slice(0, 15),
    meta: {
      sources:     ["financialmodelingprep.com (demo)"],
      generatedAt: new Date().toISOString(),
    },
  });
}
