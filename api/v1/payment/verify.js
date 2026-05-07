/* global process */
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { loadQuoteRecord } from '../../lib/paymentQuotes.js';

const SOL_AMOUNT_PATTERN = /^(\d+)(?:\.(\d{1,9}))?$/;
const LAMPORTS_PER_SOL = 1_000_000_000n;
const FINAL_STATUSES = new Set(['confirmed', 'finalized']);

class VerifyConfigError extends Error {
  constructor(code, message, httpStatus = 500) {
    super(message);
    this.name = 'VerifyConfigError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const buildExplorerUrl = (signature) => (
  `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`
);

const jsonFailure = (res, httpStatus, code, message, extra = {}) => (
  res.status(httpStatus).json({
    status: code,
    error: code,
    message,
    ...extra,
  })
);

const getSolanaRpcUrl = () => (
  process.env.SOLANA_RPC_URL
  || process.env.VITE_SOLANA_RPC_URL
  || clusterApiUrl('devnet')
);

const getDevnetConnection = () => {
  const rpcUrl = getSolanaRpcUrl().trim();
  let parsedRpcUrl;

  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    throw new VerifyConfigError(
      'SOLANA_RPC_INVALID',
      'Backend SOLANA_RPC_URL is invalid. Set SOLANA_RPC_URL to a Solana devnet HTTP RPC URL.'
    );
  }

  if (!['http:', 'https:'].includes(parsedRpcUrl.protocol)) {
    throw new VerifyConfigError(
      'SOLANA_RPC_INVALID',
      'Backend SOLANA_RPC_URL must use http or https and point to Solana devnet.'
    );
  }

  if (/mainnet/i.test(parsedRpcUrl.toString())) {
    throw new VerifyConfigError(
      'SOLANA_RPC_MAINNET_NOT_ALLOWED',
      'Backend SOLANA_RPC_URL points at mainnet. Use a Solana devnet RPC URL for payment verification.'
    );
  }

  return new Connection(parsedRpcUrl.toString(), 'confirmed');
};

const jsonRpcFailure = (res) => jsonFailure(
  res,
  502,
  'SOLANA_RPC_INVALID',
  'Backend SOLANA_RPC_URL could not read Solana devnet. Set SOLANA_RPC_URL to a working devnet RPC URL.'
);

const getTreasuryWallet = () => (
  process.env.TREASURY_WALLET
  || process.env.VITE_TREASURY_WALLET
  || ''
);

const getRequiredTreasuryPublicKey = () => {
  const wallet = getTreasuryWallet().trim();

  if (!wallet) {
    throw new VerifyConfigError(
      'TREASURY_WALLET_NOT_CONFIGURED',
      'Backend TREASURY_WALLET is missing. Set TREASURY_WALLET in local env.'
    );
  }

  try {
    return new PublicKey(wallet);
  } catch {
    throw new VerifyConfigError(
      'TREASURY_WALLET_INVALID',
      'Backend TREASURY_WALLET is not a valid Solana public key. Set TREASURY_WALLET to the devnet treasury wallet.'
    );
  }
};

const isValidSignature = (signature) => {
  if (typeof signature !== 'string' || !signature.trim()) {
    return false;
  }

  try {
    return bs58.decode(signature.trim()).length === 64;
  } catch {
    return false;
  }
};

const solToLamports = (solAmount) => {
  const normalizedAmount = String(solAmount ?? '').trim();
  const match = normalizedAmount.match(SOL_AMOUNT_PATTERN);

  if (!match) {
    throw new Error('Invalid quote SOL amount.');
  }

  const [, wholeSol, fractionalSol = ''] = match;

  return (BigInt(wholeSol) * LAMPORTS_PER_SOL) + BigInt(fractionalSol.padEnd(9, '0'));
};

const getParsedInstructions = (transaction) => {
  const topLevelInstructions = transaction?.transaction?.message?.instructions || [];
  const innerInstructions = transaction?.meta?.innerInstructions
    ?.flatMap((item) => item.instructions || []) || [];

  return [...topLevelInstructions, ...innerInstructions];
};

const readSystemTransfers = (transaction) => (
  getParsedInstructions(transaction)
    .filter((instruction) => (
      instruction?.program === 'system'
      && instruction?.programId?.toString?.() === SystemProgram.programId.toString()
      && instruction?.parsed?.type === 'transfer'
      && instruction?.parsed?.info
    ))
    .map((instruction) => ({
      source: instruction.parsed.info.source,
      destination: instruction.parsed.info.destination,
      lamports: BigInt(instruction.parsed.info.lamports),
    }))
);

const isConfirmedOrFinalized = (signatureStatus) => (
  FINAL_STATUSES.has(signatureStatus?.confirmationStatus)
  || signatureStatus?.confirmations === null
);

const logVerificationDetails = ({
  signature,
  quote,
  expectedLamports,
  expectedDestination,
  transfers,
}) => {
  console.info('[PAYMENT_VERIFY_ONCHAIN]', {
    signature,
    quoteSource: quote.source || 'UNKNOWN',
    quoteSolAmount: quote.solAmount,
    expectedLamports: expectedLamports.toString(),
    expectedDestination,
    detectedTransfers: transfers.map((transfer) => ({
      destination: transfer.destination,
      lamports: transfer.lamports.toString(),
    })),
  });
};

