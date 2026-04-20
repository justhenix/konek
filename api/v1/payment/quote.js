import Decimal from 'decimal.js';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────
const QUOTE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=idr';

// Configure Decimal.js for high precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─────────────────────────────────────────────────────
// RATE CACHE (persists across warm invocations)
// ─────────────────────────────────────────────────────
const RATE_CACHE_MS = 15_000; // 15s
let cachedRate = null;
let cachedAt = 0;

/**
 * Fetch live SOL/IDR exchange rate from CoinGecko.
 * Returns Decimal instance. Throws on network/parse failure.
 */
async function fetchSolIdrRate() {
  const now = Date.now();

  if (cachedRate && (now - cachedAt) < RATE_CACHE_MS) {
    return cachedRate;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(COINGECKO_URL, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`CoinGecko HTTP ${res.status}`);
    }

    const data = await res.json();
    const idrPrice = data?.solana?.idr;

    if (typeof idrPrice !== 'number' || idrPrice <= 0 || !Number.isFinite(idrPrice)) {
      throw new Error('Invalid price data from oracle');
    }

    cachedRate = new Decimal(idrPrice);
    cachedAt = now;

    return cachedRate;
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────
// EMVCo TLV PARSER
// ─────────────────────────────────────────────────────

/**
 * Parse EMVCo QR TLV string into a flat map of { tag: value }.
 * EMVCo format: [2-char tag][2-char length][value of that length], repeated.
 */
function parseEmvcoTlv(payload) {
  const tags = {};
  let pos = 0;

  while (pos < payload.length) {
    if (pos + 4 > payload.length) break; // need at least tag(2) + len(2)

    const tag = payload.substring(pos, pos + 2);
    const len = parseInt(payload.substring(pos + 2, pos + 4), 10);

    if (isNaN(len) || len < 0) break; // malformed
    if (pos + 4 + len > payload.length) break; // truncated

    const value = payload.substring(pos + 4, pos + 4 + len);
    tags[tag] = value;
    pos += 4 + len;
  }

  return tags;
}

/**
 * Extract transaction amount (Tag 54) from QRIS EMVCo payload.
 * Returns integer IDR amount, or null if not found/invalid.
 *
 * Tag 54 = "Transaction Amount" in EMVCo spec.
 * QRIS amounts are in IDR (no decimal subdivision).
 */
function extractAmountFromQris(payload) {
  const tags = parseEmvcoTlv(payload);
  const rawAmount = tags['54'];

  if (!rawAmount) return null;

  // Parse as number — QRIS Tag 54 can be "50000" or "50000.00"
  const parsed = parseFloat(rawAmount);

  if (isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) return null;

  // IDR has no decimal subdivision — round to integer
  const intAmount = Math.round(parsed);

  // Sanity bounds: 1 IDR to 1B IDR
  if (intAmount < 1 || intAmount > 1_000_000_000) return null;

  return intAmount;
}

// ─────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────

function isValidQrisPayload(payload) {
  if (typeof payload !== 'string') return false;
  if (payload.length < 20 || payload.length > 1000) return false;
  if (!payload.startsWith('000201')) return false;
  if (!payload.includes('6304')) return false;
  if (!/^[A-Za-z0-9.@\-+:/ ]+$/.test(payload)) return false;
  return true;
}

// ─────────────────────────────────────────────────────
// VERCEL SERVERLESS HANDLER
// POST /api/v1/payment/quote
// ─────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');

  // Method guard
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only POST is accepted.',
    });
  }

  try {
    const { qrisPayload } = req.body;

    // ── Input Validation ──────────────────────────────
    if (qrisPayload === undefined) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'qrisPayload is required.',
      });
    }

    if (!isValidQrisPayload(qrisPayload)) {
      return res.status(400).json({
        error: 'INVALID_QRIS_PAYLOAD',
        message: 'qrisPayload must be a valid EMVCo QRIS string.',
      });
    }

    // ── Extract Amount from QRIS (zero-trust) ─────────
    // Server parses Tag 54 directly. Client fiatAmount is IGNORED.
    const fiatAmount = extractAmountFromQris(qrisPayload);

    if (!fiatAmount) {
      return res.status(400).json({
        error: 'MISSING_AMOUNT',
        message: 'QRIS payload does not contain a valid transaction amount (Tag 54).',
      });
    }

    // ── Oracle: Fetch Live Rate ───────────────────────
    let exchangeRateDecimal;
    try {
      exchangeRateDecimal = await fetchSolIdrRate();
    } catch (oracleErr) {
      console.error('[ORACLE_FAILURE]', oracleErr.message);
      return res.status(503).json({
        error: 'ORACLE_UNAVAILABLE',
        message: 'Price feed is temporarily unavailable. Retry shortly.',
      });
    }

    // ── Server-Side Computation (safe math) ───────────
    const fiatDecimal = new Decimal(fiatAmount);
    const solAmount = fiatDecimal.dividedBy(exchangeRateDecimal);

    // Cap at 9 decimal places (SOL = 9 lamport decimals)
    const solAmountStr = solAmount.toDecimalPlaces(9, Decimal.ROUND_UP).toString();

    // ── Generate Quote ────────────────────────────────
    const quoteId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = new Date(now + QUOTE_TTL_MS).toISOString();

    // ── Response ──────────────────────────────────────
    return res.status(200).json({
      quoteId,
      solAmount: solAmountStr,
      exchangeRate: exchangeRateDecimal.toString(),
      fiatAmount,
      fiatCurrency: 'IDR',
      expiresAt,
      createdAt: new Date(now).toISOString(),
    });

  } catch (err) {
    // Catch-all: never leak internals
    console.error('[UNHANDLED_QUOTE_ERROR]', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    });
  }
}
