import crypto from 'crypto';
import bs58 from 'bs58';
import { loadQuoteRecord } from '../../lib/paymentQuotes.js';

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
  const shortId = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `DEMO-SETTLEMENT-${shortId}`;
};

// POST /api/v1/payment/settle-demo
export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return jsonFailure(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is accepted.');
  }

  try {
    const { quoteId, signature } = req.body || {};

    if (typeof quoteId !== 'string' || !quoteId.trim()) {
      return jsonFailure(res, 400, 'MISSING_FIELDS', 'quoteId is required.');
    }

    if (typeof signature !== 'string' || !signature.trim()) {
      return jsonFailure(res, 400, 'MISSING_FIELDS', 'signature is required.');
    }

    if (!isValidSignature(signature)) {
      return jsonFailure(res, 400, 'INVALID_SIGNATURE', 'A valid Solana transaction signature is required.');
    }

    // Try to verify quote exists and is valid
    let quote;

    try {
      quote = await loadQuoteRecord(quoteId.trim());
    } catch {
      return jsonFailure(res, 400, 'SETTLEMENT_NOT_AVAILABLE', 'Settlement quote is invalid or tampered.');
    }

    if (!quote) {
      return jsonFailure(res, 404, 'SETTLEMENT_NOT_AVAILABLE', 'Payment quote was not found. Cannot simulate settlement.');
    }

    // No real Midtrans/Xendit call. This is a demo-only simulation.
    const settlementReference = generateSettlementReference();

    console.info('[DEMO_SETTLEMENT]', {
      quoteId: quoteId.trim(),
      signature: signature.trim(),
      settlementReference,
    });

    return res.status(200).json({
      status: 'SETTLEMENT_SIMULATED',
      settlementReference,
      message: 'Settlement simulated for hackathon demo. No real IDR was disbursed.',
      settledAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[UNHANDLED_SETTLE_DEMO_ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown settlement error',
    });

    return jsonFailure(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  }
}
