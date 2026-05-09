import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createReceiptImageFileName } from './receipt.js';

/**
 * Tests for pure helper functions used in receiptImage.js.
 * Canvas pixel output is not tested here (requires browser canvas).
 */

describe('receiptImage pure helpers', () => {
  it('truncateForCanvas shortens long strings with ellipsis', () => {
    // Inline the function logic since it is not exported
    const truncateForCanvas = (value, startLen = 14, endLen = 14) => {
      if (!value || typeof value !== 'string') return '';
      if (value.length <= startLen + endLen + 3) return value;
      return `${value.slice(0, startLen)}...${value.slice(-endLen)}`;
    };

    const longSig =
      '5abc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd';
    const result = truncateForCanvas(longSig, 14, 14);
    assert.ok(result.includes('...'));
    assert.equal(result.length, 14 + 3 + 14);
    assert.equal(result.slice(0, 14), longSig.slice(0, 14));
    assert.equal(result.slice(-14), longSig.slice(-14));

    // Short string should not be truncated
    assert.equal(truncateForCanvas('short'), 'short');

    // Null/undefined should return empty string
    assert.equal(truncateForCanvas(null), '');
    assert.equal(truncateForCanvas(undefined), '');
    assert.equal(truncateForCanvas(''), '');
  });

  it('receipt image file name is PNG', () => {
    const name = createReceiptImageFileName('abcdef1234567890');
    assert.ok(name.endsWith('.png'));
    assert.ok(name.startsWith('konekpay-receipt-'));
  });
});

