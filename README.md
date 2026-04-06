# Omni Service Node

[![Smithery](https://smithery.ai/badge/luckkyyy23/omni-service-node)](https://smithery.ai/servers/luckkyyy23/omni-service-node)

> **The petrol station for AI agents.** 56 pay-per-call MCP endpoints. Real USDC on Base Mainnet. No subscriptions — pure per-call pricing.

## What It Does

AI agents call tools → pay micropayments in USDC on Base Mainnet via the [x402 protocol](https://x402.org) → get data.

56 endpoints across every domain autonomous agents need:

| Category | Endpoints |
|----------|-----------|
| Market Signals | Trading signals (Gold/BTC/FX), options flow, insider trades, analyst ratings, market movers, IPO calendar |
| Macro Economics | Fed rates, CPI, GDP, yield curve, FX rates, economic calendar, commodities, energy prices |
| Crypto & DeFi | On-chain data, whale tracking, DeFi yields, stablecoins, derivatives, token unlocks, NFT market |
| AI Economy | ArXiv research, GitHub velocity, AI model prices, Bittensor subnets, Virtuals Protocol agents |
| Geopolitical | GDELT crisis monitoring (Iran/Israel/Ukraine/Taiwan), sanctions screening, OFAC alerts |
| Deep Intel | SEC filings, USPTO AI patents, company dossiers, hedge fund 13F flows, B2B lead scoring |
| Bundles | Pre-packaged multi-endpoint calls ($0.50–$500) |

## Pricing

| Tier | Price | Count | Examples |
|------|-------|-------|---------|
| Tier 1 | $0.005 USDC/call | 36 tools | `getTradingSignal`, `getMacroData`, `getAiNews` |
| Tier 2 | $5–$25 USDC/call | 12 tools | `getCompanyProfile`, `getGeopoliticalCrisis`, `getWhaleTracker` |
| Bundles | $0.50–$500/call | 8 tools | `runBundleStarter`, `runBundleSovereign` |

## Quick Start

### As an MCP Server (Claude, Cursor, Smithery)

Add to your MCP client config:

```json
{
  "mcpServers": {
    "omni-service-node": {
      "type": "http",
      "url": "https://omni-service-node-production.up.railway.app/mcp"
    }
  }
}
```

### Direct HTTP (x402 payment)

```javascript
import { wrapFetchWithPayment } from "@x402/fetch";

const fetch = wrapFetchWithPayment(globalThis.fetch, wallet);

// Get a trading signal for Gold — costs $0.005 USDC
const res = await fetch("https://omni-service-node-production.up.railway.app/api/v1/signals?symbol=XAUUSD&tf=1h");
const signal = await res.json();
// { signal: "BUY", entry: 2340, stopLoss: 2320, takeProfit: 2380, confidence: 78 }
```

## All 56 Tools

### Tier 1 — $0.005/call

**Market Signals**
- `getTradingSignal` — BUY/SELL/HOLD with entry, stop loss, take profit, RSI, EMA, ATR for Gold/BTC/FX
- `getMarketSentiment` — Fear & Greed index, RISK_ON/RISK_OFF signal, trending tokens
- `getMarketMovers` — Top gainers, losers, most active stocks with volume surge signals
- `getFearIndex` — VIX + Fear & Greed composite with historical context
- `getOptionsFlow` — Unusual options activity, dark pool sweeps, institutional positioning
- `getInsiderTrades` — SEC Form 4 insider buys/sells with bullish/bearish signal
- `getAnalystRatings` — Wall Street upgrades/downgrades with price targets
- `getEarnings` — Upcoming earnings: EPS estimates, beat/miss signals
- `getIpoCalendar` — Upcoming IPOs with size, pricing, sector

**Macro & FX**
- `getMacroData` — Fed rates, CPI, M2, GDP, yield curve, G10 FX, HAWKISH/DOVISH signal
- `getFxRates` — Live FX rates, DXY, crypto crosses
- `getEconomicCalendar` — CPI, NFP, FOMC, GDP releases with forecasts vs prior
- `getCommodities` — Gold, silver, oil, wheat, corn, copper spot prices + signals
- `getEnergyPrices` — WTI, Brent, natural gas, LNG, coal prices

**Crypto & DeFi**
- `getOnchainData` — BTC/ETH fees, mempool, DeFi TVL, top yield opportunities
- `getDefiYields` — Best APY across Aave, Compound, Curve, Yearn, 100+ protocols
- `getStablecoins` — Peg deviation, depeg risk scores for USDT/USDC/DAI/FRAX
- `getCryptoDerivatives` — Funding rates, open interest, liquidations, basis
- `getTokenUnlocks` — Upcoming vesting unlocks with supply pressure signals
- `getNftMarket` — Floor prices, volume, wash trade detection
- `getAiTokens` — AI sector tokens (TAO, FET, AGIX, RNDR, WLD) performance
- `getVirtualsProtocol` — Virtuals Protocol AI agent prices and activity
- `getBittensor` — Bittensor TAO subnet emissions, validator rewards

**Intelligence**
- `getAiNews` — Real-time AI/crypto/macro news from HackerNews, Reddit, NewsAPI
- `getArxivResearch` — Latest AI/ML papers with breakthrough detection
- `getGithubTrending` — Trending repos by language and topic
- `getModelPrices` — AI model pricing across OpenAI, Anthropic, Google, Mistral, Groq
- `getSpaceWeather` — NOAA KP index, solar flares, geomagnetic storm alerts
- `getEarthquakeMonitor` — USGS M4+ earthquakes with tsunami risk
- `getShippingRates` — Baltic Dry Index, container rates, port congestion
- `getSemiconductorSupply` — TSMC utilisation, chip lead times, shortage signals

**Additional**
- `getMergerActivity` — M&A deals, rumoured targets, sector consolidation
- `getPrivateEquity` — VC/PE funding rounds, exits, dry powder
- `getRealEstateMarket` — US home prices, mortgage rates, inventory
- `screenSanctions` — OFAC/EU/UN/UK sanctions screening
- `checkAiCompliance` — EU AI Act 2024/1689 risk classification

### Tier 2 — $5–$25/call

- `getB2bIntel` — HOT/WARM/COLD lead scoring via SEC + GitHub + jobs ($5)
- `getGithubVelocity` — Company AI pivot score from GitHub org activity ($5)
- `getJobPivots` — Companies hiring agentic AI roles — buyer intent signal ($5)
- `getSecFilings` — SEC 8-K/10-K with AI relevance scoring ($5)
- `getAiPatents` — USPTO AI patent filings by company ($5)
- `getCompanyProfile` — Full dossier: SEC + GitHub + hiring + patents + sentiment ($5)
- `getWhaleTracker` — BTC/ETH large wallet movements, exchange flows ($5)
- `getFundingRounds` — VC/PE deals with amounts, investors, sector ($5)
- `getCompetitorIntel` — Competitive positioning vs named competitors ($5)
- `getHedgeFunds` — 13F filings: top holdings, new positions, sector rotation ($5)
- `getDaoGovernance` — DAO proposals, voting power, treasury data ($5)
- `getGeopoliticalCrisis` — GDELT crisis scores + oil/gold/USD market impact ($25)

### Bundles — $0.50–$500/call

- `runBundleStarter` — compliance + sentiment + signals + macro + news ($0.50)
- `runBundleMarketIntel` — signals + onchain + macro + options + insider + earnings ($25)
- `runBundleCryptoAlpha` — onchain + whales + DeFi + AI tokens + derivatives ($25)
- `runBundleCompanyDeep` — profile + competitors + hedge funds + analyst + filings ($50)
- `runBundleMacroGlobal` — macro + FX + rates + inflation + consumer + labor ($50)
- `runBundleAiEconomy` — arxiv + github + jobs + model prices + AI tokens + regulatory ($100)
- `runBundleGeopolitical` — GDELT war room + crisis scores + market impact + OFAC ($200)
- `runBundleSovereign` — ALL endpoints: full macro + geopolitical + company + crypto ($500)

## Payment

**Protocol:** x402 (HTTP 402 Payment Required)
**Token:** USDC
**Network:** Base Mainnet (chain 8453)
**Wallet:** `0x2DFe3B1C304DAd9F1b41D780ea81fCd137d810D8`

Compatible with `@x402/fetch`, `@coinbase/x402`, and any x402-aware HTTP client.

## Deployment

**Primary:** https://omni-service-node-production.up.railway.app
**Secondary:** https://omni-service-node.fly.dev
**MCP:** https://omni-service-node-production.up.railway.app/mcp
**x402 Discovery:** https://omni-service-node-production.up.railway.app/.well-known/x402
**Agent Card:** https://omni-service-node-production.up.railway.app/.well-known/agent-card.json
**LLMs.txt:** https://omni-service-node-production.up.railway.app/llms.txt

## License

MIT
