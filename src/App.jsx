import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair } from '@solana/web3.js';
import { animate, createScope, stagger } from 'animejs'; 
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import './App.css';
import { createT } from './utils/translations';

import logoPhantom from './assets/LogoPhantom.png';

import QrisScanner from './QrisScanner';
import PaymentPage from './PaymentPage';
import { isQuoteExpired, normalizeApiError } from './utils/payment';
import {
  buildDevnetSolTransferTransaction,
  buildPhantomSignTransactionUrl,
  createPaymentConnection,
  createPaymentSubmission,
  createPhantomNonce,
  decryptPhantomPayload,
  encryptPhantomPayload,
  PENDING_PHANTOM_PAYMENT_STORAGE_KEY,
  PHANTOM_PAYMENT_ACTION,
  serializeTransactionForPhantom,
} from './utils/solanaPayment';

// PYTH NETWORK PRICE CONFIG
const PYTH_HERMES_LATEST_PRICE_URL = 'https://hermes.pyth.network/v2/updates/price/latest';
const PYTH_SOL_USD_FEED_ID = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
const PYTH_USD_IDR_FEED_ID = '0x6693afcd49878bbd622e46bd805e7177932cf6ab0b1c91b135d71151b9207433';
const USD_IDR_FALLBACK_URL = 'https://open.er-api.com/v6/latest/USD';
const PHANTOM_CONNECT_URL = 'https://phantom.app/ul/v1/connect';
const PHANTOM_DAPP_SECRET_KEY_STORAGE_KEY = 'phantom_dapp_secret_key';
const PHANTOM_DAPP_PUBLIC_KEY_STORAGE_KEY = 'phantom_dapp_encryption_public_key';
const PHANTOM_PUBLIC_KEY_STORAGE_KEY = 'phantom_public_key';
const PHANTOM_SESSION_STORAGE_KEY = 'phantom_session';
const PHANTOM_WALLET_ENCRYPTION_PUBLIC_KEY_STORAGE_KEY = 'phantom_wallet_encryption_public_key';
const PHANTOM_PAYMENT_ACTION_PARAM = 'konek_action';
const PHANTOM_PAYMENT_ID_PARAM = 'konek_payment_id';
const MOBILE_DEVICE_REGEX = /iPhone|iPad|iPod|Android/i;
const VERIFY_RETRYABLE_ERRORS = new Set(['TX_NOT_FOUND', 'TX_NOT_FINALIZED']);
const TERMINAL_PAYMENT_ERROR_CODES = new Set([
  'QUOTE_EXPIRED',
  'WRONG_AMOUNT',
  'WRONG_DESTINATION',
  'INVALID_QUOTE',
  'QUOTE_NOT_FOUND',
  'TX_FAILED',
  'PAYMENT_CONFIG_MISSING',
  'PAYMENT_CONFIG_INVALID',
  'TREASURY_WALLET_NOT_CONFIGURED',
]);
const VERIFY_RETRY_DELAY_MS = 2000;
const VERIFY_MAX_ATTEMPTS = 10;

const logPhantomMobilePayment = (event, details = {}) => {
  if (import.meta.env.DEV) {
    console.log(event, details);
  }
};

const getQuoteIdLogPrefix = (quoteId) => (
  typeof quoteId === 'string' && quoteId
    ? quoteId.slice(0, 16)
    : null
);

const getPendingPaymentQrisData = (pendingPayment) => (
  pendingPayment?.qrisData
  || pendingPayment?.rawData
  || pendingPayment?.parsedPayment?.rawData
  || null
);

const getPendingPaymentExpiry = (pendingPayment) => (
  pendingPayment?.expiresAt || pendingPayment?.quote?.expiresAt || null
);

const isPendingPhantomPaymentExpired = (pendingPayment) => {
  const expiresAt = getPendingPaymentExpiry(pendingPayment);
  return expiresAt ? isQuoteExpired(expiresAt) : true;
};

const createPaymentResumeId = () => {
  const browserCrypto = globalThis.crypto;

  if (browserCrypto?.randomUUID) {
    return browserCrypto.randomUUID();
  }

  if (browserCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const getPendingPaymentStorageKey = (paymentResumeId) => (
  paymentResumeId
    ? `${PENDING_PHANTOM_PAYMENT_STORAGE_KEY}:${paymentResumeId}`
    : PENDING_PHANTOM_PAYMENT_STORAGE_KEY
);

const cleanCurrentUrlParams = () => {
  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname}${window.location.hash}`
  );
};

const createPendingPhantomPayment = ({ parsedPayment, quote }) => {
  const qrisData = parsedPayment?.rawData || '';
  const paymentResumeId = createPaymentResumeId();

  return {
    paymentResumeId,
    action: PHANTOM_PAYMENT_ACTION,
    quote: quote
      ? {
        quoteId: quote.quoteId,
        solAmount: quote.solAmount,
        fiatAmount: quote.fiatAmount,
        fiatCurrency: quote.fiatCurrency,
        exchangeRate: quote.exchangeRate,
        expiresAt: quote.expiresAt,
        createdAt: quote.createdAt,
        quoteSource: quote.quoteSource,
      }
      : null,
    parsedPayment: parsedPayment
      ? {
        rawData: qrisData,
        merchantName: parsedPayment.merchantName,
        amount: parsedPayment.amount,
        amountText: parsedPayment.amountText,
        formattedAmount: parsedPayment.formattedAmount,
        currencyCode: parsedPayment.currencyCode,
        tags: parsedPayment.tags,
        isValid: parsedPayment.isValid,
        errors: parsedPayment.errors,
      }
      : null,
    qrisData,
    createdAt: new Date().toISOString(),
    expiresAt: quote?.expiresAt || null,
    redirectPath: window.location.pathname,
    status: 'awaiting_mobile_signature',
  };
};

const createPaymentFlowError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const getPaymentErrorCode = (error) => {
  if (error?.apiError?.code) {
    return error.apiError.code;
  }

  if (error?.code) {
    return error.code;
  }

  const message = error?.message || '';

  if (message.includes('Frontend VITE_TREASURY_WALLET is missing.')) {
    return 'PAYMENT_CONFIG_MISSING';
  }

  if (message.includes('Frontend VITE_TREASURY_WALLET is not a valid Solana address.')) {
    return 'PAYMENT_CONFIG_INVALID';
  }

  return null;
};

const isTerminalPaymentError = (error) => (
  TERMINAL_PAYMENT_ERROR_CODES.has(
    typeof error === 'string' ? error : getPaymentErrorCode(error)
  )
);

const createIdlePaymentVerification = () => ({
  status: 'idle',
  result: null,
  error: null,
});

const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const readJsonResponse = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const verifyPaymentSignature = async ({ quoteId, signature }) => {
  const response = await fetch('/api/v1/payment/verify', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ quoteId, signature }),
  });
  const responseBody = await readJsonResponse(response);

  if (!response.ok) {
    const apiError = normalizeApiError(
      {
        ...(responseBody || {}),
        status: response.status,
      },
      'Unable to verify payment.'
    );
    const error = new Error(apiError.message);
    error.apiError = apiError;
    throw error;
  }

  return responseBody;
};

const verifyPaymentSignatureWithRetry = async ({ quoteId, signature }) => {
  let lastError;

  for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await verifyPaymentSignature({ quoteId, signature });
    } catch (error) {
      lastError = error;
      const code = error.apiError?.code;

      if (!VERIFY_RETRYABLE_ERRORS.has(code) || attempt === VERIFY_MAX_ATTEMPTS) {
        break;
      }

      await delay(VERIFY_RETRY_DELAY_MS);
    }
  }

  throw lastError;
};

const normalizePythId = (id) => String(id ?? '').replace(/^0x/i, '').toLowerCase();

const buildPythLatestPriceUrl = (priceIds) => {
  const idsQuery = priceIds.map((id) => `ids[]=${encodeURIComponent(id)}`).join('&');
  return `${PYTH_HERMES_LATEST_PRICE_URL}?${idsQuery}&parsed=true&ignore_invalid_price_ids=true`;
};

const fetchJsonWithTimeout = async (url, sourceName, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const error = new Error(
        `${sourceName} rate limited (HTTP 429${retryAfter ? `, retry after ${retryAfter}s` : ''})`
      );
      error.code = sourceName === 'Pyth Hermes' ? 'PYTH_RATE_LIMITED' : 'FX_RATE_LIMITED';
      throw error;
    }

    if (!response.ok) {
      throw new Error(`${sourceName} failed (HTTP ${response.status})`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const parsePythPrice = (price, label) => {
  const rawPrice = Number(price?.price);
  const expo = Number(price?.expo);
  const value = rawPrice * (10 ** expo);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid Pyth price for ${label}`);
  }

  return value;
};

