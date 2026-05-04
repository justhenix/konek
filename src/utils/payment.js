export const LAMPORTS_PER_SOL = 1_000_000_000n;

const SOL_AMOUNT_PATTERN = /^(\d+)(?:\.(\d{1,9}))?$/;

const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const solToLamports = (solAmount) => {
  if (typeof solAmount !== 'string') {
    throw new TypeError('SOL amount must be a string.');
  }

  const normalizedAmount = solAmount.trim();

  if (!normalizedAmount || normalizedAmount.startsWith('-')) {
    throw new RangeError('SOL amount must be a non-negative value.');
  }

  const match = normalizedAmount.match(SOL_AMOUNT_PATTERN);

  if (!match) {
    throw new RangeError('SOL amount must be a decimal string with up to 9 decimal places.');
  }

  const [, wholeSol, fractionalSol = ''] = match;
  const wholeLamports = BigInt(wholeSol) * LAMPORTS_PER_SOL;
  const fractionalLamports = BigInt(fractionalSol.padEnd(9, '0'));

  return wholeLamports + fractionalLamports;
};

export const formatIdrAmount = (amount) => {
  const numericAmount = typeof amount === 'bigint' ? Number(amount) : amount;

  if (!Number.isFinite(numericAmount)) {
    return 'Rp 0';
  }

  return idrFormatter.format(numericAmount).replace(/\u00A0/g, ' ');
};

export const formatSolAmount = (lamports) => {
  let lamportsValue;

  if (typeof lamports === 'bigint') {
    lamportsValue = lamports;
  } else if (typeof lamports === 'number' && Number.isSafeInteger(lamports)) {
    lamportsValue = BigInt(lamports);
  } else if (typeof lamports === 'string' && /^\d+$/.test(lamports.trim())) {
    lamportsValue = BigInt(lamports.trim());
  } else {
    throw new TypeError('Lamports must be a non-negative integer.');
  }

  if (lamportsValue < 0n) {
    throw new RangeError('Lamports must be a non-negative integer.');
  }

  const wholeSol = lamportsValue / LAMPORTS_PER_SOL;
  const fractionalLamports = lamportsValue % LAMPORTS_PER_SOL;
  const fractionalSol = fractionalLamports.toString().padStart(9, '0').replace(/0+$/, '');

  return fractionalSol ? `${wholeSol}.${fractionalSol} SOL` : `${wholeSol} SOL`;
};

export const buildSolanaExplorerDevnetTxUrl = (signature) => {
  if (typeof signature !== 'string' || !signature.trim()) {
    throw new TypeError('Transaction signature is required.');
  }

  return `https://explorer.solana.com/tx/${encodeURIComponent(signature.trim())}?cluster=devnet`;
};

export const isQuoteExpired = (expiresAt, now = new Date()) => {
  const expiresAtTime = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();

  if (!Number.isFinite(expiresAtTime) || !Number.isFinite(nowTime)) {
    return true;
  }

  return nowTime >= expiresAtTime;
};

export const normalizeApiError = (errorResponse, fallbackMessage = 'An unexpected error occurred.') => {
  if (!errorResponse || typeof errorResponse !== 'object') {
    return {
      code: 'UNKNOWN_ERROR',
      message: fallbackMessage,
      status: null,
      details: null,
    };
  }

  const code = typeof errorResponse.error === 'string'
    ? errorResponse.error
    : typeof errorResponse.code === 'string'
      ? errorResponse.code
      : 'UNKNOWN_ERROR';

  const message = typeof errorResponse.message === 'string' && errorResponse.message.trim()
    ? errorResponse.message
    : fallbackMessage;

  const status = Number.isInteger(errorResponse.status) ? errorResponse.status : null;
  const details = errorResponse.details ?? errorResponse.errors ?? null;

  return {
    code,
    message,
    status,
    details,
  };
};
