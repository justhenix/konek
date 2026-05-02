/* global process */
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────
// ENV VALIDATION
// ─────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error(
    '[SUPABASE_ADMIN] Missing NEXT_PUBLIC_SUPABASE_URL. ' +
    'Add it to .env.local and restart the dev server.'
  );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    '[SUPABASE_ADMIN] Missing SUPABASE_SERVICE_ROLE_KEY. ' +
    'Add it to .env.local and restart the dev server. ' +
    'This key must NEVER be exposed to the browser.'
  );
}

// ─────────────────────────────────────────────────────
// ADMIN CLIENT (server-only, uses service_role key)
// ─────────────────────────────────────────────────────
// WARNING: This client bypasses Row Level Security.
// Only import in api/ serverless functions.
// NEVER import in src/ frontend code.
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
