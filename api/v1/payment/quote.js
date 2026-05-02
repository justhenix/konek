import Decimal from 'decimal.js';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────
const QUOTE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const PYTH_HERMES_LATEST_PRICE_URL = 'https://hermes.pyth.network/v2/updates/price/latest';
const PYTH_SOL_USD_FEED_ID = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
const PYTH_USD_IDR_FEED_ID = '0x6693afcd49878bbd622e46bd805e7177932cf6ab0b1c91b135d71151b9207433';
const USD_IDR_FALLBACK_URL = 'https://open.er-api.com/v6/latest/USD';

// Configure Decimal.js for high precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─────────────────────────────────────────────────────
// RATE CACHE (persists across warm invocations)
// ─────────────────────────────────────────────────────
const RATE_CACHE_MS = 15_000; // 15s
let cachedRate = null;
let cachedAt = 0;

function normalizePythId(id) {
  return String(id ?? '').replace(/^0x/i, '').toLowerCase();
}

function buildPythLatestPriceUrl(priceIds) {
  const idsQuery = priceIds.map((id) => `ids[]=${encodeURIComponent(id)}`).join('&');
  return `${PYTH_HERMES_LATEST_PRICE_URL}?${idsQuery}&parsed=true&ignore_invalid_price_ids=true`;
}

async function fetchJsonWithTimeout(url, sourceName, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const error = new Error(
        `${sourceName} rate limited (HTTP 429${retryAfter ? `, retry after ${retryAfter}s` : ''})`
      );
      error.code = sourceName === 'Pyth Hermes' ? 'PYTH_RATE_LIMITED' : 'FX_RATE_LIMITED';
      throw error;
    }

    if (!res.ok) {
      throw new Error(`${sourceName} failed (HTTP ${res.status})`);
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function decimalFromPythPrice(price, label) {
  const rawPrice = price?.price;
  const expo = Number(price?.expo);

  if (typeof rawPrice !== 'string' || !Number.isInteger(expo)) {
    throw new Error(`Invalid Pyth price payload for ${label}`);
  }

  const value = new Decimal(rawPrice).times(new Decimal(10).pow(expo));

  if (!value.isFinite() || value.lte(0)) {
    throw new Error(`Invalid Pyth price for ${label}`);
  }

  return value;
}

function getPythParsedPrice(data, feedId, label) {
  const normalizedFeedId = normalizePythId(feedId);
  const feed = data?.parsed?.find((item) => normalizePythId(item.id) === normalizedFeedId);

  if (!feed?.price) {
    throw new Error(`Pyth feed ${label} is unavailable`);
  }

  return decimalFromPythPrice(feed.price, label);
}

async function fetchUsdIdrFallbackRate() {
  const data = await fetchJsonWithTimeout(USD_IDR_FALLBACK_URL, 'USD/IDR fallback FX API');
  const rate = data?.rates?.IDR;

  if (typeof rate !== 'number' || rate <= 0 || !Number.isFinite(rate)) {
    throw new Error('Invalid USD/IDR fallback FX rate');
  }

  return new Decimal(rate);
}

/**
 * Fetch live SOL/IDR exchange rate from Pyth Network Hermes.
 *
 * Pyth Network logic:
 * - Fetch SOL/USD from Hermes with the hackathon-required Pyth feed.
 * - Fetch USD/IDR from Hermes with Pyth's FX feed.
 * - Derive SOL/IDR as SOL/USD * USD/IDR.
 * - If the USD/IDR Pyth feed is unavailable, fall back to an external FX API.
 *
 * Returns Decimal instance. Throws on network/parse failure.
 */
async function fetchSolIdrRate() {
  const now = Date.now();

  if (cachedRate && (now - cachedAt) < RATE_CACHE_MS) {
    return cachedRate;
  }

  const pythData = await fetchJsonWithTimeout(
    buildPythLatestPriceUrl([PYTH_SOL_USD_FEED_ID, PYTH_USD_IDR_FEED_ID]),
    'Pyth Hermes'
  );

  const solUsdRate = getPythParsedPrice(pythData, PYTH_SOL_USD_FEED_ID, 'SOL/USD');
  let usdIdrRate;

  try {
    usdIdrRate = getPythParsedPrice(pythData, PYTH_USD_IDR_FEED_ID, 'USD/IDR');
  } catch (pythUsdIdrError) {
    console.warn('[PYTH_USD_IDR_UNAVAILABLE]', pythUsdIdrError.message);
    usdIdrRate = await fetchUsdIdrFallbackRate();
  }

  const solIdrRate = solUsdRate.times(usdIdrRate);

  if (!solIdrRate.isFinite() || solIdrRate.lte(0)) {
    throw new Error('Invalid derived SOL/IDR rate');
  }

  cachedRate = solIdrRate;
  cachedAt = now;

  return cachedRate;
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
      const isPythRateLimited = oracleErr.code === 'PYTH_RATE_LIMITED';
      console.error(isPythRateLimited ? '[ORACLE_RATE_LIMIT]' : '[ORACLE_FAILURE]', oracleErr.message);
      return res.status(503).json({
        error: 'ORACLE_UNAVAILABLE',
        message: isPythRateLimited
          ? 'Pyth Hermes price feed is rate limited. Retry shortly.'
          : 'Pyth price feed is temporarily unavailable. Retry shortly.',
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