const getPythParsedPrice = (data, feedId, label) => {
  const normalizedFeedId = normalizePythId(feedId);
  const feed = data?.parsed?.find((item) => normalizePythId(item.id) === normalizedFeedId);

  if (!feed?.price) {
    throw new Error(`Pyth feed ${label} is unavailable`);
  }

  return parsePythPrice(feed.price, label);
};

const fetchUsdIdrFallbackRate = async () => {
  const data = await fetchJsonWithTimeout(USD_IDR_FALLBACK_URL, 'USD/IDR fallback FX API');
  const rate = Number(data?.rates?.IDR);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Invalid USD/IDR fallback FX rate');
  }

  return rate;
};

const fetchSolIdrRateFromPyth = async () => {
  // Pyth Network logic: fetch SOL/USD and USD/IDR from Hermes, then derive SOL/IDR.
  const pythData = await fetchJsonWithTimeout(
    buildPythLatestPriceUrl([PYTH_SOL_USD_FEED_ID, PYTH_USD_IDR_FEED_ID]),
    'Pyth Hermes'
  );

  const solUsdRate = getPythParsedPrice(pythData, PYTH_SOL_USD_FEED_ID, 'SOL/USD');
  let usdIdrRate;

  try {
    usdIdrRate = getPythParsedPrice(pythData, PYTH_USD_IDR_FEED_ID, 'USD/IDR');
  } catch (pythUsdIdrError) {
    console.warn('[PYTH_USD_IDR_UNAVAILABLE]', pythUsdIdrError.message);
    usdIdrRate = await fetchUsdIdrFallbackRate();
  }

  const solIdrRate = solUsdRate * usdIdrRate;

  if (!Number.isFinite(solIdrRate) || solIdrRate <= 0) {
    throw new Error('Invalid derived SOL/IDR rate');
  }

  return solIdrRate;
};

const navItems = [
  { key: 'navbar.home', target: 'top' },
  { key: 'navbar.usp', target: 'usp-section' },
  { key: 'navbar.howItWorks', target: 'workflow-section' },
  { key: 'navbar.proof', target: 'proof-section' },
  { key: 'navbar.team', target: 'team-section' },
];

const uspItems = ['wallet', 'price', 'receipt'];
const teamMembers = ['henix', 'aqiel', 'razan'];




const KonekLogo = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
    <path stroke="var(--color-brand)" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M 10 85 L 35 15 L 55 35" />
    <path stroke="var(--color-brand)" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M 90 15 L 65 85 L 45 65" />
  </svg>
);

const protocolNodeAccents = [
  'border-brand/50',
  'border-brand/70',
  'border-purple-400/70',
  'border-brand/50',
  'border-purple-400/50',
];

const techProofItems = ['item1', 'item2', 'item3', 'item4', 'item5', 'item6'];

