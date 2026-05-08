import crypto from 'crypto';
import bs58 from 'bs58';
import { loadQuoteRecord } from '../../lib/paymentQuotes.js';
import { createMockOfframp } from '../../lib/settlement/mockOfframp.js';
import { createMockPayout } from '../../lib/settlement/mockPayout.js';

const jsonFailure = (res, httpStatus, code, message) => (
  res.status(httpStatus).json({
    status: code,
    error: code,
    message,
  })
);

const isValidSignature = (signature) => {
  if (typeof signature !== 'string' || !signature.trim()) {
    return false;
  }

  try {
    return bs58.decode(signature.trim()).length === 64;
  } catch {
    return false;
  }
};

const generateSettlementReference = () => {
  const shortId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
    : crypto.randomBytes(4).toString('hex').toUpperCase();
  return `DEMO-SETTLEMENT-${shortId}`;
};

const deriveExchangeRate = (quote) => {
  const quotedExchangeRate = Number(quote?.exchangeRate);

  if (Number.isFinite(quotedExchangeRate) && quotedExchangeRate > 0) {
    return quotedExchangeRate;
  }

  const fiatAmount = Number(quote?.fiatAmount);
  const solAmount = Number(quote?.solAmount);

  if (Number.isFinite(fiatAmount) && Number.isFinite(solAmount) && solAmount > 0) {
    return fiatAmount / solAmount;
  }

  return 0;
};

// POST /api/v1/payment/settle-demo
export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method !== 'POST') {
    return jsonFailure(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is accepted.');
  }

  try {
    const { quoteId, signature } = req.body || {};
    const normalizedQuoteId = typeof quoteId === 'string' ? quoteId.trim() : '';
    const trimmedSignature = typeof signature === 'string' ? signature.trim() : '';

    if (!normalizedQuoteId) {
      return jsonFailure(res, 400, 'MISSING_FIELDS', 'quoteId is required.');
    }

    if (!trimmedSignature) {
      return jsonFailure(res, 400, 'MISSING_FIELDS', 'signature is required.');
    }

    if (!isValidSignature(trimmedSignature)) {
      return jsonFailure(res, 400, 'INVALID_SIGNATURE', 'A valid Solana transaction signature is required.');
    }

    let quote;

    try {
      quote = await loadQuoteRecord(normalizedQuoteId);
    } catch {
      return jsonFailure(res, 400, 'SETTLEMENT_NOT_AVAILABLE', 'Settlement quote is invalid or tampered.');
    }

    if (!quote) {
      return jsonFailure(res, 404, 'SETTLEMENT_NOT_AVAILABLE', 'Payment quote was not found. Cannot simulate settlement.');
    }

    const settlementReference = generateSettlementReference();
    const exchangeRate = deriveExchangeRate(quote);
    const offramp = createMockOfframp({
      quoteId: normalizedQuoteId,
      signature: trimmedSignature,
      solAmount: quote.solAmount,
      idrAmount: quote.fiatAmount,
      exchangeRate,
    });
    const payout = createMockPayout({
      quoteId: normalizedQuoteId,
      merchantName: quote.merchantName,
      merchantCity: quote.merchantCity,
      amountIdr: quote.fiatAmount,
    });
    const paidVerifiedAt = new Date().toISOString();
    const settledAt = new Date().toISOString();
    const lifecycle = [
      {
        status: 'PAID_VERIFIED',
        label: 'Solana devnet payment verified',
        at: paidVerifiedAt,
      },
      {
        status: 'OFFRAMP_SIMULATED',
        label: 'SOL converted into simulated IDR float',
        at: offramp.createdAt,
      },
      {
        status: 'PAYOUT_SIMULATED_SUCCESS',
        label: 'Simulated payout sent to merchant bank account',
        at: payout.simulatedSettledAt,
      },
      {
        status: 'SETTLED_SIMULATED',
        label: 'Demo settlement completed',
        at: settledAt,
      },
    ];

    console.info('[DEMO_SETTLEMENT]', {
      quoteId: normalizedQuoteId,
      signature: trimmedSignature,
      settlementReference,
    });

    return res.status(200).json({
      status: 'SETTLED_SIMULATED',
      settlementReference,
      quoteId: normalizedQuoteId,
      signature: trimmedSignature,
      onchain: {
        network: 'solana-devnet',
        status: 'PAID_VERIFIED',
        signature: trimmedSignature,
        asset: 'SOL_DEVNET',
        amount: String(quote.solAmount),
      },
      offramp,
      payout,
      lifecycle,
      settledAt,
      disclaimer: 'No real IDR was disbursed. This simulates the licensed settlement rail for hackathon review.',
    });
  } catch (error) {
    console.error('[UNHANDLED_SETTLE_DEMO_ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown settlement error',
    });

    return jsonFailure(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  }
}
