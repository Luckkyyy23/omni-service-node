/**
 * TIER 1 — Earthquake Monitor Service
 * Significant seismic events from USGS — last 7 days significant + M4.5+ today.
 * Useful for commodity traders (oil/gas infrastructure), insurance, reinsurance, and macro risk.
 *
 * Sources (free, no auth):
 *   USGS Earthquake Hazards Program — https://earthquake.usgs.gov/
 */
import axios from "axios";

const USGS_BASE = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary";

async function fetchSignificantWeek() {
  try {
    const { data } = await axios.get(`${USGS_BASE}/significant_week.geojson`, {
      timeout: 10000,
    });
    return (data.features || []).map(f => ({
      id: f.id,
      magnitude: f.properties.mag,
      place: f.properties.place,
      time: new Date(f.properties.time).toISOString(),
      depth_km: f.geometry?.coordinates?.[2] ?? null,
      tsunami: f.properties.tsunami === 1,
      alert: f.properties.alert,
      felt: f.properties.felt,
      url: f.properties.url,
      coordinates: {
        lon: f.geometry?.coordinates?.[0] ?? null,
        lat: f.geometry?.coordinates?.[1] ?? null,
      },
    }));
  } catch {
    return [];
  }
}

async function fetchM45Today() {
  try {
    const { data } = await axios.get(`${USGS_BASE}/4.5_day.geojson`, {
      timeout: 10000,
    });
    return (data.features || []).map(f => ({
      id: f.id,
      magnitude: f.properties.mag,
      place: f.properties.place,
      time: new Date(f.properties.time).toISOString(),
      depth_km: f.geometry?.coordinates?.[2] ?? null,
      tsunami: f.properties.tsunami === 1,
      alert: f.properties.alert,
      coordinates: {
        lon: f.geometry?.coordinates?.[0] ?? null,
        lat: f.geometry?.coordinates?.[1] ?? null,
      },
    }));
  } catch {
    return [];
  }
}

// Derive affected regions from place strings
function extractRegions(events) {
  const regionCounts = {};
  for (const e of events) {
    if (!e.place) continue;
    // Place strings usually end with "of REGION" or are just "REGION"
    const parts = e.place.split(" of ");
    const region = parts[parts.length - 1].trim();
    regionCounts[region] = (regionCounts[region] || 0) + 1;
  }
  return Object.entries(regionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([region, count]) => ({ region, earthquakeCount: count }));
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function earthquakeMonitor(req, res) {
  const [sigWeekResult, m45TodayResult] = await Promise.allSettled([
    fetchSignificantWeek(),
    fetchM45Today(),
  ]);

  const significant = sigWeekResult.status === "fulfilled" ? sigWeekResult.value : [];
  const m45Today = m45TodayResult.status === "fulfilled" ? m45TodayResult.value : [];

  // Sort by magnitude descending
  const topByMag = [...significant, ...m45Today]
    .sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0))
    .slice(0, 5);

  const maxMag = topByMag[0]?.magnitude ?? 0;
  const tsunamiEvents = [...significant, ...m45Today].filter(e => e.tsunami);
  const regions = extractRegions([...significant, ...m45Today]);

  // Deduplicate by id
  const allEvents = [...new Map([...significant, ...m45Today].map(e => [e.id, e])).values()];

  res.json({
    status: "ok",
    summary: {
      significantWeek: significant.length,
      m45TodayCount: m45Today.length,
      largestMagnitude: maxMag,
      largestEvent: topByMag[0] ?? null,
      tsunamiWarnings: tsunamiEvents.length,
      signal: maxMag >= 7.0
        ? "MAJOR_EVENT"
        : maxMag >= 6.0
        ? "STRONG_ACTIVITY"
        : significant.length > 3
        ? "ELEVATED_ACTIVITY"
        : "NORMAL",
    },
    significantWeek: significant,
    m45Today,
    topByMagnitude: topByMag,
    tsunamiEvents,
    regionsAffected: regions,
    totalUniqueEvents: allEvents.length,
    meta: {
      sources: [
        "USGS significant_week.geojson",
        "USGS 4.5_day.geojson",
      ],
      generatedAt: new Date().toISOString(),
    },
  });
}
