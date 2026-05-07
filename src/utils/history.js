import { formatDateTime } from './dateFormat.js';
import { cleanReceiptValue } from './receipt.js';

export const HISTORY_STORAGE_PREFIX = 'konekpay:history';
export const HISTORY_UPDATED_EVENT = 'konekpay:history-updated';
const MAX_HISTORY_RECORDS = 50;
const VERIFIED_STATUS = 'paid_verified';

const normalizeWalletAddress = (walletAddress) => cleanReceiptValue(walletAddress);

export const getWalletHistoryStorageKey = (walletAddress) => {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  return normalizedWallet ? `${HISTORY_STORAGE_PREFIX}:${normalizedWallet}` : '';
};

const getStorage = (storage) => (
  storage || (typeof localStorage !== 'undefined' ? localStorage : null)
);

const parseHistoryRecords = (value) => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const cleanNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const normalizeQrisType = (qrisType) => {
  const normalizedType = cleanReceiptValue(qrisType).toLowerCase();
  return normalizedType === 'static' || normalizedType === 'dynamic' ? normalizedType : '';
};

export const normalizeHistoryRecord = (record, walletAddress) => {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const normalizedWallet = normalizeWalletAddress(walletAddress || record.walletAddress);
  const recordWallet = normalizeWalletAddress(record.walletAddress || normalizedWallet);

  if (!normalizedWallet || recordWallet !== normalizedWallet) {
    return null;
  }

  const signature = cleanReceiptValue(record.signature);
  const quoteId = cleanReceiptValue(record.quoteId);
  const timestamp = cleanReceiptValue(record.timestamp || record.verifiedAt || record.paidAt || record.createdAt)
    || new Date().toISOString();

  return {
    id: cleanReceiptValue(record.id) || signature || quoteId || `${timestamp}:${recordWallet}`,
    source: cleanReceiptValue(record.source) || 'local_demo',
    merchantName: cleanReceiptValue(record.merchantName),
    merchantCity: cleanReceiptValue(record.merchantCity),
    merchantReference: cleanReceiptValue(record.merchantReference),
    qrisType: normalizeQrisType(record.qrisType),
    qrisTypeLabel: cleanReceiptValue(record.qrisTypeLabel),
    idrAmount: cleanNumber(record.idrAmount ?? record.amountIdr),
    idrAmountLabel: cleanReceiptValue(record.idrAmountLabel),
    solAmount: cleanReceiptValue(record.solAmount ?? record.amountSol),
    solAmountLabel: cleanReceiptValue(record.solAmountLabel),
    status: cleanReceiptValue(record.status) || 'unknown',
    statusLabel: cleanReceiptValue(record.statusLabel),
    walletAddress: recordWallet,
    signature,
    explorerUrl: cleanReceiptValue(record.explorerUrl),
    timestamp,
    quoteId,
    network: cleanReceiptValue(record.network) || 'devnet',
    networkLabel: cleanReceiptValue(record.networkLabel) || 'Solana Devnet',
    settlementDisclaimer: cleanReceiptValue(record.settlementDisclaimer),
  };
};

export const readWalletHistory = ({ walletAddress, storage } = {}) => {
  const store = getStorage(storage);
  const key = getWalletHistoryStorageKey(walletAddress);

  if (!store || !key) {
    return [];
  }

  return parseHistoryRecords(store.getItem(key))
    .map((record) => normalizeHistoryRecord(record, walletAddress))
    .filter(Boolean)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const saveVerifiedReceiptToHistory = ({ walletAddress, record, storage } = {}) => {
  const normalizedRecord = normalizeHistoryRecord(record, walletAddress);

  if (!normalizedRecord || normalizedRecord.status !== VERIFIED_STATUS) {
    return false;
  }

  const store = getStorage(storage);
  const key = getWalletHistoryStorageKey(walletAddress);

  if (!store || !key) {
    return false;
  }

  const existingRecords = readWalletHistory({ walletAddress, storage: store });
  const nextRecords = [
    normalizedRecord,
    ...existingRecords.filter((item) => (
      item.id !== normalizedRecord.id
      && (!normalizedRecord.signature || item.signature !== normalizedRecord.signature)
    )),
  ].slice(0, MAX_HISTORY_RECORDS);

  store.setItem(key, JSON.stringify(nextRecords));

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(HISTORY_UPDATED_EVENT, {
      detail: { walletAddress: normalizeWalletAddress(walletAddress) },
    }));
  }

  return true;
};

