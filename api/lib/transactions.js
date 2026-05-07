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
 * @property {string}  [expires_at]
 * @property {string}  [merchant_name]
 * @property {string}  [merchant_city]
 * @property {string}  [qris_type]
 * @property {string}  [updated_at]
 * @property {string}  [paid_at]
 * @property {string}  [verified_at]
 * @property {string}  [network]
 */

/**
 * @typedef {Object} CreateTransactionInput
 * @property {string} merchant_qris_id
 * @property {number} idr_amount
 * @property {number} sol_amount
 * @property {string} user_wallet
 * @property {TransactionStatus} [status]
 * @property {string} [merchant_name]
 * @property {string} [merchant_city]
 * @property {string} [qris_type]
 * @property {string} [expires_at]
 * @property {string} [network]
 */

/** @type {TransactionStatus[]} */
const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'SETTLED', 'FAILED'];
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 50;
const HISTORY_SELECT_COLUMNS = [
  'id',
  'created_at',
  'merchant_qris_id',
  'idr_amount',
  'sol_amount',
  'user_wallet',
  'solana_tx_signature',
  'status',
  'expires_at',
  'merchant_name',
  'merchant_city',
  'qris_type',
  'network',
  'updated_at',
  'paid_at',
  'verified_at',
].join(',');

const buildExplorerUrl = (signature) => (
  signature
    ? `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`
    : ''
);

const cleanString = (value) => (
  typeof value === 'string' && value.trim() ? value.trim() : ''
);

const cleanNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const normalizeHistoryLimit = (limit) => {
  const numericLimit = Number.parseInt(String(limit ?? DEFAULT_HISTORY_LIMIT), 10);

  if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(numericLimit, MAX_HISTORY_LIMIT);
};

export const mapTransactionRowToHistoryRecord = (row) => {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const walletAddress = cleanString(row.user_wallet);
  const signature = cleanString(row.solana_tx_signature);
  const createdAt = cleanString(row.created_at);
  const verifiedAt = cleanString(row.verified_at || row.paid_at || row.updated_at);

  if (!walletAddress || !row.id) {
    return null;
  }

  const network = cleanString(row.network) || 'devnet';

  return {
    id: cleanString(row.id),
    quoteId: cleanString(row.id),
    walletAddress,
    merchantName: cleanString(row.merchant_name),
    merchantCity: cleanString(row.merchant_city),
    merchantReference: cleanString(row.merchant_qris_id),
    qrisType: cleanString(row.qris_type),
    amountIdr: cleanNumber(row.idr_amount),
    amountSol: row.sol_amount === null || row.sol_amount === undefined
      ? ''
      : String(row.sol_amount),
    status: cleanString(row.status),
    signature,
    explorerUrl: buildExplorerUrl(signature),
    createdAt,
    timestamp: verifiedAt || createdAt,
    network,
    networkLabel: network.toLowerCase() === 'devnet' ? 'Solana Devnet' : network,
    source: 'supabase',
  };
};

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
  const {
    merchant_qris_id,
    idr_amount,
    sol_amount,
    user_wallet,
    status,
    merchant_name,
    merchant_city,
    qris_type,
    expires_at,
    network,
  } = input;

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
    network: network || 'devnet',
  };

  if (merchant_name) row.merchant_name = merchant_name;
  if (merchant_city) row.merchant_city = merchant_city;
  if (qris_type) row.qris_type = qris_type;
  if (expires_at) row.expires_at = expires_at;

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
 * @param {{ walletAddress?: string, client?: typeof supabaseAdmin }} [extra]
 * @returns {Promise<TransactionRow>} The updated row.
 * @throws {Error} On validation or Supabase error.
 */
export async function updateTransactionStatus(id, status, solanaTxSignature, extra = {}) {
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

  if (status === 'CONFIRMED') {
    const verifiedAt = new Date().toISOString();
    updates.verified_at = verifiedAt;
    updates.paid_at = verifiedAt;
  }

  updates.updated_at = new Date().toISOString();

  if (extra.walletAddress) {
    updates.user_wallet = extra.walletAddress;
  }

  const client = extra.client || supabaseAdmin;
  const { data, error } = await client
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

/**
 * List transactions for one wallet, newest first.
 *
 * @param {string} walletAddress
 * @param {{ limit?: number, client?: typeof supabaseAdmin }} [options]
 * @returns {Promise<Array<ReturnType<typeof mapTransactionRowToHistoryRecord>>>}
 */
export async function listTransactionsByWallet(walletAddress, options = {}) {
  const normalizedWallet = cleanString(walletAddress);

  if (!normalizedWallet) {
    throw new Error('Wallet address is required.');
  }

  const limit = normalizeHistoryLimit(options.limit);
  const client = options.client || supabaseAdmin;
  const { data, error } = await client
    .from('transactions')
    .select(HISTORY_SELECT_COLUMNS)
    .eq('user_wallet', normalizedWallet)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list transactions for wallet: ${error.message}`);
  }

  return (Array.isArray(data) ? data : [])
    .map(mapTransactionRowToHistoryRecord)
    .filter(Boolean);
}
