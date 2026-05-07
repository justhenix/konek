import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHistoryExportText,
  fetchWalletHistoryFromBackend,
  getWalletHistoryStorageKey,
  mergeWalletHistoryRecords,
  readWalletHistory,
  saveVerifiedReceiptToHistory,
} from './history.js';
import { translations } from './translations.js';

const createMemoryStorage = () => {
  const values = new Map();

  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const createVerifiedRecord = (overrides = {}) => ({
  merchantName: 'Sol Chicken',
  merchantCity: 'Jakarta',
  qrisType: 'dynamic',
  idrAmount: 25000,
  idrAmountLabel: 'Rp 25.000',
  solAmount: '0.1',
  solAmountLabel: '0.1 SOL',
  status: 'paid_verified',
  walletAddress: 'WalletA111',
  signature: 'abc123signature',
  explorerUrl: 'https://explorer.solana.com/tx/abc123signature?cluster=devnet',
  timestamp: '2026-05-07T07:35:00.000Z',
  quoteId: 'quote-1',
  network: 'devnet',
  networkLabel: 'Solana Devnet',
  settlementDisclaimer: 'Merchant settlement is simulated.',
  ...overrides,
});

describe('wallet history utilities', () => {
  it('uses wallet-scoped localStorage keys', () => {
    assert.equal(getWalletHistoryStorageKey('WalletA111'), 'konekpay:history:WalletA111');
    assert.equal(getWalletHistoryStorageKey(''), '');
  });

  it('saves and reads only verified records for the connected wallet', () => {
    const storage = createMemoryStorage();
    assert.equal(saveVerifiedReceiptToHistory({
      walletAddress: 'WalletA111',
      record: createVerifiedRecord(),
      storage,
    }), true);
    assert.equal(saveVerifiedReceiptToHistory({
      walletAddress: 'WalletB222',
      record: createVerifiedRecord({ walletAddress: 'WalletB222', signature: 'sig-b' }),
      storage,
    }), true);

    const records = readWalletHistory({ walletAddress: 'WalletA111', storage });
    assert.equal(records.length, 1);
    assert.equal(records[0].walletAddress, 'WalletA111');
    assert.equal(records[0].signature, 'abc123signature');
  });

  it('does not save pending or failed records as successful history', () => {
    const storage = createMemoryStorage();
    assert.equal(saveVerifiedReceiptToHistory({
      walletAddress: 'WalletA111',
      record: createVerifiedRecord({ status: 'pending' }),
      storage,
    }), false);
    assert.equal(saveVerifiedReceiptToHistory({
      walletAddress: 'WalletA111',
      record: createVerifiedRecord({ status: 'failed' }),
      storage,
    }), false);
    assert.deepEqual(readWalletHistory({ walletAddress: 'WalletA111', storage }), []);
  });

  it('deduplicates by signature for repeat receipt saves', () => {
    const storage = createMemoryStorage();
    const record = createVerifiedRecord();
    saveVerifiedReceiptToHistory({ walletAddress: 'WalletA111', record, storage });
    saveVerifiedReceiptToHistory({
      walletAddress: 'WalletA111',
      record: { ...record, merchantName: 'Updated Store' },
      storage,
    });

    const records = readWalletHistory({ walletAddress: 'WalletA111', storage });
    assert.equal(records.length, 1);
    assert.equal(records[0].merchantName, 'Updated Store');
  });

  it('exports wallet history as text with localized date formatting', () => {
    const text = buildHistoryExportText({
      walletAddress: 'WalletA111',
      records: [createVerifiedRecord()],
      language: 'en',
      generatedAt: '2026-05-07T07:35:00.000Z',
      labels: {
        title: 'KonekPay transaction history',
        wallet: 'Wallet',
        generatedAt: 'Generated',
        disclaimer: 'Local demo history only.',
      },
    });

    assert.match(text, /KonekPay transaction history/);
    assert.match(text, /Wallet: WalletA111/);
    assert.match(text, /Generated: May 7, 2026/);
    assert.match(text, /Sol Chicken/);
    assert.match(text, /abc123signature/);
  });

  it('merges backend and local records without duplicate signatures', () => {
    const localRecord = createVerifiedRecord({ source: 'local_demo' });
    const backendRecord = createVerifiedRecord({
      source: 'supabase',
      merchantName: 'Backend Store',
    });

    const records = mergeWalletHistoryRecords({
      walletAddress: 'WalletA111',
      backendRecords: [backendRecord],
      localRecords: [localRecord],
    });

    assert.equal(records.length, 1);
    assert.equal(records[0].source, 'supabase');
    assert.equal(records[0].merchantName, 'Backend Store');
  });

  it('normalizes backend history records from the API', async () => {
    const records = await fetchWalletHistoryFromBackend({
      walletAddress: 'WalletA111',
      fetchImpl: async (url) => {
        assert.equal(url, '/api/v1/payment/history?wallet=WalletA111');
        return {
          ok: true,
          json: async () => ({
            records: [{
              id: 'quote-1',
              walletAddress: 'WalletA111',
              amountIdr: 25000,
              amountSol: '0.1',
              status: 'CONFIRMED',
              signature: 'abc123signature',
              createdAt: '2026-05-07T07:35:00.000Z',
              source: 'supabase',
            }],
          }),
        };
      },
    });

    assert.equal(records.length, 1);
    assert.equal(records[0].source, 'supabase');
    assert.equal(records[0].idrAmount, 25000);
    assert.equal(records[0].solAmount, '0.1');
  });

  it('throws when backend history is unavailable so callers can use local fallback', async () => {
    await assert.rejects(
      fetchWalletHistoryFromBackend({
        walletAddress: 'WalletA111',
        fetchImpl: async () => ({
          ok: false,
          json: async () => ({ error: 'HISTORY_UNAVAILABLE', message: 'Unavailable' }),
        }),
      }),
      /Unavailable/
    );
  });

  it('has English and Indonesian history translations', () => {
    const requiredKeys = [
      'history',
      'transactionHistory',
      'connectWalletToView',
      'noTransactions',
      'viewReceipt',
      'exportHistory',
      'printHistory',
      'localDemoNotice',
      'backendUnavailable',
      'showingLocalDemoHistory',
      'unableToLoadHistory',
      'retryHistoryLoad',
      'statusPaidVerified',
    ];

    requiredKeys.forEach((key) => {
      assert.equal(typeof translations.en.history[key], 'string');
      assert.equal(typeof translations.id.history[key], 'string');
      assert.ok(translations.en.history[key]);
      assert.ok(translations.id.history[key]);
    });
  });
});