const persistVerifiedPayment = async ({ quote, signature, walletAddress }) => {
  const quoteSource = quote.source || 'UNKNOWN';

  if (quoteSource !== 'PERSISTED_TRANSACTION') {
    console.info('[PAYMENT_VERIFY_PERSISTENCE] persistence skipped', {
      signature,
      quoteSource,
    });
    return;
  }

  try {
    const { updateTransactionStatus } = await import('../../lib/transactions.js');
    await updateTransactionStatus(quote.quoteId, 'CONFIRMED', signature, {
      walletAddress,
    });

    console.info('[PAYMENT_VERIFY_PERSISTENCE] status updated', {
      signature,
      quoteSource,
      walletAddress,
    });
  } catch {
    console.info('[PAYMENT_VERIFY_PERSISTENCE] persistence skipped', {
      signature,
      quoteSource,
    });
  }
};

// POST /api/v1/payment/verify
export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return jsonFailure(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is accepted.');
  }

  try {
    const { quoteId, signature } = req.body || {};

    if (typeof quoteId !== 'string' || !quoteId.trim()) {
      return jsonFailure(res, 400, 'MISSING_FIELDS', 'quoteId is required.');
    }

    if (!isValidSignature(signature)) {
      return jsonFailure(res, 400, 'INVALID_SIGNATURE', 'A valid Solana transaction signature is required.');
    }

    const trimmedSignature = signature.trim();
    let quote;

    try {
      quote = await loadQuoteRecord(quoteId.trim());
    } catch {
      return jsonFailure(res, 400, 'INVALID_QUOTE', 'Payment quote is invalid.');
    }

    if (!quote) {
      return jsonFailure(res, 404, 'QUOTE_NOT_FOUND', 'Payment quote was not found.');
    }

    const quoteExpiresAt = new Date(quote.expiresAt).getTime();

    if (!Number.isFinite(quoteExpiresAt)) {
      return jsonFailure(res, 400, 'INVALID_QUOTE', 'Payment quote expiration is invalid.');
    }

    if (Date.now() >= quoteExpiresAt) {
      return jsonFailure(res, 409, 'QUOTE_EXPIRED', 'Payment quote has expired.', {
        signature: trimmedSignature,
      });
    }

    const treasuryPublicKey = getRequiredTreasuryPublicKey();
    const expectedDestination = treasuryPublicKey.toBase58();
    let expectedLamports;

    try {
      expectedLamports = solToLamports(quote.solAmount);
    } catch {
      return jsonFailure(res, 400, 'INVALID_QUOTE', 'Payment quote SOL amount is invalid.');
    }

    const connection = getDevnetConnection();
    let signatureStatus;

    try {
      const { value: signatureStatuses } = await connection.getSignatureStatuses(
        [trimmedSignature],
        { searchTransactionHistory: true }
      );
      signatureStatus = signatureStatuses[0];
    } catch {
      return jsonRpcFailure(res);
    }

    if (!signatureStatus) {
      return jsonFailure(res, 404, 'TX_NOT_FOUND', 'Transaction was not found on Solana devnet.', {
        signature: trimmedSignature,
      });
    }

    if (signatureStatus.err) {
      return jsonFailure(res, 409, 'TX_FAILED', 'Transaction failed on Solana devnet.', {
        signature: trimmedSignature,
      });
    }

    if (!isConfirmedOrFinalized(signatureStatus)) {
      return jsonFailure(res, 409, 'TX_NOT_FINALIZED', 'Transaction is not confirmed or finalized yet.', {
        signature: trimmedSignature,
      });
    }

    let transaction;

    try {
      transaction = await connection.getParsedTransaction(trimmedSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
    } catch {
      return jsonRpcFailure(res);
    }

    if (!transaction) {
      return jsonFailure(res, 404, 'TX_NOT_FOUND', 'Transaction details were not found on Solana devnet.', {
        signature: trimmedSignature,
      });
    }

    const transfers = readSystemTransfers(transaction);
    logVerificationDetails({
      signature: trimmedSignature,
      quote,
      expectedLamports,
      expectedDestination,
      transfers,
    });

    const treasuryTransfers = transfers.filter((transfer) => (
      transfer.destination === expectedDestination
    ));

    if (treasuryTransfers.length === 0) {
      return jsonFailure(res, 409, 'WRONG_DESTINATION', 'Transaction does not pay the KonekPay treasury wallet.', {
        signature: trimmedSignature,
      });
    }

    const matchingTransfer = treasuryTransfers.find((transfer) => (
      transfer.lamports === expectedLamports
    ));

    if (!matchingTransfer) {
      return jsonFailure(res, 409, 'WRONG_AMOUNT', 'Transaction amount does not match the backend quote.', {
        signature: trimmedSignature,
      });
    }

    await persistVerifiedPayment({
      quote,
      signature: trimmedSignature,
      walletAddress: matchingTransfer.source,
    });

    return res.status(200).json({
      status: 'PAID_VERIFIED',
      signature: trimmedSignature,
      explorerUrl: buildExplorerUrl(trimmedSignature),
      walletAddress: matchingTransfer.source,
      quoteId: quote.quoteId,
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof VerifyConfigError) {
      return jsonFailure(res, error.httpStatus, error.code, error.message);
    }

    console.error('[UNHANDLED_VERIFY_ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown verification error',
    });

    return jsonFailure(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  }
}
