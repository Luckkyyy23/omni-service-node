/**
 * TIER 1 — Space Weather Service
 * Real-time geomagnetic storm levels, solar flux, and NOAA space weather alerts.
 * Relevant for satellite operators, power grid operators, HF radio, and aurora watchers.
 *
 * Sources (free, no auth):
 *   NOAA SWPC — https://www.swpc.noaa.gov/
 */
import axios from "axios";

const SWPC_BASE = "https://services.swpc.noaa.gov";

// Get latest KP index from 1-minute planetary K-index feed
async function fetchKpIndex() {
  try {
    const { data } = await axios.get(
      `${SWPC_BASE}/json/planetary_k_index_1m.json`,
      { timeout: 8000 }
    );
    if (!Array.isArray(data) || data.length === 0) return null;
    // Data is array of [time_tag, kp_index, observed, noaa_scale]
    // Take the most recent entry
    const latest = data[data.length - 1];
    const recent = data.slice(-60); // last hour
    const maxKp = Math.max(...recent.map(d => parseFloat(d[1]) || 0));
    return {
      current: parseFloat(latest[1]) || 0,
      timeTag: latest[0],
      noaaScale: latest[3] || "None",
      maxLastHour: maxKp,
    };
  } catch {
    return null;
  }
}

// Get observed solar cycle indices (sunspot number, solar flux)
async function fetchSolarCycle() {
  try {
    const { data } = await axios.get(
      `${SWPC_BASE}/json/solar-cycle/observed-solar-cycle-indices.json`,
      { timeout: 8000 }
    );
    if (!Array.isArray(data) || data.length === 0) return null;
    const latest = data[data.length - 1];
    return {
      year: latest["time-tag"],
      ssnSmoothed: latest["smoothed_ssn"],
      ssnObserved: latest["ssn"],
      solarFluxSmoothed: latest["smoothed_f10.7"],
      solarFluxObserved: latest["f10.7"],
    };
  } catch {
    return null;
  }
}

// Get NOAA space weather alerts
async function fetchAlerts() {
  try {
    const { data } = await axios.get(
      `${SWPC_BASE}/products/alerts.json`,
      { timeout: 8000 }
    );
    if (!Array.isArray(data)) return [];
    // Return the 10 most recent alerts
    return data.slice(0, 10).map(a => ({
      issueTime: a.issue_datetime,
      type: a.product_id,
      message: a.message ? a.message.substring(0, 300) : "",
    }));
  } catch {
    return [];
  }
}

// NOAA G-scale labels
function gScale(kp) {
  if (kp >= 9) return "G5 — Extreme";
  if (kp >= 8) return "G4 — Severe";
  if (kp >= 7) return "G3 — Strong";
  if (kp >= 6) return "G2 — Moderate";
  if (kp >= 5) return "G1 — Minor";
  return "None — Quiet";
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function spaceWeather(req, res) {
  const [kpResult, solarResult, alertsResult] = await Promise.allSettled([
    fetchKpIndex(),
    fetchSolarCycle(),
    fetchAlerts(),
  ]);

  const kp = kpResult.status === "fulfilled" ? kpResult.value : null;
  const solar = solarResult.status === "fulfilled" ? solarResult.value : null;
  const alerts = alertsResult.status === "fulfilled" ? alertsResult.value : [];

  const currentKp = kp?.current ?? 0;
  const stormWarning = currentKp > 5;
  const stormLevel = gScale(currentKp);

  // Check for active storm-type alerts
  const stormAlerts = alerts.filter(a =>
    /geomagnetic|storm|G[1-5]|K[6-9]/i.test(a.type + " " + a.message)
  );

  res.json({
    status: "ok",
    summary: {
      signal: stormWarning ? "STORM_WARNING" : "QUIET",
      stormLevel,
      currentKp,
      maxKpLastHour: kp?.maxLastHour ?? null,
      noaaScale: kp?.noaaScale ?? "None",
      solarFlux: solar?.solarFluxObserved ?? null,
      solarFluxSmoothed: solar?.solarFluxSmoothed ?? null,
      sunspotNumber: solar?.ssnObserved ?? null,
      activeAlertCount: alerts.length,
      stormAlertCount: stormAlerts.length,
    },
    kpIndex: kp,
    solarCycle: solar,
    recentAlerts: alerts,
    stormAlerts,
    impacts: stormWarning
      ? [
          "Possible HF radio blackouts at high latitudes",
          "Satellite drag and orientation disturbances",
          "Power grid induced current fluctuations",
          "GPS accuracy degradation",
          stormLevel.startsWith("G3") || stormLevel.startsWith("G4") || stormLevel.startsWith("G5")
            ? "Aurora visible at mid-latitudes"
            : "Aurora visible at high latitudes only",
        ]
      : ["No significant impacts expected — geomagnetic conditions quiet"],
    meta: {
      sources: [
        "NOAA SWPC planetary_k_index_1m.json",
        "NOAA SWPC observed-solar-cycle-indices.json",
        "NOAA SWPC products/alerts.json",
      ],
      generatedAt: new Date().toISOString(),
    },
  });
}
