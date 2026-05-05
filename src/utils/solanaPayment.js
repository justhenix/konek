import {
  clusterApiUrl,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {
  buildSolanaExplorerDevnetTxUrl,
  solToLamports,
} from './payment';

export const PHANTOM_SIGN_TRANSACTION_URL = 'https://phantom.app/ul/v1/signTransaction';
export const PHANTOM_PAYMENT_ACTION = 'phantom-sign-payment';
export const PENDING_PHANTOM_PAYMENT_STORAGE_KEY = 'konek_pending_phantom_payment';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const getSolanaRpcUrl = () => (
  import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('devnet')
);

export const createPaymentConnection = () => (
  new Connection(getSolanaRpcUrl(), 'confirmed')
);

export const getTreasuryWalletAddress = () => (
  import.meta.env.VITE_TREASURY_WALLET || ''
);

export const getRequiredTreasuryWalletPublicKey = () => {
  const value = String(import.meta.env.VITE_TREASURY_WALLET || '').trim();

  if (!value) {
    throw new Error(
      'Frontend VITE_TREASURY_WALLET is missing. Configure it in Vercel Environment Variables and redeploy.'
    );
  }

  try {
    return new PublicKey(value);
  } catch {
    throw new Error('Frontend VITE_TREASURY_WALLET is not a valid Solana address.');
  }
};

export const parsePublicKey = (value, label = 'Wallet address') => {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} is not a valid Solana address.`);
  }
};

export const buildDevnetSolTransferTransaction = async ({
  connection,
  fromPublicKey,
  solAmount,
}) => {
  const payerPublicKey = fromPublicKey instanceof PublicKey
    ? fromPublicKey
    : parsePublicKey(fromPublicKey, 'Connected wallet');
  const treasuryPublicKey = getRequiredTreasuryWalletPublicKey();
  const lamports = solToLamports(solAmount);

  if (lamports <= 0n) {
    throw new Error('Quote SOL amount must be greater than zero.');
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: payerPublicKey,
    recentBlockhash: blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: payerPublicKey,
      toPubkey: treasuryPublicKey,
      lamports,
    })
  );

  return {
    transaction,
    lamports,
    treasuryPublicKey,
    blockhash,
    lastValidBlockHeight,
  };
};

export const serializeTransactionForPhantom = (transaction) => (
  bs58.encode(transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  }))
);

export const createPhantomNonce = () => nacl.randomBytes(24);

export const encryptPhantomPayload = (payload, nonce, sharedSecret) => (
  bs58.encode(nacl.box.after(
    textEncoder.encode(JSON.stringify(payload)),
    nonce,
    sharedSecret
  ))
);

export const decryptPhantomPayload = ({ data, nonce, sharedSecret }) => {
  const decryptedData = nacl.box.open.after(
    bs58.decode(data),
    bs58.decode(nonce),
    sharedSecret
  );

  if (!decryptedData) {
    throw new Error('Unable to decrypt Phantom mobile payload.');
  }

  return JSON.parse(textDecoder.decode(decryptedData));
};

export const buildPhantomSignTransactionUrl = ({
  dappEncryptionPublicKey,
  nonce,
  payload,
  redirectLink,
}) => {
  const phantomUrl = new URL(PHANTOM_SIGN_TRANSACTION_URL);

  phantomUrl.searchParams.set('dapp_encryption_public_key', dappEncryptionPublicKey);
  phantomUrl.searchParams.set('nonce', bs58.encode(nonce));
  phantomUrl.searchParams.set('redirect_link', redirectLink);
  phantomUrl.searchParams.set('payload', payload);

  return phantomUrl.toString();
};

export const createPaymentSubmission = (signature, extra = {}) => ({
  signature,
  explorerUrl: buildSolanaExplorerDevnetTxUrl(signature),
  status: 'submitted',
  message: 'Transaction submitted, waiting for backend verification.',
  submittedAt: new Date().toISOString(),
  ...extra,
});
