/**
 * TIER 1 — Fear Index Service
 * Market fear/greed across crypto and stocks
 *
 * Sources (free, no auth):
 *   - Alternative.me Fear & Greed (crypto): https://api.alternative.me/fng/
 *   - CNN Fear & Greed (stocks): https://production.dataviz.cnn.io/index/fearandgreed/graphdata
 */

import axios from "axios";

async function fetchCryptoFearGreed() {
  const { data } = await axios.get("https://api.alternative.me/fng/?limit=7&format=json", {
    timeout: 8000,
  });
  const items = data.data || [];
  return {
    current: {
      value:          Number(items[0]?.value || 0),
      classification: items[0]?.value_classification || "Unknown",
      timestamp:      items[0]?.timestamp ? new Date(Number(items[0].timestamp) * 1000).toISOString() : null,
    },
    history7d: items.map(d => ({
      value:          Number(d.value),
      classification: d.value_classification,
      date:           d.timestamp ? new Date(Number(d.timestamp) * 1000).toISOString().split("T")[0] : null,
    })),
  };
}

async function fetchCNNFearGreed() {
  const { data } = await axios.get(
    "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
    { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } }
  );
  const current = data?.fear_and_greed;
  const history = data?.fear_and_greed_historical?.data || [];
  return {
    current: {
      value:          current?.score != null ? +Number(current.score).toFixed(1) : null,
      rating:         current?.rating || null,
      timestamp:      current?.timestamp || null,
    },
    previousClose: data?.fear_and_greed_historical?.data?.[1]
      ? +Number(data.fear_and_greed_historical.data[1][1]).toFixed(1)
      : null,
    history7d: history.slice(0, 7).map(d => ({
      date:  new Date(d[0]).toISOString().split("T")[0],
      value: +Number(d[1]).toFixed(1),
    })),
  };
}

function compositeSignal(cryptoVal, stockVal) {
  const avg = ((cryptoVal || 50) + (stockVal || 50)) / 2;
  if (avg >= 75) return "EXTREME_GREED";
  if (avg >= 55) return "GREED";
  if (avg >= 45) return "NEUTRAL";
  if (avg >= 25) return "FEAR";
  return "EXTREME_FEAR";
}

function trend7d(history = []) {
  if (history.length < 2) return "FLAT";
  const first = history[history.length - 1]?.value || 50;
  const last  = history[0]?.value || 50;
  if (last - first > 5)  return "IMPROVING";
  if (first - last > 5)  return "DETERIORATING";
  return "FLAT";
}

export async function fearIndex(req, res) {
  const [crypto, stocks] = await Promise.all([
    fetchCryptoFearGreed().catch(() => ({ current: { value: 50, classification: "Neutral" }, history7d: [] })),
    fetchCNNFearGreed().catch(() => ({ current: { value: 50, rating: "Neutral" }, history7d: [] })),
  ]);

  const composite = compositeSignal(crypto.current.value, stocks.current.value);
  const cryptoTrend = trend7d(crypto.history7d);
  const stockTrend  = trend7d(stocks.history7d);

  res.json({
    status: "ok",
    composite: {
      signal:      composite,
      cryptoValue: crypto.current.value,
      stockValue:  stocks.current.value,
      avgValue:    +((( crypto.current.value || 50) + (stocks.current.value || 50)) / 2).toFixed(1),
    },
    crypto: {
      ...crypto.current,
      trend7d:   cryptoTrend,
      history7d: crypto.history7d,
    },
    stocks: {
      ...stocks.current,
      trend7d:   stockTrend,
      history7d: stocks.history7d,
    },
    agentRecommendation: {
      signal:  composite.includes("GREED") ? "RISK_ON" : composite.includes("FEAR") ? "RISK_OFF" : "NEUTRAL",
      note:    `Crypto fear/greed: ${crypto.current.classification}. Stocks: ${stocks.current.rating || "N/A"}. Composite: ${composite}`,
    },
    meta: {
      sources:     ["alternative.me/fng", "production.dataviz.cnn.io"],
      generatedAt: new Date().toISOString(),
    },
  });
}
