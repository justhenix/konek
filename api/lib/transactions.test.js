/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.VITE_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const {
  listTransactionsByWallet,
  mapTransactionRowToHistoryRecord,
  updateTransactionStatus,
} = await import('./transactions.js');

const createMockSupabaseClient = (rows, queryState = {}) => ({
  from(table) {
    queryState.table = table;
    return {
      select(columns) {
        queryState.columns = columns;
        return this;
      },
      eq(column, value) {
        queryState.eq = { column, value };
        return this;
      },
      order(column, options) {
        queryState.order = { column, options };
        return this;
      },
      limit(value) {
        queryState.limit = value;
        return Promise.resolve({ data: rows, error: null });
      },
    };
  },
});

describe('transaction history helpers', () => {
  it('maps transaction rows to public history records', () => {
    const record = mapTransactionRowToHistoryRecord({
      id: 'quote-1',
      created_at: '2026-05-07T07:35:00.000Z',
      merchant_qris_id: 'QRIS-001',
      idr_amount: 25000,
      sol_amount: 0.1,
      user_wallet: 'WalletA111',
      solana_tx_signature: 'abc123',
      status: 'CONFIRMED',
    });

    assert.deepEqual(record, {
      id: 'quote-1',
      quoteId: 'quote-1',
      walletAddress: 'WalletA111',
      merchantName: '',
      merchantCity: '',
      merchantReference: 'QRIS-001',
      qrisType: '',
      amountIdr: 25000,
      amountSol: '0.1',
      status: 'CONFIRMED',
      signature: 'abc123',
      explorerUrl: 'https://explorer.solana.com/tx/abc123?cluster=devnet',
      createdAt: '2026-05-07T07:35:00.000Z',
      timestamp: '2026-05-07T07:35:00.000Z',
      network: 'devnet',
      networkLabel: 'Solana Devnet',
      source: 'supabase',
    });
  });

  it('lists only the requested wallet and limits newest-first query size', async () => {
    const queryState = {};
    const client = createMockSupabaseClient([
      {
        id: 'quote-1',
        created_at: '2026-05-07T07:35:00.000Z',
        merchant_qris_id: 'QRIS-001',
        idr_amount: 25000,
        sol_amount: 0.1,
        user_wallet: 'WalletA111',
        solana_tx_signature: 'abc123',
        status: 'CONFIRMED',
      },
    ], queryState);

    const records = await listTransactionsByWallet('WalletA111', {
      client,
      limit: 500,
    });

    assert.equal(queryState.table, 'transactions');
    assert.match(queryState.columns, /user_wallet/);
    assert.match(queryState.columns, /merchant_name/);
    assert.match(queryState.columns, /verified_at/);
    assert.deepEqual(queryState.eq, { column: 'user_wallet', value: 'WalletA111' });
    assert.deepEqual(queryState.order, { column: 'created_at', options: { ascending: false } });
    assert.equal(queryState.limit, 50);
    assert.equal(records.length, 1);
    assert.equal(records[0].walletAddress, 'WalletA111');
  });

  it('persists verified status with signature, source wallet, and verified timestamp', async () => {
    const queryState = {};
    const client = {
      from(table) {
        queryState.table = table;
        return {
          update(updates) {
            queryState.updates = updates;
            return this;
          },
          eq(column, value) {
            queryState.eq = { column, value };
            return this;
          },
          select() {
            return this;
          },
          single() {
            return Promise.resolve({
              data: {
                id: 'quote-1',
                ...queryState.updates,
              },
              error: null,
            });
          },
        };
      },
    };

    await updateTransactionStatus('quote-1', 'CONFIRMED', 'abc123', {
      walletAddress: 'WalletA111',
      client,
    });

    assert.equal(queryState.table, 'transactions');
    assert.deepEqual(queryState.eq, { column: 'id', value: 'quote-1' });
    assert.equal(queryState.updates.status, 'CONFIRMED');
    assert.equal(queryState.updates.solana_tx_signature, 'abc123');
    assert.equal(queryState.updates.user_wallet, 'WalletA111');
    assert.match(queryState.updates.verified_at, /^\d{4}-\d{2}-\d{2}T/);
  });
});
