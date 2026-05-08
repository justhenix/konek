/* global process, Buffer */
import crypto from 'crypto';

export const QUOTE_TTL_MS = 2 * 60 * 1000;
export const DEMO_QUOTE_ID_PREFIX = 'demo_quote_v1';

const DEMO_ONLY_QUOTE_SECRET = 'konekpay-demo-quote-secret-change-before-production';

const base64UrlEncode = (value) => (
  Buffer.from(value).toString('base64url')
);

const base64UrlDecode = (value) => (
  Buffer.from(value, 'base64url').toString('utf8')
);

const getQuoteSigningSecret = () => (
  process.env.PAYMENT_QUOTE_SECRET
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || DEMO_ONLY_QUOTE_SECRET
);

const signQuotePayload = (encodedPayload) => (
  crypto
    .createHmac('sha256', getQuoteSigningSecret())
    .update(encodedPayload)
    .digest('base64url')
);

const isEqualSignature = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const createDemoQuoteId = ({
  quoteId = crypto.randomUUID(),
  solAmount,
  exchangeRate,
  fiatAmount,
  fiatCurrency = 'IDR',
  expiresAt,
  createdAt,
  merchantName = '',
  merchantCity = '',
  qrisType = '',
}) => {
  const payload = {
    v: 1,
    quoteId,
    solAmount: String(solAmount),
    exchangeRate: String(exchangeRate),
    fiatAmount,
    fiatCurrency,
    expiresAt,
    createdAt,
    merchantName,
    merchantCity,
    qrisType,
    source: 'DEMO_SIGNED_FALLBACK',
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signQuotePayload(encodedPayload);

  return `${DEMO_QUOTE_ID_PREFIX}.${encodedPayload}.${signature}`;
};

const readDemoQuoteId = (quoteId) => {
  const [prefix, encodedPayload, signature] = String(quoteId).split('.');

  if (prefix !== DEMO_QUOTE_ID_PREFIX || !encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signQuotePayload(encodedPayload);

  if (!isEqualSignature(signature, expectedSignature)) {
    throw new Error('Invalid demo quote signature.');
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));

  if (payload.v !== 1 || !payload.quoteId || !payload.solAmount || !payload.expiresAt) {
    throw new Error('Invalid demo quote payload.');
  }

  return {
    quoteId: payload.quoteId,
    solAmount: payload.solAmount,
    exchangeRate: payload.exchangeRate,
    fiatAmount: payload.fiatAmount,
    fiatCurrency: payload.fiatCurrency || 'IDR',
    expiresAt: payload.expiresAt,
    createdAt: payload.createdAt,
    source: 'DEMO_SIGNED_FALLBACK',
    merchantName: payload.merchantName || '',
    merchantCity: payload.merchantCity || '',
    qrisType: payload.qrisType || '',
  };
};

const loadTransactionQuote = async (quoteId) => {
  try {
    const { getTransactionById } = await import('./transactions.js');
    const transaction = await getTransactionById(quoteId);

    if (!transaction) {
      return null;
    }

    const createdAt = transaction.created_at || new Date().toISOString();
    const expiresAt = transaction.expires_at
      || new Date(new Date(createdAt).getTime() + QUOTE_TTL_MS).toISOString();

    return {
      quoteId: transaction.id,
      solAmount: String(transaction.sol_amount),
      fiatAmount: transaction.idr_amount,
      fiatCurrency: 'IDR',
      expiresAt,
      createdAt,
      source: 'PERSISTED_TRANSACTION',
      walletAddress: transaction.user_wallet,
      merchantName: transaction.merchant_name || '',
      merchantCity: transaction.merchant_city || '',
      qrisType: transaction.qris_type || '',
    };
  } catch (error) {
    console.warn('[QUOTE_PERSISTENCE_UNAVAILABLE]', error.message);
    return null;
  }
};

export const loadQuoteRecord = async (quoteId) => {
  if (String(quoteId).startsWith(`${DEMO_QUOTE_ID_PREFIX}.`)) {
    return readDemoQuoteId(quoteId);
  }

  const persistedQuote = await loadTransactionQuote(quoteId);

  if (persistedQuote) {
    return persistedQuote;
  }

  return readDemoQuoteId(quoteId);
};