const ProtocolDiagram = ({ t }) => {
  const nodes = [1, 2, 3, 4, 5].map((n, i) => ({
    label: t(`protocol.node${n}Label`),
    sub: t(`protocol.node${n}Sub`),
    accent: protocolNodeAccents[i],
  }));

  return (
    <div className="relative mx-auto w-full max-w-136 lg:mx-0" data-hero-diagram>
      <div className="absolute inset-4 hidden sm:block border border-dashed border-white/10 rounded-full"></div>
      <div className="absolute left-1/2 top-10 bottom-10 hidden sm:block w-px bg-linear-to-b from-transparent via-brand/40 to-transparent"></div>
      <div className="relative grid gap-3 sm:gap-4">
        {nodes.map((node, index) => (
          <div
            key={index}
            className={`protocol-node hero-text relative min-w-0 border ${node.accent} bg-[#111411]/85 px-4 py-3.5 backdrop-blur-sm sm:px-5 sm:py-4`}
          >
            {index < nodes.length - 1 && (
              <div className="absolute left-6 top-full h-3 sm:h-4 w-px bg-brand/35" aria-hidden="true"></div>
            )}
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="wrap-break-words text-sm font-semibold text-white sm:text-base">{node.label}</p>
                <p className="mt-1 text-[11px] font-semibold text-zinc-500">{node.sub}</p>
              </div>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${index === 2 || index === 4 ? 'bg-purple-400' : 'bg-brand'}`}></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
const SectionHeader = ({ eyebrow, title, children, className = '' }) => (
  <div className={`min-w-0 max-w-3xl ${className}`}>
    {eyebrow && (
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-brand sm:tracking-[0.24em]">{eyebrow}</p>
    )}
    <h2 className="text-3xl font-semibold leading-[1.08] text-white sm:text-4xl lg:text-5xl">{title}</h2>
    {children && (
      <p className="mt-5 text-base leading-8 text-zinc-400 md:text-lg">{children}</p>
    )}
  </div>
);

const toastVariantStyles = {
  success: {
    shell: 'border-brand/25 bg-[#08100b]/95',
    dot: 'bg-brand',
    title: 'text-brand',
  },
  info: {
    shell: 'border-purple-400/25 bg-[#0b0912]/95',
    dot: 'bg-purple-300',
    title: 'text-purple-200',
  },
  warning: {
    shell: 'border-amber-300/25 bg-[#111006]/95',
    dot: 'bg-amber-300',
    title: 'text-amber-200',
  },
  danger: {
    shell: 'border-red-400/25 bg-[#120808]/95',
    dot: 'bg-red-400',
    title: 'text-red-300',
  },
};

const AppToast = ({ toast, onDismiss }) => {
  const styles = toastVariantStyles[toast.variant] || toastVariantStyles.info;
  const role = toast.variant === 'danger' || toast.variant === 'warning' ? 'alert' : 'status';

  return (
    <div
      className={`pointer-events-auto w-full max-w-88 border px-4 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.36)] backdrop-blur-xl ${styles.shell}`}
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${styles.dot}`}></span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${styles.title}`}>{toast.title}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-300">{toast.body}</p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="grid h-6 w-6 shrink-0 place-items-center border border-white/10 bg-white/4 text-zinc-500 transition hover:border-white/20 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="Close notification"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};

const ToastViewport = ({ toasts, onDismiss }) => (
  <div className="fixed inset-x-3 top-3 z-150 flex pointer-events-none flex-col items-center gap-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end">
    {toasts.map((toast) => (
      <AppToast key={toast.id} toast={toast} onDismiss={onDismiss} />
    ))}
  </div>
);

function App() {
  const [isScrolled, setIsScrolled] = useState(false);
  const root = useRef(null);
  const scope = useRef(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const toastIdRef = useRef(0);
  const [solPrice, setSolPrice] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [lang, setLang] = useState(() => {
    const stored = localStorage.getItem('konek_lang');
    return stored === 'en' || stored === 'id' ? stored : 'id';
  });
  const t = useMemo(() => createT(lang), [lang]);
  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'id' ? 'en' : 'id';
      localStorage.setItem('konek_lang', next);
      return next;
    });
  }, []);
  const [mobileWalletPublicKey, setMobileWalletPublicKey] = useState(() => (
    localStorage.getItem(PHANTOM_PUBLIC_KEY_STORAGE_KEY)
  ));

  const { connection } = useConnection();
  const { select, wallets, publicKey, connect, disconnect, connected, sendTransaction } = useWallet();

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedData, setScannedData] = useState(null);
  const [parsedPaymentData, setParsedPaymentData] = useState(null);
  const [restoredPaymentQuote, setRestoredPaymentQuote] = useState(null);
  const [paymentSubmission, setPaymentSubmission] = useState(null);
  const [paymentError, setPaymentError] = useState(null);
  const [paymentVerification, setPaymentVerification] = useState(createIdlePaymentVerification);
  const [mobilePaymentState, setMobilePaymentState] = useState(null);

  const readPendingPhantomPayment = useCallback((paymentResumeId = null) => {
    const readStoredPendingPayment = (storage, storageKey) => {
      const pendingPayment = storage.getItem(storageKey);

      if (!pendingPayment) {
        return null;
      }

      try {
        return JSON.parse(pendingPayment);
      } catch {
        storage.removeItem(storageKey);
        return null;
      }
    };

    if (paymentResumeId) {
      const pendingPaymentById = readStoredPendingPayment(
        localStorage,
        getPendingPaymentStorageKey(paymentResumeId)
      );

      if (pendingPaymentById?.paymentResumeId === paymentResumeId) {
        return pendingPaymentById;
      }

      const currentPendingPayment = readStoredPendingPayment(
        localStorage,
        PENDING_PHANTOM_PAYMENT_STORAGE_KEY
      );

      if (currentPendingPayment?.paymentResumeId === paymentResumeId) {
        return currentPendingPayment;
      }

      return null;
    }

    return readStoredPendingPayment(localStorage, PENDING_PHANTOM_PAYMENT_STORAGE_KEY)
      || readStoredPendingPayment(sessionStorage, PENDING_PHANTOM_PAYMENT_STORAGE_KEY);
  }, []);

  const writePendingPhantomPayment = useCallback((pendingPayment) => {
    const serializedPendingPayment = JSON.stringify(pendingPayment);

    if (pendingPayment?.paymentResumeId) {
      localStorage.setItem(
        getPendingPaymentStorageKey(pendingPayment.paymentResumeId),
        serializedPendingPayment
      );
    }

    localStorage.setItem(PENDING_PHANTOM_PAYMENT_STORAGE_KEY, serializedPendingPayment);
    sessionStorage.removeItem(PENDING_PHANTOM_PAYMENT_STORAGE_KEY);
  }, []);

  const clearPendingPhantomPayment = useCallback((paymentResumeId = null) => {
    let currentPendingPayment = null;

    try {
      const currentPendingPaymentValue = localStorage.getItem(PENDING_PHANTOM_PAYMENT_STORAGE_KEY);
      currentPendingPayment = currentPendingPaymentValue ? JSON.parse(currentPendingPaymentValue) : null;
    } catch {
      currentPendingPayment = null;
    }

    const paymentResumeIdsToClear = new Set();

    if (paymentResumeId) {
      paymentResumeIdsToClear.add(paymentResumeId);
    }

    if (!paymentResumeId && currentPendingPayment?.paymentResumeId) {
      paymentResumeIdsToClear.add(currentPendingPayment.paymentResumeId);
    }

    paymentResumeIdsToClear.forEach((resumeId) => {
      localStorage.removeItem(getPendingPaymentStorageKey(resumeId));
    });

    if (
      !paymentResumeId
      || !currentPendingPayment?.paymentResumeId
      || currentPendingPayment.paymentResumeId === paymentResumeId
    ) {
      localStorage.removeItem(PENDING_PHANTOM_PAYMENT_STORAGE_KEY);
    }

    sessionStorage.removeItem(PENDING_PHANTOM_PAYMENT_STORAGE_KEY);
  }, []);

  const restorePendingPaymentReview = useCallback((pendingPayment) => {
    if (!pendingPayment) {
      return false;
    }

    const qrisData = getPendingPaymentQrisData(pendingPayment);

    if (!qrisData) {
      return false;
    }

    setIsScannerOpen(false);
    setScannedData(qrisData);
    setParsedPaymentData(pendingPayment.parsedPayment || null);
    setRestoredPaymentQuote(pendingPayment.quote || null);
    return true;
  }, []);

  const getStoredPhantomSharedSecret = useCallback((phantomEncryptionPublicKey) => {
    const storedSecretKey = localStorage.getItem(PHANTOM_DAPP_SECRET_KEY_STORAGE_KEY);

    if (!storedSecretKey) {
      throw new Error('Missing Phantom dapp secret key from localStorage.');
    }

    const dappSecretKey = Uint8Array.from(JSON.parse(storedSecretKey));
    const dappEncryptionSecretKey = dappSecretKey.slice(0, nacl.box.secretKeyLength);

    return nacl.box.before(
      bs58.decode(phantomEncryptionPublicKey),
      dappEncryptionSecretKey
    );
  }, []);

  const verifySubmittedPayment = useCallback(async ({
    quote,
    signature,
    explorerUrl,
    debugSource = null,
    onError = null,
  }) => {
    if (!quote?.quoteId || !signature) {
      setPaymentVerification({
        status: 'failed',
        result: null,
        error: {
          code: 'MISSING_VERIFICATION_DATA',
          message: 'Missing quote or transaction signature for verification.',
        },
      });
      return null;
    }

    if (debugSource === 'phantom-mobile') {
      logPhantomMobilePayment('[PHANTOM_MOBILE_PAYMENT_VERIFYING]', {
        quoteId: getQuoteIdLogPrefix(quote.quoteId),
        signature,
        status: 'verifying',
      });
    }

    setPaymentVerification({
      status: 'verifying',
      result: null,
      error: null,
    });

    try {
      const result = await verifyPaymentSignatureWithRetry({
        quoteId: quote.quoteId,
        signature,
      });
      const verifiedResult = {
        ...result,
        explorerUrl: result.explorerUrl || explorerUrl,
      };

      setPaymentVerification({
        status: 'paid_verified',
        result: verifiedResult,
        error: null,
      });

      if (debugSource === 'phantom-mobile') {
        logPhantomMobilePayment('[PHANTOM_MOBILE_PAYMENT_VERIFIED]', {
          quoteId: getQuoteIdLogPrefix(quote.quoteId),
          signature,
          status: 'paid_verified',
        });
      }

      return verifiedResult;
    } catch (error) {
      const apiError = error.apiError || normalizeApiError(null, error.message);
      onError?.(apiError);

      setPaymentVerification({
        status: 'failed',
        result: null,
        error: apiError,
      });

      if (debugSource === 'phantom-mobile') {
        logPhantomMobilePayment('[PHANTOM_MOBILE_PAYMENT_ERROR]', {
          quoteId: getQuoteIdLogPrefix(quote.quoteId),
          signature,
          status: 'verification_failed',
          code: apiError.code,
          message: apiError.message,
        });
      }

      return null;
    }
  }, []);

  const addToast = useCallback(({ variant = 'info', title, body, duration = 3600 }) => {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((currentToasts) => [
      ...currentToasts.filter((toast) => toast.title !== title || toast.body !== body),
      { id, variant, title, body },
    ].slice(-3));

    window.setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
    }, duration);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  }, []);

  const userProfile = useMemo(() => {
    const pKeyStr = publicKey?.toBase58() || mobileWalletPublicKey;
    if (pKeyStr) {
      if (import.meta.env.DEV) {
        console.log(pKeyStr);
      }
      return {
        isLoggedIn: true,
        name: `${pKeyStr.slice(0, 4)}...${pKeyStr.slice(-4)}`,
        address: pKeyStr,
      };
    }
    return {
      isLoggedIn: false,
      name: "Guest",
      address: '',
    };
  }, [publicKey, mobileWalletPublicKey]);

  const getPhantomProvider = () => {
    if (typeof window !== 'undefined') {
      if (window.phantom?.solana?.isPhantom) {
        return window.phantom.solana;
      }
      if (window.solana?.isPhantom) {
        return window.solana;
      }
    }
    return null;
  };

  const handleConnectWallet = async () => {
    if (isConnecting) return;
    try {
      setIsConnecting(true);
      const isMobile = MOBILE_DEVICE_REGEX.test(navigator.userAgent);

      if (isMobile) {
        const dappKeypair = Keypair.generate();
        const dappEncryptionKeypair = nacl.box.keyPair.fromSecretKey(
          dappKeypair.secretKey.slice(0, nacl.box.secretKeyLength)
        );
        const dappEncryptionPublicKey = bs58.encode(dappEncryptionKeypair.publicKey);
        const redirectUrl = new URL(window.location.href);

        redirectUrl.search = '';
        redirectUrl.hash = '';
        localStorage.setItem(
          PHANTOM_DAPP_SECRET_KEY_STORAGE_KEY,
          JSON.stringify(Array.from(dappKeypair.secretKey))
        );
        localStorage.setItem(PHANTOM_DAPP_PUBLIC_KEY_STORAGE_KEY, dappEncryptionPublicKey);

        const phantomConnectUrl = new URL(PHANTOM_CONNECT_URL);
        phantomConnectUrl.searchParams.set('dapp_encryption_public_key', dappEncryptionPublicKey);
        phantomConnectUrl.searchParams.set('app_url', window.location.origin);
        phantomConnectUrl.searchParams.set('redirect_link', redirectUrl.toString());
        phantomConnectUrl.searchParams.set('cluster', 'devnet');

        window.location.href = phantomConnectUrl.toString();
        return;
      }

      const provider = getPhantomProvider();
      if (provider) {
        const phantomWallet = wallets.find((w) => w.adapter.name === 'Phantom');
        if (phantomWallet) {
          select(phantomWallet.adapter.name);
        }
        
        try {
          await provider.connect({ onlyIfTrusted: false });
          // Attempt default wallet adapter connect to sync state, ignore if it skips
          try {
            await connect();
          } catch (e) {
            console.warn('Adapter connect threw, but provider is connected', e);
          }
          
          setIsLoginModalOpen(false);
          addToast({
            variant: 'success',
            title: t('walletToast.connectedTitle'),
            body: t('walletToast.connectedBody'),
          });
        } catch (connectionError) {
          if (connectionError?.code === 4001 || connectionError?.message?.toLowerCase().includes('reject')) {
            // User rejected the connection
            console.log('User rejected connection');
            return;
          }
          throw connectionError;
        }
      } else {
        setIsLoginModalOpen(false);
        addToast({
          variant: 'warning',
          title: t('walletToast.phantomNotReadyTitle'),
          body: t('walletToast.phantomNotReadyBody'),
        });
      }
    } catch (error) {
      console.error("Failed to connect to wallet:", error);
      addToast({
        variant: 'warning',
        title: t('walletToast.phantomNotReadyTitle'),
        body: t('walletToast.phantomNotReadyBody'),
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectWallet = useCallback(async () => {
    try {
      if (connected || publicKey) {
        await disconnect();
      }
    } catch (error) {
      console.error('Failed to disconnect wallet adapter:', error);
    } finally {
      [
        PHANTOM_DAPP_SECRET_KEY_STORAGE_KEY,
        PHANTOM_DAPP_PUBLIC_KEY_STORAGE_KEY,
        PHANTOM_PUBLIC_KEY_STORAGE_KEY,
        PHANTOM_SESSION_STORAGE_KEY,
        PHANTOM_WALLET_ENCRYPTION_PUBLIC_KEY_STORAGE_KEY,
      ].forEach((key) => localStorage.removeItem(key));

      setMobileWalletPublicKey(null);
      setIsProfileMenuOpen(false);
      setIsLoginModalOpen(false);
      setIsScannerOpen(false);
      setScannedData(null);
      setParsedPaymentData(null);
      setRestoredPaymentQuote(null);
      setPaymentSubmission(null);
      setPaymentError(null);
      setPaymentVerification(createIdlePaymentVerification());
      setMobilePaymentState(null);
      clearPendingPhantomPayment();
      addToast({
        variant: 'info',
        title: t('walletToast.disconnectedTitle'),
        body: t('walletToast.disconnectedBody'),
      });
    }
  }, [addToast, clearPendingPhantomPayment, connected, disconnect, publicKey, t]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phantomAction = params.get(PHANTOM_PAYMENT_ACTION_PARAM);
    const callbackPaymentResumeId = params.get(PHANTOM_PAYMENT_ID_PARAM);
    const phantomEncryptionPublicKey = params.get('phantom_encryption_public_key');
    const nonce = params.get('nonce');
    const data = params.get('data');
    const errorCode = params.get('errorCode');
    const errorMessage = params.get('errorMessage');
    const isMarkedPaymentCallback = phantomAction === PHANTOM_PAYMENT_ACTION;
    const pendingPayment = readPendingPhantomPayment(callbackPaymentResumeId);
    const hasPendingPayment = pendingPayment?.action === PHANTOM_PAYMENT_ACTION;
    const hasMatchingPaymentId = Boolean(
      isMarkedPaymentCallback
      && callbackPaymentResumeId
      && pendingPayment?.paymentResumeId === callbackPaymentResumeId
    );
    const hasCallbackParams = Boolean(
      phantomAction
      || callbackPaymentResumeId
      || phantomEncryptionPublicKey
      || nonce
      || data
      || errorCode
      || errorMessage
    );
    const isPaymentCallback = hasPendingPayment && hasMatchingPaymentId;

    if (isPaymentCallback) {
      logPhantomMobilePayment('[PHANTOM_MOBILE_PAYMENT_CALLBACK]', {
        quoteId: getQuoteIdLogPrefix(pendingPayment?.quote?.quoteId),
        paymentResumeId: callbackPaymentResumeId,
        status: errorCode ? 'error' : 'returned',
        hasData: Boolean(data),
        hasNonce: Boolean(nonce),
        hasPhantomEncryptionPublicKey: Boolean(phantomEncryptionPublicKey),
      });
    }

    if (isMarkedPaymentCallback && !isPaymentCallback) {
      queueMicrotask(() => {
        const didRestore = restorePendingPaymentReview(pendingPayment);

        setPaymentSubmission(null);
        setPaymentVerification(createIdlePaymentVerification());
        setMobilePaymentState({ status: 'error' });
        setPaymentError({
          code: 'PHANTOM_MOBILE_ERROR',
          message: t('payment.mobilePaymentError'),
        });

        if (!didRestore && !pendingPayment) {
          clearPendingPhantomPayment(callbackPaymentResumeId);
        }
      });

      logPhantomMobilePayment('[PHANTOM_MOBILE_PAYMENT_ERROR]', {
        paymentResumeId: callbackPaymentResumeId,
        status: 'payment_id_mismatch',
      });

      cleanCurrentUrlParams();
      return;
    }

    if (errorCode) {
      if (isPaymentCallback) {
        const isRejected = errorCode === '4001' || /reject|cancel/i.test(errorMessage || '');

        queueMicrotask(() => {
          restorePendingPaymentReview(pendingPayment);
          setPaymentSubmission(null);
          setPaymentVerification(createIdlePaymentVerification());
          setMobilePaymentState({ status: 'cancelled' });
          setPaymentError({
            code: isRejected ? 'PHANTOM_MOBILE_REJECTED' : 'PHANTOM_MOBILE_ERROR',
            message: isRejected ? t('payment.mobileCancelled') : t('payment.mobilePaymentError'),
            phantomCode: errorCode,
          });
        });

        logPhantomMobilePayment('[PHANTOM_MOBILE_PAYMENT_ERROR]', {
          quoteId: getQuoteIdLogPrefix(pendingPayment?.quote?.quoteId),
          paymentResumeId: pendingPayment?.paymentResumeId || null,
          status: isRejected ? 'rejected' : 'error',
          code: errorCode,
          message: errorMessage || null,
        });
      } else {
        console.error(`Phantom mobile connect rejected (${errorCode}): ${errorMessage || 'Unknown error'}`);
      }

      cleanCurrentUrlParams();
      return;
    }

    if (!phantomEncryptionPublicKey || !nonce || !data) {
      if (!isPaymentCallback) {
        if (hasPendingPayment && !hasCallbackParams) {
          queueMicrotask(() => {
            const didRestore = restorePendingPaymentReview(pendingPayment);

            if (!didRestore) {
              clearPendingPhantomPayment();
              return;
            }

            const quote = pendingPayment.quote || null;

            if (pendingPayment.signature) {
              const submissionExtra = {
                quote,
                submittedBy: 'phantom-mobile',
              };

              if (pendingPayment.explorerUrl) {
                submissionExtra.explorerUrl = pendingPayment.explorerUrl;
              }

              if (pendingPayment.submittedAt) {
                submissionExtra.submittedAt = pendingPayment.submittedAt;
              }

              const submission = createPaymentSubmission(pendingPayment.signature, submissionExtra);
              let verificationError = null;

              setPaymentSubmission(submission);
              setPaymentError(null);
              setMobilePaymentState({ status: 'verifying' });
              verifySubmittedPayment({
                quote,
                signature: submission.signature,
                explorerUrl: submission.explorerUrl,
                debugSource: 'phantom-mobile',
                onError: (apiError) => {
                  verificationError = apiError;
                },
              }).then((result) => {
                if (result) {
                  clearPendingPhantomPayment(pendingPayment.paymentResumeId);
                  setMobilePaymentState(null);
                } else if (isTerminalPaymentError(verificationError)) {
                  clearPendingPhantomPayment(pendingPayment.paymentResumeId);
                } else {
                  writePendingPhantomPayment({
                    ...pendingPayment,
                    status: 'verification_failed',
                    signature: submission.signature,
                    explorerUrl: submission.explorerUrl,
                    submittedAt: submission.submittedAt,
                  });
                }
              });
              return;
            }

            setPaymentSubmission(null);
            setPaymentVerification(createIdlePaymentVerification());

            if (isPendingPhantomPaymentExpired(pendingPayment)) {
              setMobilePaymentState({ status: 'expired' });
              setPaymentError({
                code: 'QUOTE_EXPIRED',
                message: t('payment.quoteExpiredBeforeSubmit'),
              });
              clearPendingPhantomPayment(pendingPayment.paymentResumeId);
              return;
            }

            setMobilePaymentState({ status: 'restored' });
            setPaymentError(null);
          });
        }

        return;
      }
    }

    if (isPaymentCallback) {
      const handlePhantomPaymentReturn = async () => {
        try {
          const didRestore = restorePendingPaymentReview(pendingPayment);

          if (!didRestore || !pendingPayment?.quote) {
            throw new Error('Missing pending Phantom payment context.');
          }

          setPaymentSubmission(null);
          setPaymentError(null);
          setPaymentVerification(createIdlePaymentVerification());
          setMobilePaymentState({ status: 'returned' });

          if (!nonce || !data) {
            throw new Error('Missing Phantom payment response data.');
          }

          if (isPendingPhantomPaymentExpired(pendingPayment)) {
            throw createPaymentFlowError('QUOTE_EXPIRED', t('payment.quoteExpiredBeforeSubmit'));
          }

          const storedPhantomEncryptionPublicKey = localStorage.getItem(
            PHANTOM_WALLET_ENCRYPTION_PUBLIC_KEY_STORAGE_KEY
          );
          const paymentPhantomEncryptionPublicKey = phantomEncryptionPublicKey
            || storedPhantomEncryptionPublicKey;

          if (!paymentPhantomEncryptionPublicKey) {
            throw new Error('Missing Phantom wallet encryption public key.');
          }

          if (phantomEncryptionPublicKey) {
            localStorage.setItem(
              PHANTOM_WALLET_ENCRYPTION_PUBLIC_KEY_STORAGE_KEY,
              phantomEncryptionPublicKey
            );
          }

          const sharedSecret = getStoredPhantomSharedSecret(paymentPhantomEncryptionPublicKey);
          const payload = decryptPhantomPayload({ data, nonce, sharedSecret });

          logPhantomMobilePayment('[PHANTOM_MOBILE_PAYMENT_DECRYPTED]', {
            quoteId: getQuoteIdLogPrefix(pendingPayment.quote.quoteId),
            status: 'decrypted',
            hasSignature: Boolean(payload.signature),
            hasTransaction: Boolean(
              payload.transaction
              || payload.signedTransaction
              || payload.signed_transaction
            ),
          });

          let signature = payload.signature;

          if (!signature) {
            const signedTransaction = payload.transaction
              || payload.signedTransaction
              || payload.signed_transaction;

            if (!signedTransaction) {
              throw new Error('Phantom did not return a signed transaction.');
            }

            setMobilePaymentState({ status: 'submitting_signed_transaction' });

            const paymentConnection = createPaymentConnection();
            signature = await paymentConnection.sendRawTransaction(
              bs58.decode(signedTransaction),
              {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
              }
            );
          }

          const submission = createPaymentSubmission(signature, {
            quote: pendingPayment?.quote || null,
            submittedBy: 'phantom-mobile',
          });
          const submittedPendingPayment = {
            ...pendingPayment,
            status: 'signed_transaction_submitted',
            signature,
            explorerUrl: submission.explorerUrl,
            submittedAt: submission.submittedAt,
          };

          setPaymentSubmission(submission);
          setPaymentError(null);
          setPaymentVerification(createIdlePaymentVerification());
          writePendingPhantomPayment(submittedPendingPayment);
          logPhantomMobilePayment('[PHANTOM_MOBILE_PAYMENT_SUBMITTED]', {
            quoteId: getQuoteIdLogPrefix(pendingPayment.quote.quoteId),
            signature,
            status: 'submitted',
          });

          let verificationError = null;
          const verifiedResult = await verifySubmittedPayment({
            quote: pendingPayment?.quote || null,
            signature,
            explorerUrl: submission.explorerUrl,
            debugSource: 'phantom-mobile',
            onError: (apiError) => {
              verificationError = apiError;
            },
          });

          if (verifiedResult) {
            clearPendingPhantomPayment(pendingPayment.paymentResumeId);
            setMobilePaymentState(null);
          } else if (isTerminalPaymentError(verificationError)) {
            clearPendingPhantomPayment(pendingPayment.paymentResumeId);
          } else {
            writePendingPhantomPayment({
              ...submittedPendingPayment,
              status: 'verification_failed',
            });
          }
        } catch (error) {
          const canRetry = Boolean(pendingPayment?.quote && getPendingPaymentQrisData(pendingPayment));
          const paymentErrorCode = getPaymentErrorCode(error);
          const displayErrorCode = paymentErrorCode || (canRetry ? 'PHANTOM_MOBILE_ERROR' : 'PAYMENT_SUBMISSION_FAILED');
          const displayErrorMessage = displayErrorCode === 'PHANTOM_MOBILE_ERROR'
            ? t('payment.mobilePaymentError')
            : error.message || 'Unable to submit signed transaction to devnet.';

          setPaymentSubmission(null);
          setPaymentVerification(createIdlePaymentVerification());
          setMobilePaymentState({ status: 'error' });
          setPaymentError({
            code: displayErrorCode,
            message: displayErrorMessage,
          });

          if (!canRetry || isTerminalPaymentError(displayErrorCode)) {
            clearPendingPhantomPayment(pendingPayment?.paymentResumeId);
          }

          logPhantomMobilePayment('[PHANTOM_MOBILE_PAYMENT_ERROR]', {
            quoteId: getQuoteIdLogPrefix(pendingPayment?.quote?.quoteId),
            paymentResumeId: pendingPayment?.paymentResumeId || null,
            status: 'submission_failed',
            code: displayErrorCode,
            message: error.message,
          });
        } finally {
          cleanCurrentUrlParams();
        }
      };

      handlePhantomPaymentReturn();
      return;
    }

    try {
      const sharedSecret = getStoredPhantomSharedSecret(phantomEncryptionPublicKey);
      const payload = decryptPhantomPayload({ data, nonce, sharedSecret });

      if (!payload.public_key) {
        throw new Error('Phantom mobile connect payload did not include public_key.');
      }

      localStorage.setItem(PHANTOM_PUBLIC_KEY_STORAGE_KEY, payload.public_key);
      localStorage.setItem(PHANTOM_WALLET_ENCRYPTION_PUBLIC_KEY_STORAGE_KEY, phantomEncryptionPublicKey);
      if (payload.session) {
        localStorage.setItem(PHANTOM_SESSION_STORAGE_KEY, payload.session);
      }

      queueMicrotask(() => {
        setMobileWalletPublicKey(payload.public_key);
        setIsLoginModalOpen(false);
        addToast({
          variant: 'success',
          title: t('walletToast.connectedTitle'),
          body: t('walletToast.connectedBody'),
        });
      });
    } catch (error) {
      console.error('Failed to decrypt Phantom mobile connect response:', error);
    } finally {
      cleanCurrentUrlParams();
    }
  }, [
    addToast,
    clearPendingPhantomPayment,
    getStoredPhantomSharedSecret,
    readPendingPhantomPayment,
    restorePendingPaymentReview,
    t,
    verifySubmittedPayment,
    writePendingPhantomPayment,
  ]);
  // ==========================================

  // Fungsi pengatur klik tombol utama (Launch App / QRIS Pay)
  const handleOpenApp = () => {
    if (userProfile.isLoggedIn) {
      setIsScannerOpen(true); // Kalau udah login, buka kamera
    } else {
      setIsLoginModalOpen(true); // Kalau belum login, minta konek dompet
    }
  };

  const handleScannerResult = useCallback(({ rawData, parsedData }) => {
    clearPendingPhantomPayment();
    setScannedData(rawData);
    setParsedPaymentData(parsedData);
    setRestoredPaymentQuote(null);
    setPaymentSubmission(null);
    setPaymentError(null);
    setMobilePaymentState(null);
    setPaymentVerification(createIdlePaymentVerification());
    setIsScannerOpen(false);
  }, [clearPendingPhantomPayment]);

  const handleParsedPaymentData = useCallback((parsedData) => {
    setParsedPaymentData(parsedData);
  }, []);

  const handlePaymentCancel = useCallback(() => {
    setScannedData(null);
    setParsedPaymentData(null);
    setRestoredPaymentQuote(null);
    setPaymentSubmission(null);
    setPaymentError(null);
    setMobilePaymentState(null);
    setPaymentVerification(createIdlePaymentVerification());
    clearPendingPhantomPayment();
  }, [clearPendingPhantomPayment]);

  const handleScanAnotherPayment = useCallback(() => {
    setScannedData(null);
    setParsedPaymentData(null);
    setRestoredPaymentQuote(null);
    setPaymentSubmission(null);
    setPaymentError(null);
    setMobilePaymentState(null);
    setPaymentVerification(createIdlePaymentVerification());
    clearPendingPhantomPayment();
    setIsScannerOpen(true);
  }, [clearPendingPhantomPayment]);

  const startPhantomMobilePayment = useCallback(({ transaction, parsedPayment, quote }) => {
    const dappEncryptionPublicKey = localStorage.getItem(PHANTOM_DAPP_PUBLIC_KEY_STORAGE_KEY);
    const phantomEncryptionPublicKey = localStorage.getItem(PHANTOM_WALLET_ENCRYPTION_PUBLIC_KEY_STORAGE_KEY);
    const session = localStorage.getItem(PHANTOM_SESSION_STORAGE_KEY);

    if (!dappEncryptionPublicKey || !phantomEncryptionPublicKey || !session) {
      throw new Error('Reconnect Phantom mobile before paying.');
    }

    logPhantomMobilePayment('[PHANTOM_MOBILE_PAYMENT_START]', {
      quoteId: getQuoteIdLogPrefix(quote?.quoteId),
      wallet: transaction.feePayer?.toBase58?.() || null,
      status: 'starting',
    });

    const nonce = createPhantomNonce();
    const sharedSecret = getStoredPhantomSharedSecret(phantomEncryptionPublicKey);
    const payload = encryptPhantomPayload(
      {
        transaction: serializeTransactionForPhantom(transaction),
        session,
      },
      nonce,
      sharedSecret
    );
    const redirectUrl = new URL(window.location.href);
    const pendingPayment = createPendingPhantomPayment({ parsedPayment, quote });

    redirectUrl.search = '';
    redirectUrl.hash = '';
    redirectUrl.searchParams.set(PHANTOM_PAYMENT_ACTION_PARAM, PHANTOM_PAYMENT_ACTION);
    redirectUrl.searchParams.set(PHANTOM_PAYMENT_ID_PARAM, pendingPayment.paymentResumeId);

    writePendingPhantomPayment(pendingPayment);
    logPhantomMobilePayment('[PHANTOM_MOBILE_PAYMENT_PENDING_SAVED]', {
      quoteId: getQuoteIdLogPrefix(quote?.quoteId),
      paymentResumeId: pendingPayment.paymentResumeId,
      status: pendingPayment.status,
      expiresAt: pendingPayment.expiresAt,
      redirectPath: pendingPayment.redirectPath,
    });

    window.location.href = buildPhantomSignTransactionUrl({
      dappEncryptionPublicKey,
      nonce,
      payload,
      redirectLink: redirectUrl.toString(),
    });

    return { status: 'redirecting' };
  }, [getStoredPhantomSharedSecret, writePendingPhantomPayment]);

  const handlePaymentConfirm = useCallback(async ({ parsedPayment, quote }) => {
    setParsedPaymentData(parsedPayment);
    setRestoredPaymentQuote(quote);
    setPaymentSubmission(null);
    setPaymentError(null);
    setMobilePaymentState(null);
    setPaymentVerification(createIdlePaymentVerification());

    try {
      if (isQuoteExpired(quote?.expiresAt)) {
        throw createPaymentFlowError('QUOTE_EXPIRED', t('payment.quoteExpiredBeforeSubmit'));
      }

      const payerPublicKey = publicKey || mobileWalletPublicKey;

      if (!payerPublicKey) {
        throw new Error('Connect Phantom wallet before paying.');
      }

      const paymentConnection = connection || createPaymentConnection();
      const { transaction } = await buildDevnetSolTransferTransaction({
        connection: paymentConnection,
        fromPublicKey: payerPublicKey,
        solAmount: quote.solAmount,
      });
      const isMobile = MOBILE_DEVICE_REGEX.test(navigator.userAgent);
      const hasPhantomMobileSession = Boolean(
        mobileWalletPublicKey
        && localStorage.getItem(PHANTOM_SESSION_STORAGE_KEY)
        && localStorage.getItem(PHANTOM_WALLET_ENCRYPTION_PUBLIC_KEY_STORAGE_KEY)
      );

      if (isMobile && hasPhantomMobileSession) {
        return startPhantomMobilePayment({
          transaction,
          parsedPayment,
          quote,
        });
      }

      if (!publicKey) {
        throw new Error('Connect the Phantom browser wallet before paying on desktop.');
      }

      const signature = await sendTransaction(transaction, paymentConnection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      const submission = createPaymentSubmission(signature, {
        quote,
        submittedBy: 'wallet-adapter',
      });

      setPaymentSubmission(submission);
      verifySubmittedPayment({
        quote,
        signature,
        explorerUrl: submission.explorerUrl,
      });

      return submission;
    } catch (error) {
      if (isTerminalPaymentError(error)) {
        const pendingPayment = readPendingPhantomPayment();
        clearPendingPhantomPayment(pendingPayment?.paymentResumeId);
      }

      throw error;
    }
  }, [
    clearPendingPhantomPayment,
    connection,
    mobileWalletPublicKey,
    publicKey,
    readPendingPhantomPayment,
    sendTransaction,
    startPhantomMobilePayment,
    t,
    verifySubmittedPayment,
  ]);

  const handleRetryPaymentVerification = useCallback(async () => {
    if (!paymentSubmission?.signature) {
      return null;
    }

    return verifySubmittedPayment({
      quote: paymentSubmission.quote || restoredPaymentQuote,
      signature: paymentSubmission.signature,
      explorerUrl: paymentSubmission.explorerUrl,
    });
  }, [paymentSubmission, restoredPaymentQuote, verifySubmittedPayment]);

  useEffect(() => {
    const handleScroll = () => {
      // Kalau scroll ke bawah lebih dari 50px, navbar bakal mengecil
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isProfileMenuOpen]);

  useEffect(() => {
    if (!isLoginModalOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsLoginModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isLoginModalOpen]);



  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    let observer;
    let isMounted = true;

    const fetchSolPrice = async () => {
      try {
        const pythSolIdrRate = await fetchSolIdrRateFromPyth();
        if (isMounted) {
          setSolPrice(pythSolIdrRate);
        }
      } catch (error) {
        const message = error?.code === 'PYTH_RATE_LIMITED'
          ? 'Pyth Hermes rate limit while fetching SOL/IDR:'
          : 'Gagal mengambil harga SOL dari Pyth:';
        console.error(message, error);
      }
    };

    fetchSolPrice();
    const priceInterval = setInterval(fetchSolPrice, 60000);

    scope.current = createScope({ root }).add(() => {
      animate('.nav-item', { translateY: [-30, 0], opacity: [0, 1], duration: 800, delay: stagger(100), ease: 'out(3)' });
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target.classList.contains('creator-section')) {
              animate(entry.target, { opacity: [0, 1], duration: 800 });
            } else {
              animate(entry.target, { translateY: [50, 0], opacity: [0, 1], duration: 1200, easing: 'easeOutQuart' });
            }
            observer.unobserve(entry.target); 
          }
        });
      }, { threshold: 0.2 });

      const scrollElements = document.querySelectorAll('.scroll-animate, .creator-section');
      scrollElements.forEach((el) => observer.observe(el));
    });

    return () => {
      isMounted = false;
      scope.current.revert();
      if (observer) observer.disconnect();
      clearInterval(priceInterval);
    };
  }, []);

  const scrollToSection = (target) => {
    if (target === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#070907] text-white selection:bg-brand selection:text-black" ref={root}>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-size-[48px_48px]"></div>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_72%_16%,rgba(20,241,149,0.11),transparent_26%),radial-gradient(circle_at_18%_20%,rgba(153,69,255,0.10),transparent_24%),linear-gradient(180deg,rgba(7,9,7,0)_0%,#070907_85%)]"></div>

      <div className="relative z-10">
        <header className={`sticky z-50 flex justify-center px-4 transition-all duration-500 sm:px-6 lg:px-8 ${isScrolled ? 'top-3' : 'top-0'}`}>
          <nav className={`nav-item grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border opacity-0 backdrop-blur-xl transition-all duration-500 ${isScrolled ? 'mt-3 border-white/10 bg-[#0c100d]/88 px-3 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:px-4' : 'border-transparent bg-transparent px-0 py-4 sm:py-5'}`}>
            <button type="button" onClick={() => scrollToSection('top')} className="col-start-1 flex min-w-0 items-center gap-2 text-left sm:gap-2.5">
              <KonekLogo className="h-8 w-8 shrink-0" />
              <span className="truncate text-sm font-semibold text-white sm:text-lg">Konek<span className="text-brand">Pay</span></span>
            </button>

            <ul className="col-start-2 hidden min-w-0 items-center justify-center gap-1 text-sm font-semibold text-zinc-400 xl:flex">
              {navItems.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => scrollToSection(item.target)}
                    className="px-3 py-2 transition-colors hover:text-brand"
                  >
                    {t(item.key)}
                  </button>
                </li>
              ))}
            </ul>

            <div className="col-start-3 flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
              {userProfile.isLoggedIn ? (
                <div ref={profileMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}
                    className="flex h-9 items-center gap-2 border border-brand/25 bg-brand/5 px-3 text-xs font-semibold text-zinc-200 transition hover:border-brand/45 hover:bg-brand/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    aria-haspopup="menu"
                    aria-expanded={isProfileMenuOpen}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-brand"></span>
                    <span className="max-w-28 truncate font-mono">{userProfile.name}</span>
                    <svg className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition ${isProfileMenuOpen ? 'rotate-180 text-brand' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m6 9 6 6 6-6"></path>
                    </svg>
                  </button>

                  <div
                    className={`absolute right-0 top-11 w-72 max-w-[calc(100vw-2rem)] border border-white/10 bg-[#080b08]/95 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-200 ${isProfileMenuOpen ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-2 invisible pointer-events-none'}`}
                    role="menu"
                  >
                    <div className="mb-2 border-b border-white/10 px-2 pb-3 pt-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-brand"></span>
                        <p className="text-[11px] font-semibold text-brand">{t('walletDropdown.label')}</p>
                      </div>
                      <p className="mt-3 text-[11px] font-semibold text-zinc-500">{t('walletDropdown.address')}</p>
                      <p className="mt-1 truncate font-mono text-sm font-semibold text-white" title={userProfile.address}>{userProfile.address}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDisconnectWallet}
                      className="w-full border border-red-500/15 bg-red-500/5 px-3 py-2.5 text-left text-sm font-semibold text-red-300 transition-colors hover:border-red-500/35 hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      role="menuitem"
                    >
                      {t('walletDropdown.disconnect')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsLoginModalOpen(true)}
                  className="inline-flex h-9 shrink-0 items-center border border-white/10 bg-white/4 px-2.5 text-xs font-semibold text-zinc-300 transition hover:border-brand/40 hover:text-brand sm:px-3"
                >
                  <span className="sm:hidden">{t('navbar.wallet')}</span>
                  <span className="hidden sm:inline">{t('navbar.connectWallet')}</span>
                </button>
              )}

              <button onClick={toggleTheme} className="grid h-9 w-9 place-items-center border border-white/10 bg-white/4 text-zinc-300 transition hover:border-brand/40 hover:text-brand focus:outline-none" aria-label="Toggle theme">
                {theme === 'dark' ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                )}
              </button>

              <button onClick={toggleLang} className="h-9 shrink-0 border border-white/10 bg-white/4 px-2 text-[10px] font-bold uppercase tracking-[0.12em] transition hover:border-brand/40" title="Switch language">
                <span className={lang === 'id' ? 'text-brand' : 'text-zinc-500'}>ID</span>
                <span className="mx-0.5 text-zinc-700">/</span>
                <span className={lang === 'en' ? 'text-brand' : 'text-zinc-500'}>EN</span>
              </button>
            </div>
          </nav>
        </header>

        <main className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-8 px-4 pb-12 pt-7 sm:px-6 md:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.78fr)] lg:items-center lg:px-8 lg:pb-16 lg:pt-12" data-hero-section>
          <section className="min-w-0 max-w-3xl">
            <h1 className="hero-text text-4xl font-semibold leading-[1.04] text-white sm:text-5xl lg:text-6xl xl:text-7xl" data-hero-word>
              {t('hero.headline')}
            </h1>
            <p className="hero-text mt-5 max-w-2xl text-base leading-8 text-zinc-400 md:text-lg" data-hero-copy>
              {t('hero.subtitle')}
            </p>
            <div className="hero-text mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" data-hero-cta>
              <button
                onClick={handleOpenApp}
                className="inline-flex min-h-12 w-full items-center justify-center bg-brand px-7 py-3 text-sm font-bold tracking-[0.02em] text-black shadow-[0_0_22px_rgba(20,241,149,0.18)] transition hover:-translate-y-0.5 sm:w-auto"
              >
                {t('hero.ctaBtn')}
              </button>
              <div className="inline-flex min-h-12 min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border border-white/10 bg-white/[0.035] px-4 py-3 text-sm sm:justify-start">
                <span className="h-2 w-2 rounded-full bg-brand"></span>
                <span className="text-xs font-semibold text-zinc-500">{t('hero.pythRate')}</span>
                <span className="font-semibold text-white">1 SOL</span>
                <span className="text-zinc-600">=</span>
                <span className="font-semibold text-brand">{solPrice ? `Rp ${Math.round(solPrice).toLocaleString('id-ID')}` : t('hero.loading')}</span>
              </div>
            </div>
          </section>

          <section className="hero-text w-full min-w-0">
            <ProtocolDiagram t={t} />
          </section>
        </main>

        <section id="usp-section" className="scroll-mt-28 border-b border-white/10">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
            <div className="scroll-animate opacity-0 mb-9">
              <SectionHeader title={t('usp.heading')}>
                {t('usp.intro')}
              </SectionHeader>
            </div>
            <div className="grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-3">
              {uspItems.map((key) => (
                <article key={key} className="scroll-animate min-w-0 bg-[#080b08] p-5 opacity-0 md:p-6">
                  <div className="mb-5 flex h-9 w-9 items-center justify-center border border-brand/30 bg-brand/8 text-sm font-semibold text-brand">
                    {String(uspItems.indexOf(key) + 1).padStart(2, '0')}
                  </div>
                  <h3 className="text-xl font-semibold text-white">{t(`usp.${key}Title`)}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{t(`usp.${key}Body`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow-section" className="scroll-mt-28 border-b border-white/10" data-how-section>
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
            <div className="scroll-animate opacity-0 mb-9">
              <SectionHeader title={t('howItWorks.heading')} />
            </div>
            <div className="grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-2 lg:grid-cols-5" data-how-track>
              {[1, 2, 3, 4, 5].map((n) => (
                <article key={n} className="scroll-animate min-w-0 bg-[#080b08] p-5 opacity-0 md:p-6" data-how-card>
                  <p className="text-[11px] font-bold text-brand">{String(n).padStart(2, '0')}</p>
                  <h3 className="mt-5 text-lg font-semibold leading-6 text-white lg:min-h-12">{t(`howItWorks.step${n}Title`)}</h3>
                  <p className="mt-4 text-sm leading-6 text-zinc-500">{t(`howItWorks.step${n}Desc`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="proof-section" className="scroll-mt-28 border-b border-white/10 bg-[#090c09]/70">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[0.78fr_1fr] lg:px-8 lg:py-16">
            <div className="scroll-animate min-w-0 opacity-0">
              <SectionHeader title={t('demoProof.heading')}>
                {t('demoProof.body')}
              </SectionHeader>
              <div className="mt-7 border-l-2 border-brand/70 pl-5">
                <p className="text-sm leading-7 text-zinc-300">{t('demoProof.note')}</p>
              </div>
            </div>
            <div className="scroll-animate grid min-w-0 gap-px overflow-hidden border border-white/10 bg-white/10 opacity-0 sm:grid-cols-2">
              {techProofItems.map((key) => (
                <div key={key} className="flex min-w-0 items-center gap-3 bg-[#080b08] px-5 py-4">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-brand"></span>
                  <span className="text-sm text-zinc-300">{t(`techProof.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="team-section" className="creator-section scroll-mt-28 border-b border-white/10 opacity-0">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[0.78fr_1fr] lg:px-8 lg:py-16">
            <div className="min-w-0">
              <SectionHeader title={t('team.heading')}>
                {t('team.intro')}
              </SectionHeader>
              <div className="mt-7 border-l-2 border-purple-400/70 pl-5">
                <p className="text-sm leading-7 text-zinc-300">{t('team.contactBody')}</p>
              </div>
            </div>
            <div className="grid min-w-0 gap-px overflow-hidden border border-white/10 bg-white/10">
              {teamMembers.map((member) => (
                <article key={member} className="min-w-0 bg-[#080b08] p-5">
                  <div className="flex min-w-0 items-start gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center border border-brand/30 bg-brand/8 text-sm font-semibold text-brand">
                      {t(`team.${member}Initials`)}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-white">{t(`team.${member}Name`)}</h3>
                      <p className="mt-1 text-sm font-semibold leading-6 text-brand">{t(`team.${member}Role`)}</p>
                      <p className="mt-3 text-sm leading-6 text-zinc-400">{t(`team.${member}Desc`)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <footer className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10 pb-28 text-sm font-semibold text-zinc-600 sm:px-6 md:flex-row md:items-center md:justify-between md:pb-10 lg:px-8">
          <button type="button" className="flex items-center gap-2 text-white" onClick={() => scrollToSection('top')}>
            <KonekLogo className="h-6 w-6" />
            <span>Konek<span className="text-brand">Pay</span></span>
          </button>
          <p>{t('footer.builtFor')}</p>
        </footer>
      </div>

      <button
        onClick={handleOpenApp}
        className="fixed inset-x-4 bottom-4 z-50 inline-flex min-h-12 items-center justify-center gap-2 bg-brand px-5 py-3 text-sm font-bold tracking-[0.02em] text-black shadow-[0_0_24px_rgba(20,241,149,0.2)] transition hover:-translate-y-0.5 md:hidden"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
        </svg>
        {t('fab.qrisPay')}
      </button>


      {/* ========================================================= */}
      {/* KUMPULAN POP-UP / MODAL (LOGIN, SCANNER, PAYMENT) */}
      {/* ========================================================= */}

      {/* 1. POP-UP LOGIN (Tampil kalau belum konek dompet) */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in transition-all">
          <div
            className="relative w-full max-w-120 border border-purple-400/25 bg-[#080b08] p-6 text-left shadow-[0_24px_70px_rgba(0,0,0,0.42)] transition-colors sm:p-7"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-connect-title"
          >
            
            <button
              onClick={() => setIsLoginModalOpen(false)}
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center border border-white/10 bg-white/4 text-zinc-400 transition-colors hover:border-red-500/30 hover:text-red-300"
              aria-label="Close wallet modal"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <div className="mb-6 flex h-14 w-14 items-center justify-center border border-purple-400/25 bg-purple-500/10">
              <img src={logoPhantom} alt="Phantom" className="h-8 w-8 object-contain" />
            </div>
            
            <p className="mb-2 text-[11px] font-semibold text-purple-300">{t('navbar.wallet')}</p>
            <h3 id="wallet-connect-title" className="pr-10 text-2xl font-semibold text-white">{t('loginModal.title')}</h3>
            <p className="mb-7 mt-3 text-sm leading-7 text-zinc-400">
              {t('loginModal.desc')}
            </p>
            
            <button 
              onClick={handleConnectWallet}
              disabled={isConnecting}
              className="flex min-h-12 w-full items-center justify-center gap-3 bg-[#AB9FF2] px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-[#bdb3ff] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
            >
              {t('loginModal.btn')}
            </button>
          </div>
        </div>
      )}

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      {/* 2. POP-UP SCANNER (Tampil kalau udah login dan pencet QRIS PAY) */}
      {isScannerOpen && (
        <QrisScanner 
          onClose={() => setIsScannerOpen(false)} 
          onResult={handleScannerResult}
          t={t} 
        />
      )}

      {/* 3. POP-UP PAYMENT (Tampil kalau scanner berhasil nangkep QR) */}
      {scannedData && (
        <PaymentPage 
          key={scannedData}
          qrisData={scannedData}
          initialParsedData={parsedPaymentData}
          initialQuote={restoredPaymentQuote}
          paymentSubmission={paymentSubmission}
          paymentVerification={paymentVerification}
          externalPaymentError={paymentError}
          mobilePaymentState={mobilePaymentState}
          onParsedData={handleParsedPaymentData}
          onCancel={handlePaymentCancel}
          onConfirm={handlePaymentConfirm}
          onRetryVerification={handleRetryPaymentVerification}
          onScanAnother={handleScanAnotherPayment}
          t={t}
        />
      )}

    </div>
  );
}

export default App;
