/**
 * TIER 2 — Whale Tracker Service
 * Large wallet movements on ETH and BTC networks
 *
 * Sources (free, no auth):
 *   - Mempool.space: large BTC recent transactions
 *   - DeFi Llama: protocol treasuries / known large wallets
 *   - Etherscan: public ETH large tx list (no key for basic queries)
 */

import axios from "axios";

const MEMPOOL    = "https://mempool.space/api";
const DEFI_LLAMA = "https://api.llama.fi";

// Known whale/exchange addresses (public labels)
const KNOWN_WALLETS = {
  "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503": { label: "Binance 14",    type: "exchange" },
  "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8": { label: "Binance 7",     type: "exchange" },
  "0x28c6c06298d514db089934071355e5743bf21d60": { label: "Binance Hot",   type: "exchange" },
  "0xa09871aeadf4994ca12f5c0b6056bbd1d343c029": { label: "Coinbase 4",    type: "exchange" },
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": { label: "Kraken 4",      type: "exchange" },
  "0x1f9090aae28b8a3dceadf281b0f12828e676c326": { label: "MEV Builder",   type: "mev" },
};

async function fetchBTCLargeTx() {
  const { data } = await axios.get(`${MEMPOOL}/mempool/recent`, {
    timeout: 8000,
  });
  const txs = Array.isArray(data) ? data : [];
  return txs
    .filter(tx => tx.value > 10 * 1e8) // >10 BTC
    .slice(0, 10)
    .map(tx => ({
      chain:  "BTC",
      txid:   tx.txid,
      valueBtc: +(tx.value / 1e8).toFixed(4),
      valueUsd: null, // enriched downstream
      fee:    tx.fee,
      type:   "transfer",
    }));
}

async function fetchProtocolTreasuries() {
  const { data } = await axios.get(`${DEFI_LLAMA}/protocols`, { timeout: 10000 });
  const protocols = Array.isArray(data) ? data : [];
  return protocols
    .filter(p => p.treasury && p.treasury > 1e7)
    .sort((a, b) => b.treasury - a.treasury)
    .slice(0, 15)
    .map(p => ({
      protocol:    p.name,
      chain:       p.chain,
      treasuryUsd: Math.round(p.treasury),
      tvlUsd:      Math.round(p.tvl || 0),
      category:    p.category,
      walletType:  "dao_treasury",
    }));
}

async function fetchLargeETHTx() {
  // Use Etherscan free endpoint — public large block transactions
  const { data } = await axios.get("https://api.etherscan.io/api", {
    params: {
      module:     "proxy",
      action:     "eth_getBlockByNumber",
      tag:        "latest",
      boolean:    true,
      ...(process.env.ETHERSCAN_API_KEY ? { apikey: process.env.ETHERSCAN_API_KEY } : {}),
    },
    timeout: 8000,
    headers: { "User-Agent": "OmniServiceNode/1.0" },
  });
  const txs = data?.result?.transactions || [];
  return txs
    .filter(tx => parseInt(tx.value, 16) > 1e20) // > 100 ETH
    .slice(0, 8)
    .map(tx => ({
      chain:   "ETH",
      hash:    tx.hash,
      from:    tx.from,
      to:      tx.to,
      valueEth: +(parseInt(tx.value, 16) / 1e18).toFixed(2),
      label:   KNOWN_WALLETS[tx.to?.toLowerCase()]?.label
             || KNOWN_WALLETS[tx.from?.toLowerCase()]?.label
             || "Unknown",
      flow:    KNOWN_WALLETS[tx.to?.toLowerCase()]?.type === "exchange"   ? "to_exchange"
             : KNOWN_WALLETS[tx.from?.toLowerCase()]?.type === "exchange" ? "from_exchange"
             : "wallet_to_wallet",
    }));
}

export async function whaleTracker(req, res) {
  const { chain = "all" } = req.query;

  const [btcTx, ethTx, treasuries] = await Promise.all([
    chain !== "eth" ? fetchBTCLargeTx().catch(() => [])          : Promise.resolve([]),
    chain !== "btc" ? fetchLargeETHTx().catch(() => [])          : Promise.resolve([]),
    fetchProtocolTreasuries().catch(() => []),
  ]);

  const toExchange   = ethTx.filter(t => t.flow === "to_exchange").length;
  const fromExchange = ethTx.filter(t => t.flow === "from_exchange").length;
  const flow         = toExchange > fromExchange ? "OUTFLOW_TO_CEX" : fromExchange > toExchange ? "INFLOW_FROM_CEX" : "NEUTRAL";

  res.json({
    status: "ok",
    summary: {
      largeBTCTx:    btcTx.length,
      largeETHTx:    ethTx.length,
      exchangeFlow:  flow,
      signal:        flow === "OUTFLOW_TO_CEX" ? "SELL_PRESSURE" : flow === "INFLOW_FROM_CEX" ? "BUY_PRESSURE" : "NEUTRAL",
    },
    bitcoin: { largeTx: btcTx },
    ethereum: {
      largeTx:    ethTx,
      toExchange,
      fromExchange,
    },
    protocolTreasuries: treasuries.slice(0, 10),
    meta: {
      sources:     ["mempool.space", "api.llama.fi", "etherscan.io"],
      generatedAt: new Date().toISOString(),
    },
  });
}
