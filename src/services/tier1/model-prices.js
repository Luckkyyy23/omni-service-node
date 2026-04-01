/**
 * TIER 1 — AI Model Prices Service
 * Live pricing comparison for major AI model APIs
 *
 * Source: Static curated pricing data (updated April 2026)
 * Pricing changes rarely — sourced from official provider pricing pages.
 */

import axios from "axios";

// Prices in USD per 1M tokens (input/output)
const MODEL_CATALOG = [
  {
    model:    "gpt-4o",
    provider: "OpenAI",
    input:    2.50,
    output:   10.00,
    context:  128000,
    strengths: ["multimodal","tool-use","coding","reasoning"],
    tier:     "frontier",
  },
  {
    model:    "gpt-4o-mini",
    provider: "OpenAI",
    input:    0.15,
    output:   0.60,
    context:  128000,
    strengths: ["fast","cheap","classification","extraction"],
    tier:     "efficient",
  },
  {
    model:    "o3-mini",
    provider: "OpenAI",
    input:    1.10,
    output:   4.40,
    context:  128000,
    strengths: ["math","coding","reasoning","STEM"],
    tier:     "reasoning",
  },
  {
    model:    "claude-opus-4",
    provider: "Anthropic",
    input:    15.00,
    output:   75.00,
    context:  200000,
    strengths: ["complex-reasoning","long-context","writing","analysis"],
    tier:     "frontier",
  },
  {
    model:    "claude-sonnet-4",
    provider: "Anthropic",
    input:    3.00,
    output:   15.00,
    context:  200000,
    strengths: ["balanced","coding","analysis","fast"],
    tier:     "balanced",
  },
  {
    model:    "claude-haiku-3-5",
    provider: "Anthropic",
    input:    0.80,
    output:   4.00,
    context:  200000,
    strengths: ["fast","cheap","classification","summarization"],
    tier:     "efficient",
  },
  {
    model:    "gemini-2.0-flash",
    provider: "Google",
    input:    0.10,
    output:   0.40,
    context:  1048576,
    strengths: ["speed","multimodal","1M-context","cheap"],
    tier:     "efficient",
  },
  {
    model:    "gemini-1.5-pro",
    provider: "Google",
    input:    1.25,
    output:   5.00,
    context:  2097152,
    strengths: ["2M-context","multimodal","analysis"],
    tier:     "balanced",
  },
  {
    model:    "llama-3.3-70b",
    provider: "Meta (via Groq/Together)",
    input:    0.59,
    output:   0.79,
    context:  128000,
    strengths: ["open-source","code","instruction-following"],
    tier:     "open-source",
  },
  {
    model:    "deepseek-v3",
    provider: "DeepSeek",
    input:    0.27,
    output:   1.10,
    context:  64000,
    strengths: ["coding","math","cheap","multilingual"],
    tier:     "efficient",
  },
  {
    model:    "mistral-large",
    provider: "Mistral AI",
    input:    2.00,
    output:   6.00,
    context:  128000,
    strengths: ["multilingual","code","reasoning","European"],
    tier:     "balanced",
  },
  {
    model:    "grok-2",
    provider: "xAI",
    input:    2.00,
    output:   10.00,
    context:  131072,
    strengths: ["realtime-data","x-platform","reasoning"],
    tier:     "frontier",
  },
];

function computeSignals(models) {
  const sorted  = [...models].sort((a, b) => a.input - b.input);
  const cheapest = sorted[0];
  const fastest  = models.find(m => m.provider === "Google" && m.model.includes("flash")) || sorted[0];
  const smartest = models.find(m => m.tier === "frontier" && m.provider === "Anthropic") || models[0];
  return { cheapest: cheapest.model, fastest: fastest.model, smartest: smartest.model };
}

export async function modelPrices(req, res) {
  const { tier, provider } = req.query;

  let models = MODEL_CATALOG;
  if (tier)     models = models.filter(m => m.tier === tier);
  if (provider) models = models.filter(m => m.provider.toLowerCase().includes(provider.toLowerCase()));

  const signals = computeSignals(MODEL_CATALOG);

  const byTier = {};
  for (const m of MODEL_CATALOG) {
    if (!byTier[m.tier]) byTier[m.tier] = [];
    byTier[m.tier].push(m.model);
  }

  res.json({
    status: "ok",
    signals: {
      cheapestInput: signals.cheapest,
      fastestLatency: signals.fastest,
      highestCapability: signals.smartest,
    },
    models,
    byTier,
    priceAsOf: "2026-04",
    meta: {
      sources:     ["openai.com/pricing", "anthropic.com/pricing", "ai.google.dev/pricing", "deepseek.com/pricing"],
      note:        "Prices updated April 2026. Verify on provider websites for latest rates.",
      generatedAt: new Date().toISOString(),
    },
  });
}
