import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildReceiptSummary, cleanReceiptValue, truncateMiddle } from './receipt.js';
import { translations } from './translations.js';

describe('receipt utilities', () => {
  it('truncates long identifiers without changing short values', () => {
    assert.equal(truncateMiddle('1234567890abcdef', 4, 4), '1234...cdef');
    assert.equal(truncateMiddle('short', 4, 4), 'short');
  });

  it('filters unsafe display placeholders', () => {
    assert.equal(cleanReceiptValue(undefined), '');
    assert.equal(cleanReceiptValue(null), '');
    assert.equal(cleanReceiptValue('[object Object]'), '');
    assert.equal(cleanReceiptValue(' PAID_VERIFIED '), 'PAID_VERIFIED');
  });

  it('builds a compact receipt summary and omits missing fields', () => {
    const summary = buildReceiptSummary({
      title: 'KonekPay receipt',
      fields: [
        { label: 'Merchant', value: 'Sol Chicken' },
        { label: 'Signature', value: '5abc' },
        { label: 'Missing', value: null },
      ],
      disclaimer: 'Devnet demo only.',
    });

    assert.equal(
      summary,
      [
        'KonekPay receipt',
        'Merchant: Sol Chicken',
        'Signature: 5abc',
        '',
        'Devnet demo only.',
      ].join('\n')
    );
  });

  it('has English and Indonesian receipt translations', () => {
    const requiredKeys = [
      'receiptVerifiedBody',
      'receiptSettlementDemoNote',
      'btnCopySignature',
      'btnDownloadReceipt',
      'receiptSummaryTitle',
    ];

    requiredKeys.forEach((key) => {
      assert.equal(typeof translations.en.payment[key], 'string');
      assert.equal(typeof translations.id.payment[key], 'string');
      assert.ok(translations.en.payment[key]);
      assert.ok(translations.id.payment[key]);
    });
  });
});
