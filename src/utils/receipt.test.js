import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceiptSummary,
  cleanReceiptValue,
  createReceiptImageFileName,
  truncateMiddle,
} from './receipt.js';
import { humanizePaymentLabel, translations } from './translations.js';

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

  it('creates PNG receipt file names without changing text receipt exports', () => {
    assert.equal(
      createReceiptImageFileName('abcdef1234567890', 'konekpay-receipt'),
      'konekpay-receipt-abcdef12.png'
    );
  });

  it('humanizes payment and settlement enum labels for receipt UI', () => {
    assert.equal(humanizePaymentLabel('PAID_VERIFIED'), 'Payment verified');
    assert.equal(humanizePaymentLabel('SETTLED_SIMULATED'), 'Settlement simulated');
    assert.equal(humanizePaymentLabel('PAYOUT_SIMULATED_SUCCESS'), 'Payout simulation complete');
    assert.equal(humanizePaymentLabel('IDR_FLOAT_CREDITED'), 'Simulated IDR balance credited');
    assert.equal(humanizePaymentLabel('MOCK_OFFRAMP'), 'Demo off-ramp');
    assert.equal(humanizePaymentLabel('MOCK_PAYOUT'), 'Demo payout rail');
    assert.equal(humanizePaymentLabel('SOL_DEVNET'), 'SOL on Solana Devnet');
    assert.equal(humanizePaymentLabel('IDR_SIMULATED'), 'Simulated IDR');
    assert.equal(humanizePaymentLabel('UNKNOWN_STATUS'), 'Unknown Status');
    assert.equal(humanizePaymentLabel(null), 'Not available');
  });

  it('has English and Indonesian receipt translations', () => {
    const requiredKeys = [
      'receiptVerifiedBody',
      'receiptSettlementDemoNote',
      'btnCopySignature',
      'btnDownloadReceipt',
      'receiptSummaryTitle',
      'receiptStatusVerified',
      'btnCopyTxId',
      'txIdCopied',
      'btnNewScan',
      'technicalDetailsTitle',
      'demoSettlementDetailsTitle',
      'lblTransactionId',
      'lblPaymentStatus',
      'lblExplorerUrl',
      'receiptSettlementSimulated',
      'verifyingSubtitle',
      'verifyStepSubmitted',
      'verifyStepChecking',
      'verifyStepReceipt',
      'verifyFailedTitle',
      'verifyFailedBody',
      'btnRetryVerification',
    ];

    requiredKeys.forEach((key) => {
      assert.equal(typeof translations.en.payment[key], 'string');
      assert.equal(typeof translations.id.payment[key], 'string');
      assert.ok(translations.en.payment[key]);
      assert.ok(translations.id.payment[key]);
    });

    const requiredReceiptKeys = [
      'shareTitle',
      'shareText',
      'shareTextWithUrl',
      'downloadFileName',
      'shareUnsupported',
      'imageFailed',
      'downloadReceipt',
      'shareReceipt',
      'copyTransaction',
      'noRealIdr',
    ];

    requiredReceiptKeys.forEach((key) => {
      assert.equal(typeof translations.en.receipt[key], 'string');
      assert.equal(typeof translations.id.receipt[key], 'string');
      assert.ok(translations.en.receipt[key]);
      assert.ok(translations.id.receipt[key]);
    });
  });
});
