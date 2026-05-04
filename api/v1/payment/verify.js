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
  const rpcUrl = getSolanaRpcUrl();

  if (/mainnet/i.test(rpcUrl)) {
    throw new Error('Mainnet RPC is not allowed for devnet payment verification.');
  }

  return new Connection(rpcUrl, 'confirmed');
};

const getTreasuryWallet = () => (
  process.env.TREASURY_WALLET
  || process.env.VITE_TREASURY_WALLET
  || ''
);

const parseTreasuryPublicKey = () => {
  try {
    return new PublicKey(getTreasuryWallet());
  } catch {
    throw new Error('Treasury wallet is not configured.');
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

    if (Date.now() >= new Date(quote.expiresAt).getTime()) {
      return jsonFailure(res, 409, 'QUOTE_EXPIRED', 'Payment quote has expired.', {
        signature: trimmedSignature,
      });
    }

    const treasuryPublicKey = parseTreasuryPublicKey();
    const expectedDestination = treasuryPublicKey.toBase58();
    const expectedLamports = solToLamports(quote.solAmount);
    const connection = getDevnetConnection();
    const { value: signatureStatuses } = await connection.getSignatureStatuses(
      [trimmedSignature],
      { searchTransactionHistory: true }
    );
    const signatureStatus = signatureStatuses[0];

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

    const transaction = await connection.getParsedTransaction(trimmedSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction) {
      return jsonFailure(res, 404, 'TX_NOT_FOUND', 'Transaction details were not found on Solana devnet.', {
        signature: trimmedSignature,
      });
    }

    const transfers = readSystemTransfers(transaction);
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

    return res.status(200).json({
      status: 'PAID_VERIFIED',
      signature: trimmedSignature,
      explorerUrl: buildExplorerUrl(trimmedSignature),
    });
  } catch (error) {
    console.error('[UNHANDLED_VERIFY_ERROR]', error);

    return jsonFailure(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  }
}
