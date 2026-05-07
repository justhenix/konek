import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import handler, { isValidWalletAddress, normalizeHistoryLimit } from './history.js';

const createMockResponse = () => {
  const headers = new Map();
  return {
    statusCode: 200,
    body: null,
    setHeader(key, value) {
      headers.set(key, value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
};

describe('payment history endpoint', () => {
  it('validates wallet addresses', () => {
    const wallet = Keypair.generate().publicKey.toBase58();
    assert.equal(isValidWalletAddress(wallet), true);
    assert.equal(isValidWalletAddress('not-a-wallet'), false);
    assert.equal(isValidWalletAddress(''), false);
  });

  it('normalizes history limits', () => {
    assert.equal(normalizeHistoryLimit(undefined), 50);
    assert.equal(normalizeHistoryLimit('10'), 10);
    assert.equal(normalizeHistoryLimit('500'), 50);
    assert.equal(normalizeHistoryLimit('-1'), 50);
  });

  it('rejects missing wallet query parameter', async () => {
    const res = createMockResponse();
    await handler({ method: 'GET', query: {} }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'MISSING_WALLET');
  });

  it('rejects invalid wallet query parameter', async () => {
    const res = createMockResponse();
    await handler({ method: 'GET', query: { wallet: 'not-a-wallet' } }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'INVALID_WALLET');
  });

  it('rejects non-GET methods', async () => {
    const res = createMockResponse();
    await handler({ method: 'POST', query: {} }, res);

    assert.equal(res.statusCode, 405);
    assert.equal(res.body.error, 'METHOD_NOT_ALLOWED');
  });
});
