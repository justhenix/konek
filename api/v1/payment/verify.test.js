/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Ensure env vars are set before importing modules that read them at load time.
process.env.VITE_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';
process.env.TREASURY_WALLET ||= '11111111111111111111111111111111';
process.env.SOLANA_RPC_URL ||= 'https://api.devnet.solana.com';
process.env.PAYMENT_QUOTE_SECRET ||= 'test-quote-secret';

const createMockResponse = () => {
  const headers = new Map();
  return {
    statusCode: 200,
    body: null,
    setHeader(key, value) {
      headers.set(key, value);
    },
    getHeader(key) {
      return headers.get(key);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    headers,
  };
};

// We test the handler's input validation logic by importing it directly.
// The handler calls Solana RPC for actual verification, which we cannot mock
// without restructuring. We focus on pre-RPC validation tests.
const { default: handler } = await import('./verify.js');

describe('verify endpoint — input validation', () => {
  it('rejects non-POST methods', async () => {
    const res = createMockResponse();
    await handler({ method: 'GET', body: {} }, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.body.error, 'METHOD_NOT_ALLOWED');
  });

  it('rejects PUT method', async () => {
    const res = createMockResponse();
    await handler({ method: 'PUT', body: {} }, res);
    assert.equal(res.statusCode, 405);
  });

  it('rejects missing body', async () => {
    const res = createMockResponse();
    await handler({ method: 'POST', body: undefined }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'MISSING_FIELDS');
  });

  it('rejects missing quoteId', async () => {
    const res = createMockResponse();
    await handler({ method: 'POST', body: { signature: 'abc' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'MISSING_FIELDS');
  });

  it('rejects empty quoteId', async () => {
    const res = createMockResponse();
    await handler({ method: 'POST', body: { quoteId: '   ', signature: 'abc' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'MISSING_FIELDS');
  });

  it('rejects missing signature', async () => {
    const res = createMockResponse();
    await handler({ method: 'POST', body: { quoteId: 'some-quote' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'INVALID_SIGNATURE');
  });

  it('rejects empty signature', async () => {
    const res = createMockResponse();
    await handler({ method: 'POST', body: { quoteId: 'some-quote', signature: '' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'INVALID_SIGNATURE');
  });

  it('rejects malformed base58 signature', async () => {
    const res = createMockResponse();
    await handler({ method: 'POST', body: { quoteId: 'some-quote', signature: 'not-base58!!!' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'INVALID_SIGNATURE');
  });

  it('rejects too-short base58 signature', async () => {
    const res = createMockResponse();
    // Valid base58 but too short for a 64-byte Solana signature
    await handler({ method: 'POST', body: { quoteId: 'some-quote', signature: 'abc123' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'INVALID_SIGNATURE');
  });

  it('sets required security headers', async () => {
    const res = createMockResponse();
    await handler({ method: 'POST', body: { quoteId: 'x', signature: 'y' } }, res);
    assert.equal(res.getHeader('X-Content-Type-Options'), 'nosniff');
    assert.equal(res.getHeader('X-Frame-Options'), 'DENY');
    assert.equal(res.getHeader('Cache-Control'), 'no-store');
    assert.equal(res.getHeader('Referrer-Policy'), 'no-referrer');
  });

  it('rejects invalid demo quote signature (tampered)', async () => {
    const res = createMockResponse();
    // A properly formatted demo_quote_v1 but with tampered signature
    const tamperedQuoteId = 'demo_quote_v1.eyJ2IjoxfQ.TAMPERED_SIGNATURE';
    // Use a real 64-byte base58 signature (88 chars of valid base58)
    const fakeSignature = '5'.repeat(88);
    await handler({ method: 'POST', body: { quoteId: tamperedQuoteId, signature: fakeSignature } }, res);
    // Should fail with INVALID_QUOTE (signature check fails)
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'INVALID_QUOTE');
  });

  it('does not leak internal details in error messages', async () => {
    const res = createMockResponse();
    await handler({ method: 'POST', body: { quoteId: 'bad', signature: 'bad' } }, res);
    // Error message should be generic, not contain stack traces
    assert.ok(!String(res.body?.message || '').includes('at '));
    assert.ok(!String(res.body?.message || '').includes('Error:'));
  });
});

describe('verify endpoint — quote validation', () => {
  it('rejects quote that is not found (non-demo, non-persisted ID)', async () => {
    const res = createMockResponse();
    const fakeSignature = '5'.repeat(88);
    await handler({
      method: 'POST',
      body: { quoteId: 'nonexistent-uuid-that-doesnt-exist', signature: fakeSignature },
    }, res);
    // Will fail at loadQuoteRecord — either INVALID_QUOTE or QUOTE_NOT_FOUND
    assert.ok(res.statusCode === 400 || res.statusCode === 404 || res.statusCode === 503);
  });
});
