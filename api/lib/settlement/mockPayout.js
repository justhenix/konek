import crypto from 'crypto';

const createShortId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

export function createMockPayout({ quoteId, merchantName, merchantCity, amountIdr }) {
  const normalizedMerchantName = merchantName || 'DEMO MERCHANT';

  return {
    provider: 'MOCK_PAYOUT',
    status: 'PAYOUT_SIMULATED_SUCCESS',
    reference: `DEMO-PAYOUT-${createShortId()}`,
    quoteId,
    amount: Number(amountIdr),
    currency: 'IDR',
    destination: {
      merchantName: normalizedMerchantName,
      merchantCity: merchantCity || 'SURAKARTA',
      bankCode: 'BCA',
      bankName: 'Bank Central Asia',
      accountNumberMasked: '****1234',
      accountHolderName: normalizedMerchantName,
    },
    createdAt: new Date().toISOString(),
    simulatedSettledAt: new Date().toISOString(),
    disclaimer: 'Simulated payout only. No real IDR was disbursed.',
  };
}
