import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStrictQrisAmount,
  extractAmountFromQris,
  parseEmvcoTlv,
} from './quote.js';

// ─────────────────────────────────────────────────────
// Helper: build a minimal EMVCo TLV segment
// ─────────────────────────────────────────────────────
function tlv(tag, value) {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

/**
 * Build a minimal valid QRIS payload with the given Tag 54 amount.
 * Includes Tags 00, 52, 53, 54, 58, 59, 60, and a dummy CRC (63).
 */
function buildQrisPayload(amountStr) {
  let payload = '';
  payload += tlv('00', '01');           // payload format indicator
  payload += tlv('52', '0000');         // MCC
  payload += tlv('53', '360');          // currency IDR
  if (amountStr !== null) {
    payload += tlv('54', amountStr);    // transaction amount
  }
  payload += tlv('58', 'ID');           // country
  payload += tlv('59', 'TEST MERCHANT'); // merchant name
  payload += tlv('60', 'JAKARTA');      // city
  payload += '63040000';                // dummy CRC
  return payload;
}

/**
 * Build a QRIS payload without Tag 54 (no amount).
 */
function buildQrisPayloadWithoutAmount() {
  return buildQrisPayload(null);
}

// ─────────────────────────────────────────────────────
// parseStrictQrisAmount
// ─────────────────────────────────────────────────────

describe('parseStrictQrisAmount', () => {
  describe('valid amounts', () => {
    it('parses plain integer "15000" as 15000', () => {
      assert.equal(parseStrictQrisAmount('15000'), 15000);
    });

    it('parses "50000" as 50000', () => {
      assert.equal(parseStrictQrisAmount('50000'), 50000);
    });

    it('parses "1" as 1 (minimum valid)', () => {
      assert.equal(parseStrictQrisAmount('1'), 1);
    });

    it('parses "1000000000" as 1000000000 (upper bound)', () => {
      assert.equal(parseStrictQrisAmount('1000000000'), 1000000000);
    });

    it('parses "15000.00" as 15000 (trailing .00)', () => {
      assert.equal(parseStrictQrisAmount('15000.00'), 15000);
    });

    it('parses "15000.0" as 15000 (trailing .0)', () => {
      assert.equal(parseStrictQrisAmount('15000.0'), 15000);
    });

    it('trims whitespace before parsing', () => {
      assert.equal(parseStrictQrisAmount('  15000  '), 15000);
    });
  });

  describe('invalid amounts', () => {
    it('rejects "15000abc" (trailing non-numeric)', () => {
      assert.throws(() => parseStrictQrisAmount('15000abc'), /invalid characters/);
    });

    it('rejects "15000 IDR" (trailing currency label)', () => {
      assert.throws(() => parseStrictQrisAmount('15000 IDR'), /invalid characters/);
    });

    it('rejects "15,000" (commas)', () => {
      assert.throws(() => parseStrictQrisAmount('15,000'), /invalid characters/);
    });

    it('rejects "1e5" (exponent notation)', () => {
      assert.throws(() => parseStrictQrisAmount('1e5'), /invalid characters/);
    });

    it('rejects "0x10" (hex notation)', () => {
      assert.throws(() => parseStrictQrisAmount('0x10'), /invalid characters/);
    });

    it('rejects empty string ""', () => {
      assert.throws(() => parseStrictQrisAmount(''), /empty/);
    });

    it('rejects whitespace-only string "   "', () => {
      assert.throws(() => parseStrictQrisAmount('   '), /empty/);
    });

    it('rejects "0" (zero)', () => {
      assert.throws(() => parseStrictQrisAmount('0'), /greater than zero/);
    });

    it('rejects "0.00" (zero with decimals)', () => {
      assert.throws(() => parseStrictQrisAmount('0.00'), /greater than zero/);
    });

    it('rejects "-15000" (negative)', () => {
      assert.throws(() => parseStrictQrisAmount('-15000'), /invalid characters/);
    });

    it('rejects "abc15000" (leading non-numeric)', () => {
      assert.throws(() => parseStrictQrisAmount('abc15000'), /invalid characters/);
    });

    it('rejects "$15000" (currency symbol)', () => {
      assert.throws(() => parseStrictQrisAmount('$15000'), /invalid characters/);
    });

    it('rejects "15000.50" (non-zero fractional)', () => {
      assert.throws(() => parseStrictQrisAmount('15000.50'), /invalid characters/);
    });

    it('rejects "15000.123" (more than 2 decimal places)', () => {
      assert.throws(() => parseStrictQrisAmount('15000.123'), /invalid characters/);
    });

    it('rejects null', () => {
      assert.throws(() => parseStrictQrisAmount(null), /empty/);
    });

    it('rejects undefined', () => {
      assert.throws(() => parseStrictQrisAmount(undefined), /empty/);
    });

    it('rejects amount above upper bound', () => {
      assert.throws(() => parseStrictQrisAmount('1000000001'), /out of bounds/);
    });
  });
});

// ─────────────────────────────────────────────────────
// parseEmvcoTlv
// ─────────────────────────────────────────────────────

describe('parseEmvcoTlv', () => {
  it('parses a single TLV segment', () => {
    const result = parseEmvcoTlv('540515000');
    assert.equal(result['54'], '15000');
  });

  it('parses multiple TLV segments', () => {
    const payload = tlv('00', '01') + tlv('54', '15000') + tlv('58', 'ID');
    const result = parseEmvcoTlv(payload);
    assert.equal(result['00'], '01');
    assert.equal(result['54'], '15000');
    assert.equal(result['58'], 'ID');
  });

  it('returns empty object for empty string', () => {
    const result = parseEmvcoTlv('');
    assert.deepEqual(result, {});
  });

  it('handles truncated payload gracefully', () => {
    // Payload claims length 99 but value is only 3 chars
    const result = parseEmvcoTlv('549915000');
    // Should stop parsing (truncated), return what was parsed before
    assert.deepEqual(result, {});
  });

  it('handles malformed length gracefully', () => {
    const result = parseEmvcoTlv('54xx15000');
    assert.deepEqual(result, {});
  });
});

// ─────────────────────────────────────────────────────
// extractAmountFromQris
// ─────────────────────────────────────────────────────

describe('extractAmountFromQris', () => {
  it('extracts 15000 from a valid QRIS payload with Tag 54 = "15000"', () => {
    const payload = buildQrisPayload('15000');
    assert.equal(extractAmountFromQris(payload), 15000);
  });

  it('extracts 50000 from a QRIS payload with Tag 54 = "50000"', () => {
    const payload = buildQrisPayload('50000');
    assert.equal(extractAmountFromQris(payload), 50000);
  });

  it('extracts 15000 from a QRIS payload with Tag 54 = "15000.00"', () => {
    const payload = buildQrisPayload('15000.00');
    assert.equal(extractAmountFromQris(payload), 15000);
  });

  it('throws on QRIS payload missing Tag 54', () => {
    const payload = buildQrisPayloadWithoutAmount();
    assert.throws(() => extractAmountFromQris(payload), /missing transaction amount/i);
  });

  it('throws on QRIS payload with invalid amount in Tag 54', () => {
    const payload = buildQrisPayload('15000abc');
    assert.throws(() => extractAmountFromQris(payload), /invalid characters/);
  });

  it('throws on QRIS payload with zero amount', () => {
    const payload = buildQrisPayload('0');
    assert.throws(() => extractAmountFromQris(payload), /greater than zero/);
  });

  it('throws on malformed TLV payload', () => {
    // Completely broken payload - too short even for one tag
    assert.throws(() => extractAmountFromQris('xx'), /missing transaction amount/i);
  });

  it('throws on empty payload', () => {
    assert.throws(() => extractAmountFromQris(''), /missing transaction amount/i);
  });
});
