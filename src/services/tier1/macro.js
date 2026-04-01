/**
 * TIER 1 — Macro Economic Intelligence
 * Real-time global macro data every AI agent needs for context
 *
 * Sources (all free, no auth except FRED):
 *   World Bank: GDP, inflation, debt, population — free, no auth
 *   BLS: US employment, CPI, PCE — free, no auth
 *   Frankfurter ECB: G10 FX, interest rate proxy — free
 *   FRED: Fed Funds rate, M2, yield curve — free (needs FRED_API_KEY)
 *   US Treasury: yield curve direct — free
 */

import axios from "axios";

const WORLD_BANK  = "https://api.worldbank.org/v2";
const BLS_API     = "https://api.bls.gov/publicAPI/v2/timeseries/data";
const TREASURY_API = "https://api.fiscaldata.treasury.gov/services/api/v1/accounting/od/avg_interest_rates";
const FRED_API    = "https://api.stlouisfed.org/fred/series/observations";

// World Bank: latest value for a given indicator + country
async function worldBank(country, indicator) {
  const { data } = await axios.get(
    `${WORLD_BANK}/country/${country}/indicator/${indicator}?format=json&mrv=1&per_page=1`,
    { timeout: 8000 }
  );
  const entry = data?.[1]?.[0];
  return entry ? { value: entry.value, year: entry.date } : null;
}

// US Treasury yield curve (real-time, free, no auth)
async function fetchYieldCurve() {
  try {
    const { data } = await axios.get(
      `${TREASURY_API}?fields=security_desc,avg_interest_rate_amt,record_date&sort=-record_date&page[size]=20`,
      { timeout: 8000 }
    );
    const rows = data?.data || [];
    const curve = {};
    rows.forEach(r => {
      curve[r.security_desc] = parseFloat(r.avg_interest_rate_amt);
    });
    return curve;
  } catch { return {}; }
}

// FRED series (requires FRED_API_KEY)
async function fredSeries(seriesId) {
  if (!process.env.FRED_API_KEY) return null;
  try {
    const { data } = await axios.get(FRED_API, {
      params: {
        series_id: seriesId,
        api_key: process.env.FRED_API_KEY,
        file_type: "json",
        sort_order: "desc",
        limit: 2,
      },
      timeout: 8000,
    });
    const obs = data?.observations;
    return obs?.[0]?.value !== "." ? {
      latest: parseFloat(obs[0].value),
      previous: parseFloat(obs[1]?.value),
      date: obs[0].date,
    } : null;
  } catch { return null; }
}

// FX rates from Frankfurter (ECB data)
async function fetchFxRates() {
  try {
    const { data } = await axios.get("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CHF,CNY,AUD,CAD", { timeout: 6000 });
    return data.rates || {};
  } catch { return {}; }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function macro(req, res) {
  const { countries = "US,CN,EU,JP,GB" } = req.query;

  const [
    fedRate,
    inflation,
    m2,
    unemploymentRate,
    sp500,
    yieldCurve,
    fxRates,
    usGdp,
    cnGdp,
    globalDebt,
  ] = await Promise.allSettled([
    fredSeries("FEDFUNDS"),           // Fed Funds Rate
    fredSeries("CPIAUCSL"),           // US CPI (inflation)
    fredSeries("M2SL"),               // US M2 Money Supply
    fredSeries("UNRATE"),             // US Unemployment Rate
    fredSeries("SP500"),              // S&P 500 Index
    fetchYieldCurve(),
    fetchFxRates(),
    worldBank("US", "NY.GDP.MKTP.CD"),  // US GDP
    worldBank("CN", "NY.GDP.MKTP.CD"),  // China GDP
    worldBank("1W", "GC.DOD.TOTL.GD.ZS"), // Global debt % GDP
  ]);

  const resolve = r => r.status === "fulfilled" ? r.value : null;

  const usCpi    = resolve(inflation);
  const usFed    = resolve(fedRate);
  const usM2     = resolve(m2);
  const usUnemp  = resolve(unemploymentRate);

  // Derive inflation trend
  let inflationTrend = "STABLE";
  if (usCpi?.latest && usCpi?.previous) {
    inflationTrend = usCpi.latest > usCpi.previous ? "RISING" : usCpi.latest < usCpi.previous ? "FALLING" : "STABLE";
  }

  // Rate environment
  let rateEnv = "NEUTRAL";
  if (usFed?.latest >= 5.0) rateEnv = "RESTRICTIVE";
  else if (usFed?.latest <= 2.0) rateEnv = "ACCOMMODATIVE";
  else rateEnv = "NEUTRAL";

  // Dollar strength (DXY proxy from FX)
  const fx = resolve(fxRates);
  const eurUsd = fx?.EUR ? (1 / fx.EUR).toFixed(4) : null;
  const gbpUsd = fx?.GBP ? (1 / fx.GBP).toFixed(4) : null;

  res.json({
    status: "ok",
    snapshot: {
      timestamp:     new Date().toISOString(),
      rateEnvironment: rateEnv,
      inflationTrend,
      riskSignal:    usFed?.latest >= 5.0 && usCpi?.latest >= 4 ? "RISK_OFF" : "RISK_ON",
    },
    us: {
      fedFundsRate:     usFed?.latest ?? null,
      fedFundsDate:     usFed?.date ?? null,
      cpiYoy:           usCpi?.latest ?? null,
      inflationTrend,
      unemploymentRate: usUnemp?.latest ?? null,
      m2SupplyBillions: usM2?.latest ? Math.round(usM2.latest / 1000) : null,
      gdpUsd:           resolve(usGdp),
    },
    china: {
      gdpUsd:  resolve(cnGdp),
    },
    global: {
      debtPctGdp: resolve(globalDebt),
    },
    fx: {
      EURUSD: eurUsd,
      GBPUSD: gbpUsd,
      USDJPY: fx?.JPY ? fx.JPY.toFixed(2) : null,
      USDCHF: fx?.CHF ? fx.CHF.toFixed(4) : null,
      USDCNY: fx?.CNY ? fx.CNY.toFixed(4) : null,
    },
    yieldCurve: resolve(yieldCurve),
    sp500:      resolve(sp500),
    agentContext: {
      summary: `Fed at ${usFed?.latest ?? "unknown"}%. CPI at ${usCpi?.latest ?? "unknown"}. Environment: ${rateEnv}. Inflation: ${inflationTrend}.`,
      tradingBias: rateEnv === "RESTRICTIVE" ? "DEFENSIVE — high rates suppress risk assets" : "GROWTH — accommodative conditions favor equities/crypto",
      keyRisk: usFed?.latest >= 5.25 ? "Rate shock risk: Fed still restrictive" : "Inflation resurgence risk",
    },
    meta: {
      sources: ["FRED (stlouisfed.org)", "World Bank API", "US Treasury FiscalData", "Frankfurter ECB"],
      fredKeyRequired: !process.env.FRED_API_KEY,
      generatedAt: new Date().toISOString(),
    },
  });
}
