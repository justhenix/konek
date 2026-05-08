import crypto from 'crypto';

const createShortId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

export function createMockOfframp({ quoteId, signature, solAmount, idrAmount, exchangeRate }) {
  return {
    provider: 'MOCK_OFFRAMP',
    status: 'IDR_FLOAT_CREDITED',
    reference: `DEMO-OFFRAMP-${createShortId()}`,
    quoteId,
    signature,
    fromAsset: 'SOL_DEVNET',
    fromAmount: String(solAmount),
    toAsset: 'IDR_SIMULATED',
    toAmount: Number(idrAmount),
    exchangeRate: Number(exchangeRate || 0),
    createdAt: new Date().toISOString(),
    disclaimer: 'Simulated off-ramp only. No real crypto was sold for IDR.',
  };
}
