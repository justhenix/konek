/**
 * scripts/check-env.mjs
 *
 * Pre-flight check: ensures required environment variables are present
 * for local Vercel dev. Loads .env.local manually so it works outside
 * the app runtime.
 *
 * Usage:  npm run dev:check-env
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(__dirname, '..', '.env.local');

// ── Load .env.local manually ────────────────────────────────────────
function loadEnvFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    console.error(`\n✖  Could not read ${filePath}`);
    console.error('   Copy .env.example → .env.local and fill in real values.\n');
    process.exit(1);
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const raw = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    const value = raw.replace(/^(['"])(.*)\1$/, '$2');

    // Don't overwrite vars already in the environment
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────
function shorten(value) {
  if (!value) return '(missing)';
  if (value.length <= 12) return value;
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

function printVar(key, { secret = false } = {}) {
  const value = process.env[key];
  const present = Boolean(value);
  const icon = present ? '✔' : '✖';
  let display;

  if (!present) {
    display = '(missing)';
  } else if (secret) {
    display = 'set';
  } else if (/RPC_URL/i.test(key)) {
    display = value;
  } else {
    display = shorten(value);
  }

  console.log(`  ${icon}  ${key.padEnd(32)} ${display}`);
  return present;
}

// ── Main ────────────────────────────────────────────────────────────
loadEnvFile(ENV_FILE);

console.log('\n── KonekPay local env check ──────────────────────────\n');
console.log(`Source: ${ENV_FILE}`);
console.log('Use the same required values in Vercel Environment Variables for deployed builds.\n');

const frontendRequired = [
  { key: 'VITE_SOLANA_RPC_URL' },
  { key: 'VITE_TREASURY_WALLET' },
];

const backendRequired = [
  { key: 'SOLANA_RPC_URL' },
  { key: 'TREASURY_WALLET' },
  { key: 'PAYMENT_QUOTE_SECRET', secret: true },
];

const optional = [
  { key: 'VITE_PUBLIC_SUPABASE_URL' },
  { key: 'VITE_PUBLIC_SUPABASE_ANON_KEY', secret: true },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', secret: true },
  { key: 'MIDTRANS_SERVER_KEY', secret: true },
];

let missing = 0;

console.log('Required for frontend build / deployed Vercel:');
for (const { key, secret } of frontendRequired) {
  if (!printVar(key, { secret })) missing++;
}

console.log('\nRequired for backend API / deployed Vercel:');
for (const { key, secret } of backendRequired) {
  if (!printVar(key, { secret })) missing++;
}

console.log('\nOptional:');
for (const { key, secret } of optional) {
  printVar(key, { secret });
}

console.log('\nDeployment notes:');
console.log('  - Add required variables in Vercel Dashboard -> Project -> Settings -> Environment Variables.');
console.log('  - Select Production, Preview, and Development for payment testing.');
console.log('  - Redeploy after changing VITE_* variables because Vite bakes them into the frontend bundle.');

console.log('');

if (missing > 0) {
  console.error(`✖  ${missing} required variable(s) missing. Fix .env.local.\n`);
  process.exit(1);
} else {
  console.log('✔  All required variables present. Ready for vercel dev.\n');
  process.exit(0);
}
