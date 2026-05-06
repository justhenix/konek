// Quick script to test the quote API with the actual demo QRIS payload
// Uses the same CRC logic as the frontend

function calculateCrc16(payload) {
  let crc = 0xFFFF;
  const bytes = new TextEncoder().encode(payload);
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag, value) {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

function buildMerchantAccount(acquirerId, reference) {
  const inner = tlv('00', acquirerId) + tlv('01', reference);
  return tlv('26', inner);
}

// Replicate createDemoQrisPayload from demoQris.js
function createDemoQrisPayload() {
  let payload = '';
  payload += tlv('00', '01');
  payload += tlv('01', '12');
  payload += buildMerchantAccount('ID.CO.KONEKPAY.DEMO', 'DEMO-QRIS-001');
  payload += tlv('52', '0000');
  payload += tlv('53', '360');
  payload += tlv('54', '15000');
  payload += tlv('58', 'ID');
  payload += tlv('59', 'KANTIN 165 DEMO');
  payload += tlv('60', 'JAKARTA');
  const payloadWithCrcTag = `${payload}6304`;
  const crc = calculateCrc16(payloadWithCrcTag);
  return `${payloadWithCrcTag}${crc}`;
}

const demoPayload = createDemoQrisPayload();
console.log('Demo QRIS payload:', demoPayload);
console.log('Length:', demoPayload.length);
console.log('Starts with 000201:', demoPayload.startsWith('000201'));
console.log('Contains 6304:', demoPayload.includes('6304'));

// Test against the API
const API_URL = 'http://localhost:3000/api/v1/payment/quote';

// Test 1: Demo QRIS
console.log('\n--- Test 1: Demo QRIS ---');
try {
  const res1 = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qrisPayload: demoPayload }),
  });
  const body1 = await res1.json();
  console.log('Status:', res1.status);
  console.log('Body:', JSON.stringify(body1, null, 2));
} catch (e) {
  console.error('Fetch error:', e.message);
}

// Test 2: Static QRIS without amount + manual amount
console.log('\n--- Test 2: Static QRIS + manual idrAmount ---');
let staticPayload = '';
staticPayload += tlv('00', '01');
staticPayload += tlv('01', '11'); // static
staticPayload += buildMerchantAccount('ID.CO.KONEKPAY.DEMO', 'DEMO-QRIS-002');
staticPayload += tlv('52', '0000');
staticPayload += tlv('53', '360');
// no Tag 54
staticPayload += tlv('58', 'ID');
staticPayload += tlv('59', 'TEST MERCHANT');
staticPayload += tlv('60', 'JAKARTA');
const staticWithCrc = `${staticPayload}6304`;
const staticCrc = calculateCrc16(staticWithCrc);
const staticFull = `${staticWithCrc}${staticCrc}`;
console.log('Static QRIS payload:', staticFull);

try {
  const res2 = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qrisPayload: staticFull, idrAmount: '25000' }),
  });
  const body2 = await res2.json();
  console.log('Status:', res2.status);
  console.log('Body:', JSON.stringify(body2, null, 2));
} catch (e) {
  console.error('Fetch error:', e.message);
}
