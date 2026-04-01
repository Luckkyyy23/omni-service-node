/**
 * TIER 1 — On-Chain Blockchain Intelligence
 * Real-time blockchain data every DeFi/crypto agent needs
 *
 * Sources (all free, no auth):
 *   Mempool.space: Bitcoin — fees, blocks, mempool, difficulty
 *   DeFi Llama:   TVL, yields, protocol rankings — free API
 *   Etherscan:    ETH gas oracle — free (no key for basic queries)
 *   CoinGecko:    BTC/ETH/Base prices + on-chain metrics
 */

import axios from "axios";

const MEMPOOL  = "https://mempool.space/api";
const DEFI_LLAMA = "https://api.llama.fi";
const YIELDS   = "https://yields.llama.fi";
const ETHERSCAN = "https://api.etherscan.io/api";

// Bitcoin network stats from mempool.space (free, no auth)
async function fetchBitcoinStats() {
  const [fees, mempoolInfo, blockHeight, hashrate, difficulty] = await Promise.allSettled([
    axios.get(`${MEMPOOL}/v1/fees/recommended`,             { timeout: 6000 }),
    axios.get(`${MEMPOOL}/mempool`,                          { timeout: 6000 }),
    axios.get(`${MEMPOOL}/blocks/tip/height`,                { timeout: 6000 }),
    axios.get(`${MEMPOOL}/v1/mining/hashrate/3d`,            { timeout: 6000 }),
    axios.get(`${MEMPOOL}/v1/difficulty-adjustment`,         { timeout: 6000 }),
  ]);

  const ok = r => r.status === "fulfilled" ? r.value.data : null;

  const feesData   = ok(fees);
  const mempoolData = ok(mempoolInfo);
  const height     = ok(blockHeight);
  const hashrateData = ok(hashrate);
  const diffData   = ok(difficulty);

  return {
    blockHeight:         height || null,
    fees: feesData ? {
      fastest:   feesData.fastestFee,
      halfHour:  feesData.halfHourFee,
      hour:      feesData.hourFee,
      economy:   feesData.economyFee,
      minimum:   feesData.minimumFee,
    } : null,
    mempool: mempoolData ? {
      txCount:     mempoolData.count,
      vbytes:      mempoolData.vsize,
      totalFeesBTC: (mempoolData.total_fee / 1e8).toFixed(4),
    } : null,
    hashrate: hashrateData?.currentHashrate
      ? `${(hashrateData.currentHashrate / 1e18).toFixed(2)} EH/s`
      : null,
    difficultyAdjustment: diffData ? {
      progressPercent: diffData.progressPercent?.toFixed(1),
      estimatedChange: diffData.difficultyChange?.toFixed(2) + "%",
      remainingBlocks: diffData.remainingBlocks,
      estimatedRetargetDate: diffData.estimatedRetargetDate,
    } : null,
  };
}

// Ethereum gas oracle from Etherscan (free tier, no API key for basic)
async function fetchEthGas() {
  try {
    const params = { module: "gastracker", action: "gasoracle" };
    if (process.env.ETHERSCAN_API_KEY) params.apikey = process.env.ETHERSCAN_API_KEY;
    const { data } = await axios.get(ETHERSCAN, { params, timeout: 6000 });
    if (data.status === "1") {
      return {
        low:    data.result.SafeGasPrice + " Gwei",
        avg:    data.result.ProposeGasPrice + " Gwei",
        fast:   data.result.FastGasPrice + " Gwei",
        baseFee: data.result.suggestBaseFee + " Gwei",
      };
    }
  } catch {}
  return null;
}