const getHistoryRecordDedupeKey = (record) => {
  const normalizedRecord = normalizeHistoryRecord(record, record?.walletAddress);

  if (!normalizedRecord) {
    return '';
  }

  if (normalizedRecord.signature) return `sig:${normalizedRecord.signature}`;
  if (normalizedRecord.quoteId) return `quote:${normalizedRecord.quoteId}`;
  return `id:${normalizedRecord.id}`;
};

export const mergeWalletHistoryRecords = ({
  walletAddress,
  backendRecords = [],
  localRecords = [],
} = {}) => {
  const mergedRecords = [];
  const seenKeys = new Set();

  [...backendRecords, ...localRecords].forEach((record) => {
    const normalizedRecord = normalizeHistoryRecord(record, walletAddress);
    const key = getHistoryRecordDedupeKey(normalizedRecord);

    if (!normalizedRecord || !key || seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    mergedRecords.push(normalizedRecord);
  });

  return mergedRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const fetchWalletHistoryFromBackend = async ({
  walletAddress,
  fetchImpl,
} = {}) => {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  const requestFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);

  if (!normalizedWallet || !requestFetch) {
    return [];
  }

  const response = await requestFetch(
    `/api/v1/payment/history?wallet=${encodeURIComponent(normalizedWallet)}`,
    { headers: { Accept: 'application/json' } }
  );
  let responseBody = null;

  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const error = new Error(responseBody?.message || 'Unable to load backend history.');
    error.apiError = responseBody || null;
    throw error;
  }

  return Array.isArray(responseBody?.records)
    ? responseBody.records
      .map((record) => normalizeHistoryRecord({ ...record, source: 'supabase' }, normalizedWallet))
      .filter(Boolean)
    : [];
};

export const buildHistoryExportText = ({
  walletAddress,
  records = [],
  language = 'en',
  generatedAt = new Date().toISOString(),
  labels = {},
} = {}) => {
  const label = (key, fallback) => cleanReceiptValue(labels[key]) || fallback;
  const lines = [
    label('title', 'KonekPay transaction history'),
    `${label('wallet', 'Wallet')}: ${cleanReceiptValue(walletAddress)}`,
    `${label('generatedAt', 'Generated')}: ${formatDateTime(generatedAt, language)}`,
    '',
    label('disclaimer', 'Local demo history only. Merchant settlement is simulated.'),
  ];

  records.forEach((record, index) => {
    const normalizedRecord = normalizeHistoryRecord(record, walletAddress);
    if (!normalizedRecord) return;

    lines.push(
      '',
      `${index + 1}. ${normalizedRecord.merchantName || label('missing', 'Not provided')}`,
      `${label('qrisType', 'QRIS Type')}: ${normalizedRecord.qrisTypeLabel || normalizedRecord.qrisType}`,
      `${label('idrAmount', 'IDR Amount')}: ${normalizedRecord.idrAmountLabel || normalizedRecord.idrAmount || ''}`,
      `${label('solAmount', 'SOL Amount')}: ${normalizedRecord.solAmountLabel || normalizedRecord.solAmount || ''}`,
      `${label('status', 'Status')}: ${normalizedRecord.statusLabel || normalizedRecord.status}`,
      `${label('signature', 'Signature')}: ${normalizedRecord.signature}`,
      `${label('explorerUrl', 'Explorer URL')}: ${normalizedRecord.explorerUrl}`,
      `${label('timestamp', 'Timestamp')}: ${formatDateTime(normalizedRecord.timestamp, language)}`,
      `${label('quoteId', 'Quote ID')}: ${normalizedRecord.quoteId}`,
      `${label('network', 'Network')}: ${normalizedRecord.networkLabel}`
    );
  });

  return lines
    .map((line) => cleanReceiptValue(line))
    .filter((line, index, allLines) => line || allLines[index - 1])
    .join('\n');
};
