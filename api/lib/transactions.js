import { supabaseAdmin } from './supabaseAdmin.js';

// ─────────────────────────────────────────────────────
// TYPES (JSDoc for editor support)
// ─────────────────────────────────────────────────────

/**
 * @typedef {'PENDING' | 'CONFIRMED' | 'SETTLED' | 'FAILED'} TransactionStatus
 */

/**
 * @typedef {Object} TransactionRow
 * @property {string}  id
 * @property {string}  created_at
 * @property {string}  merchant_qris_id
 * @property {number}  idr_amount
 * @property {number}  sol_amount
 * @property {string}  user_wallet
 * @property {string|null} solana_tx_signature
 * @property {TransactionStatus} status
 */

/**
 * @typedef {Object} CreateTransactionInput
 * @property {string} merchant_qris_id
 * @property {number} idr_amount
 * @property {number} sol_amount
 * @property {string} user_wallet
 * @property {TransactionStatus} [status]
 */

/** @type {TransactionStatus[]} */
const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'SETTLED', 'FAILED'];

// ─────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────

/**
 * Insert a new transaction intent.
 *
 * @param {CreateTransactionInput} input
 * @returns {Promise<TransactionRow>} The inserted row.
 * @throws {Error} On validation or Supabase error.
 */
export async function createTransactionIntent(input) {
  const { merchant_qris_id, idr_amount, sol_amount, user_wallet, status } = input;

  // Basic validation
  if (!merchant_qris_id || !user_wallet) {
    throw new Error('merchant_qris_id and user_wallet are required.');
  }
  if (typeof idr_amount !== 'number' || idr_amount <= 0) {
    throw new Error('idr_amount must be a positive number.');
  }
  if (typeof sol_amount !== 'number' || sol_amount <= 0) {
    throw new Error('sol_amount must be a positive number.');
  }
  if (status && !VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status "${status}". Allowed: ${VALID_STATUSES.join(', ')}`);
  }

  const row = {
    merchant_qris_id,
    idr_amount,
    sol_amount,
    user_wallet,
  };

  // Only set status if explicitly provided; DB default is 'PENDING'
  if (status) {
    row.status = status;
  }

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create transaction: ${error.message}`);
  }

  return data;
}

/**
 * Fetch a single transaction by ID.
 *
 * @param {string} id - UUID of the transaction.
 * @returns {Promise<TransactionRow|null>} The row, or null if not found.
 * @throws {Error} On Supabase error (not including "not found").
 */
export async function getTransactionById(id) {
  if (!id) {
    throw new Error('Transaction ID is required.');
  }

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch transaction ${id}: ${error.message}`);
  }

  return data; // null when not found
}

/**
 * Update a transaction's status and optionally its Solana tx signature.
 *
 * @param {string} id - UUID of the transaction.
 * @param {TransactionStatus} status - New status.
 * @param {string} [solanaTxSignature] - On-chain tx signature (optional).
 * @returns {Promise<TransactionRow>} The updated row.
 * @throws {Error} On validation or Supabase error.
 */
export async function updateTransactionStatus(id, status, solanaTxSignature) {
  if (!id) {
    throw new Error('Transaction ID is required.');
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status "${status}". Allowed: ${VALID_STATUSES.join(', ')}`);
  }

  const updates = { status };

  if (solanaTxSignature !== undefined) {
    updates.solana_tx_signature = solanaTxSignature;
  }

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update transaction ${id}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Transaction ${id} not found.`);
  }

  return data;
}
