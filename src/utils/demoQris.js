import { calculateCrc16 } from './parseEmvcoQris';

// ─────────────────────────────────────────────────────
// Demo QRIS Payload Generator
// ─────────────────────────────────────────────────────
// Generates synthetic EMVCo-compliant QRIS payloads for
// hackathon demo / dev testing. These payloads pass the
// parser and feed into the real quote → Phantom → verify
// flow. They do NOT represent a real merchant acquirer.
// ─────────────────────────────────────────────────────

export const DEMO_QRIS_MERCHANT_NAME = 'KANTIN 165 DEMO';
export const DEMO_QRIS_AMOUNT_IDR = 15000;

const DEMO_DEFAULTS = {
  payloadFormatIndicator: '01',      // Tag 00 — always "01"
  pointOfInitiationMethod: '12',     // Tag 01 — "12" = dynamic QR
  merchantAccountInfo: '26',         // Tag 26 — merchant account (sub-TLV)
  merchantAccountId: 'ID.CO.KONEKPAY.DEMO',
  merchantAccountReference: 'DEMO-QRIS-001',
  mcc: '0000',                       // Tag 52 — Merchant Category Code
  currency: '360',                   // Tag 53 — IDR = 360
  countryCode: 'ID',                 // Tag 58 — Indonesia
  city: 'JAKARTA',                   // Tag 60
};

/**
 * Encode a single EMVCo TLV segment: [2-char tag][2-char length][value].
 */
const tlv = (tag, value) => {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
};

/**
 * Build a merchant account sub-TLV (Tag 26) with acquirer ID and reference.
 */
const buildMerchantAccount = (acquirerId, reference) => {
  const inner = tlv('00', acquirerId) + tlv('01', reference);
  return tlv('26', inner);
};

/**
 * Create a valid EMVCo QRIS payload string with correct CRC.
 *
 * @param {Object} [options]
 * @param {string} [options.merchantName]  Merchant display name (Tag 59)
 * @param {number} [options.amount]        IDR amount (Tag 54)
 * @param {string} [options.currency]      ISO 4217 numeric code (Tag 53)
 * @param {string} [options.city]          Merchant city (Tag 60)
 * @param {string} [options.countryCode]   2-letter country code (Tag 58)
 * @returns {string} Complete EMVCo QRIS payload with CRC
 */
export const createDemoQrisPayload = ({
  merchantName = DEMO_QRIS_MERCHANT_NAME,
  amount = DEMO_QRIS_AMOUNT_IDR,
  currency = DEMO_DEFAULTS.currency,
  city = DEMO_DEFAULTS.city,
  countryCode = DEMO_DEFAULTS.countryCode,
} = {}) => {
  const amountStr = String(amount);

  // Build TLV segments in EMVCo order
  let payload = '';
  payload += tlv('00', DEMO_DEFAULTS.payloadFormatIndicator);   // Tag 00
  payload += tlv('01', DEMO_DEFAULTS.pointOfInitiationMethod);  // Tag 01
  payload += buildMerchantAccount(                               // Tag 26
    DEMO_DEFAULTS.merchantAccountId,
    DEMO_DEFAULTS.merchantAccountReference,
  );
  payload += tlv('52', DEMO_DEFAULTS.mcc);                      // Tag 52
  payload += tlv('53', currency);                                // Tag 53
  payload += tlv('54', amountStr);                               // Tag 54
  payload += tlv('58', countryCode);                             // Tag 58
  payload += tlv('59', merchantName);                            // Tag 59
  payload += tlv('60', city);                                    // Tag 60

  // Tag 63 — CRC placeholder then compute
  const payloadWithCrcTag = `${payload}6304`;
  const crc = calculateCrc16(payloadWithCrcTag);

  return `${payloadWithCrcTag}${crc}`;
};

/**
 * Get the default demo QRIS payload.
 * Convenience wrapper for one-click demo scanning.
 *
 * @returns {string} EMVCo QRIS payload string
 */
export const getDemoQrisPayload = () => createDemoQrisPayload();
