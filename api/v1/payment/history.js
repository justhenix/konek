import { PublicKey } from '@solana/web3.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;

const jsonFailure = (res, httpStatus, code, message) => (
  res.status(httpStatus).json({
    status: code,
    error: code,
    message,
  })
);

const readQueryParam = (req, key) => {
  if (req.query && typeof req.query[key] === 'string') {
    return req.query[key];
  }

  try {
    const requestUrl = new URL(req.url || '', 'http://localhost');
    return requestUrl.searchParams.get(key) || '';
  } catch {
    return '';
  }
};

export const isValidWalletAddress = (walletAddress) => {
  if (typeof walletAddress !== 'string' || !walletAddress.trim()) {
    return false;
  }

  try {
    const normalizedWallet = walletAddress.trim();
    return new PublicKey(normalizedWallet).toBase58() === normalizedWallet;
  } catch {
    return false;
  }
};

export const normalizeHistoryLimit = (value) => {
  const numericValue = Number.parseInt(String(value ?? DEFAULT_LIMIT), 10);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(numericValue, MAX_LIMIT);
};

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return jsonFailure(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is accepted.');
  }

  const walletAddress = readQueryParam(req, 'wallet').trim();

  if (!walletAddress) {
    return jsonFailure(res, 400, 'MISSING_WALLET', 'wallet query parameter is required.');
  }

  if (!isValidWalletAddress(walletAddress)) {
    return jsonFailure(res, 400, 'INVALID_WALLET', 'wallet must be a valid Solana wallet address.');
  }

  try {
    const { listTransactionsByWallet } = await import('../../lib/transactions.js');
    const records = await listTransactionsByWallet(walletAddress, {
      limit: normalizeHistoryLimit(readQueryParam(req, 'limit')),
    });

    return res.status(200).json({
      status: 'OK',
      source: 'supabase',
      walletAddress,
      records,
    });
  } catch (error) {
    console.warn('[PAYMENT_HISTORY_UNAVAILABLE]', {
      message: error instanceof Error ? error.message : 'Unknown history error',
    });

    return jsonFailure(
      res,
      503,
      'HISTORY_UNAVAILABLE',
      'Supabase transaction history is unavailable. Use local demo history fallback.'
    );
  }
}
