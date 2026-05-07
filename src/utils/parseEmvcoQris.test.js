import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEmvcoQris } from './parseEmvcoQris.js';
import {
  createDemoQrisPayload,
  createStaticDemoQrisPayload,
  DEMO_QRIS_AMOUNT_IDR,
  DEMO_QRIS_MERCHANT_NAME,
  STATIC_DEMO_QRIS_MERCHANT_NAME,
} from './demoQris.js';

describe('parseEmvcoQris', () => {
  it('parses a QRIS payload with Tag 54 as dynamic', () => {
    const parsed = parseEmvcoQris(createDemoQrisPayload());

    assert.equal(parsed.isValid, true);
    assert.equal(parsed.qrisType, 'dynamic');
    assert.equal(parsed.merchantName, DEMO_QRIS_MERCHANT_NAME);
    assert.equal(parsed.amount, DEMO_QRIS_AMOUNT_IDR);
    assert.equal(parsed.amountText, String(DEMO_QRIS_AMOUNT_IDR));
    assert.equal(parsed.tags['54'], String(DEMO_QRIS_AMOUNT_IDR));
  });

  it('parses a QRIS payload without Tag 54 as static', () => {
    const parsed = parseEmvcoQris(createStaticDemoQrisPayload());

    assert.equal(parsed.isValid, true);
    assert.equal(parsed.qrisType, 'static');
    assert.equal(parsed.merchantName, STATIC_DEMO_QRIS_MERCHANT_NAME);
    assert.equal(parsed.merchantCity, 'BANDUNG');
    assert.equal(parsed.amount, null);
    assert.equal(parsed.amountText, '');
    assert.equal(parsed.tags['54'], '');
    assert.ok(!parsed.segments.some((segment) => segment.tag === '54'));
  });

  it('treats an empty Tag 54 as invalid dynamic QRIS', () => {
    const parsed = parseEmvcoQris(createDemoQrisPayload({ amount: '' }));

    assert.equal(parsed.isValid, false);
    assert.equal(parsed.qrisType, 'dynamic');
    assert.equal(parsed.amount, null);
    assert.equal(parsed.tags['54'], '');
  });

  it('keeps the static demo merchant and omits embedded amount', () => {
    const payload = createStaticDemoQrisPayload();
    const parsed = parseEmvcoQris(payload);

    assert.equal(parsed.rawPayload, payload);
    assert.equal(parsed.merchantName, "Sol's Chicken");
    assert.equal(parsed.qrisType, 'static');
    assert.equal(parsed.merchantId, 'DEMO-QRIS-SOLS-CHICKEN');
    assert.equal(parsed.amount, null);
  });
});
