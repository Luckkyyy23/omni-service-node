/**
 * Base Mainnet USDC Payment Middleware
 * Real USDC on Base — no CDP keys, no gas fees from server, no third parties.
 *
 * Flow:
 *   1. Agent calls any /api/v1/* or /api/v2/* endpoint
 *   2. Server returns 402 with payment instructions (nonce + wallet + amount)
 *   3. Agent sends USDC directly to wallet on Base Mainnet (they pay ~$0.001 gas)
 *   4. Agent resends request with X-PAYMENT: <txHash> header
 *   5. Server verifies tx on Base Mainnet via public RPC (free, no auth)
 *   6. Data served
 *
 * Base Mainnet USDC contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 * Public Base RPC: https://mainnet.base.org
 */

import crypto from "crypto";

// Base Mainnet config
const BASE_RPC        = "https://mainnet.base.org";
const USDC_CONTRACT   = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS   = 6;

// Pending payment nonces — in-memory (good for single instance)
// Key: nonce, Value: { price, endpoint, issuedAt }
const pendingNonces = new Map();
const usedTxHashes  = new Set();

// Cleanup stale nonces every 10 min
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [nonce, data] of pendingNonces) {
    if (data.issuedAt < cutoff) pendingNonces.delete(nonce);
  }
}, 10 * 60 * 1000);

// Convert USDC price string ($0.005) to on-chain units (5000)
function priceToUnits(priceStr) {
  const dollars = parseFloat(priceStr.replace("$", ""));
  return Math.round(dollars * Math.pow(10, USDC_DECIMALS));
}

// Verify USDC transfer on Base Mainnet using public RPC
async function verifyUsdcTransfer(txHash, expectedAmountUnits, recipientAddress) {
  try {
    // Get transaction receipt
    const resp = await fetch(BASE_RPC, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }),
    });
    const { result: receipt } = await resp.json();
    if (!receipt || receipt.status !== "0x1") return { valid: false, reason: "tx not confirmed or failed" };

    // Parse ERC-20 Transfer event logs
    // Transfer(address indexed from, address indexed to, uint256 value)
    // topic0 = keccak256("Transfer(address,address,uint256)")
    const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

    const usdcLogs = receipt.logs.filter(log =>
      log.address.toLowerCase() === USDC_CONTRACT.toLowerCase() &&
      log.topics[0] === TRANSFER_TOPIC
    );

    for (const log of usdcLogs) {
      // topics[2] = to address (padded to 32 bytes)
      const to = "0x" + log.topics[2].slice(26); // last 20 bytes
      if (to.toLowerCase() !== recipientAddress.toLowerCase()) continue;

      // data = uint256 value
      const value = BigInt(log.data);
      if (value >= BigInt(expectedAmountUnits)) {
        return { valid: true, amount: value.toString() };
      }
    }

    return { valid: false, reason: "no matching USDC transfer found in tx" };
  } catch (e) {
    return { valid: false, reason: `rpc error: ${e.message}` };
  }
}

// Build the 402 response body
function build402Response(nonce, priceStr, endpoint, walletAddress) {
  const amountUnits = priceToUnits(priceStr);
  return {
    x402Version: 2,
    error: "Payment Required",
    accepts: [{
      scheme:    "direct-transfer",
      network:   "eip155:8453",
      token:     "USDC",
      contract:  USDC_CONTRACT,
      payTo:     walletAddress,
      maxAmountRequired: String(amountUnits),
      price:     priceStr,
      nonce,
      instructions: [
        `1. Send exactly ${priceStr} USDC (${amountUnits} units) to ${walletAddress} on Base Mainnet (chain ID 8453)`,
        `2. USDC contract: ${USDC_CONTRACT}`,
        `3. Resend your request with header: X-PAYMENT: <txHash>`,
        `4. Payment window: 10 minutes`,
      ].join(" | "),
    }],
  };
}

// ── Middleware factory ──────────────────────────────────────────────────────
export function createPaymentMiddleware(routes, walletAddress) {
  return async (req, res, next) => {
    const routeKey = `${req.method} ${req.path}`;

    // Find matching route
    const route = routes[routeKey];
    if (!route) return next();

    const priceStr = route.price; // e.g. "$0.005"

    // ── Check for payment header ───────────────────────────────────────────
    const paymentHeader = req.headers["x-payment"];

    if (paymentHeader) {
      const txHash = paymentHeader.trim();

      // Prevent replay attacks
      if (usedTxHashes.has(txHash)) {
        return res.status(402).json({ error: "Payment already used", code: "REPLAY_DETECTED" });
      }

      const amountUnits = priceToUnits(priceStr);
      const verification = await verifyUsdcTransfer(txHash, amountUnits, walletAddress);

      if (verification.valid) {
        usedTxHashes.add(txHash);
        // Pass through to actual handler
        req.paymentVerified = true;
        req.paymentTxHash   = txHash;
        return next();
      } else {
        return res.status(402).json({
          error: "Payment verification failed",
          reason: verification.reason,
          instructions: `Send ${priceStr} USDC to ${walletAddress} on Base Mainnet, then resend with X-PAYMENT: <txHash>`,
        });
      }
    }

    // ── No payment header — issue 402 ────────────────────────────────────
    const nonce = crypto.randomUUID();
    pendingNonces.set(nonce, { price: priceStr, endpoint: req.path, issuedAt: Date.now() });

    res.status(402)
      .set("Content-Type", "application/json")
      .json(build402Response(nonce, priceStr, req.path, walletAddress));
  };
}