// DeFi Llama — total DeFi TVL and top protocols
async function fetchDefiTVL() {
  try {
    const [tvl, protocols] = await Promise.all([
      axios.get(`${DEFI_LLAMA}/v2/historicalChainTvl`, { timeout: 8000 }),
      axios.get(`${DEFI_LLAMA}/protocols`,              { timeout: 8000 }),
    ]);
    const tvlData     = tvl.data;
    const latestTVL   = tvlData[tvlData.length - 1];
    const previousTVL = tvlData[tvlData.length - 8]; // ~7 days ago
    const tvlChange   = latestTVL && previousTVL
      ? (((latestTVL.tvl - previousTVL.tvl) / previousTVL.tvl) * 100).toFixed(2)
      : null;

    const topProtocols = (protocols.data || [])
      .filter(p => p.tvl > 0)
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 10)
      .map(p => ({
        name:    p.name,
        chain:   p.chain,
        tvlUsd:  Math.round(p.tvl),
        change1d: p.change_1d?.toFixed(2),
        category: p.category,
      }));

    return {
      totalTVLUsd:  latestTVL?.tvl ? Math.round(latestTVL.tvl) : null,
      tvlChange7d:  tvlChange ? tvlChange + "%" : null,
      topProtocols,
    };
  } catch { return null; }
}

// DeFi Llama Yields — top yield opportunities (real data, free)
async function fetchTopYields() {
  try {
    const { data } = await axios.get(`${YIELDS}/pools`, { timeout: 8000 });
    return (data.data || [])
      .filter(p => p.tvlUsd > 1_000_000 && p.apy > 0)
      .sort((a, b) => b.apy - a.apy)
      .slice(0, 10)
      .map(p => ({
        pool:    p.pool,
        project: p.project,
        chain:   p.chain,
        symbol:  p.symbol,
        tvlUsd:  Math.round(p.tvlUsd),
        apy:     p.apy?.toFixed(2) + "%",
        apyBase: p.apyBase?.toFixed(2) + "%",
        apyReward: p.apyReward?.toFixed(2) + "%",
        stablecoin: p.stablecoin,
        ilRisk:  p.ilRisk,
      }));
  } catch { return []; }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function onchain(req, res) {
  const { chain = "all" } = req.query; // all | btc | eth | defi

  const [bitcoin, ethGas, defi, yields] = await Promise.allSettled([
    chain !== "eth" && chain !== "defi" ? fetchBitcoinStats() : Promise.resolve(null),
    chain !== "btc" ? fetchEthGas() : Promise.resolve(null),
    chain !== "btc" ? fetchDefiTVL() : Promise.resolve(null),
    chain !== "btc" ? fetchTopYields() : Promise.resolve([]),
  ]);

  const ok = r => r.status === "fulfilled" ? r.value : null;
  const btc = ok(bitcoin);
  const eth = ok(ethGas);
  const defiData = ok(defi);
  const yieldsData = ok(yields);

  // Network congestion signal
  const btcFee = btc?.fees?.fastest;
  const congestion = btcFee
    ? btcFee > 100 ? "HIGH" : btcFee > 30 ? "MEDIUM" : "LOW"
    : null;

  res.json({
    status: "ok",
    snapshot: {
      timestamp:      new Date().toISOString(),
      btcCongestion:  congestion,
      defiSignal:     defiData?.tvlChange7d?.startsWith("-") ? "DEFI_OUTFLOW" : "DEFI_INFLOW",
    },
    bitcoin: btc,
    ethereum: eth ? {
      gasOracle: eth,
      note: "EIP-1559: base fee + priority tip = total gas cost",
    } : null,
    defi: defiData,
    topYields: yieldsData?.slice(0, 10) || [],
    agentContext: {
      summary: [
        btc ? `BTC block #${btc.blockHeight}, fees ${btc.fees?.fastest} sat/vB` : null,
        eth  ? `ETH gas: ${eth.avg} avg` : null,
        defiData ? `DeFi TVL: $${(defiData.totalTVLUsd / 1e9)?.toFixed(1)}B (${defiData.tvlChange7d} 7d)` : null,
      ].filter(Boolean).join(". "),
    },
    meta: {
      sources:    ["mempool.space", "DeFi Llama", "Etherscan", "yields.llama.fi"],
      generatedAt: new Date().toISOString(),
    },
  });
}
