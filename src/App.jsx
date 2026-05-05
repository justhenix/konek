import { useEffect, useRef, useState, useMemo, useCallback, Fragment } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair } from '@solana/web3.js';
import { animate, createScope, stagger } from 'animejs'; 
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import './App.css';
import { createT } from './utils/translations';

// --- IMPORT FOTO TIM KREATOR ---
import fotoAqiel from './assets/AKILRAJAIBLIS.png';
import fotoSiti from './assets/HENIX.png';

// --- IMPORT LOGO BARU ---
import logoSolana from './assets/LogoSolana.png';
import logoPhantom from './assets/LogoPhantom.png';

import logoSuperteam from './assets/LogoSuperteam.png';

// --- IMPORT KOMPONEN TRANSAKSI ---
import QrisScanner from './QrisScanner';
import PaymentPage from './PaymentPage'; // Pastikan file PaymentPage.jsx udah ada di folder src
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

// ─────────────────────────────────────────────────────
// PYTH NETWORK PRICE CONFIG
// ─────────────────────────────────────────────────────
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

const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  return Math.abs(hash).toString(16);
};


const navItems = [
  { key: 'navbar.home', target: 'top' },
  { key: 'navbar.about', target: 'problem-section' },
  { key: 'navbar.howItWorks', target: 'workflow-section' },
  { key: 'navbar.team', target: 'team-section' },
];




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
    <div className="relative w-full max-w-xl mx-auto lg:mx-0" data-hero-diagram>
      <div className="absolute inset-4 hidden sm:block border border-dashed border-white/10 rounded-full"></div>
      <div className="absolute left-1/2 top-10 bottom-10 hidden sm:block w-px bg-linear-to-b from-transparent via-brand/40 to-transparent"></div>
      <div className="relative grid gap-3 sm:gap-4">
        {nodes.map((node, index) => (
          <div
            key={index}
            className={`protocol-node hero-text relative border ${node.accent} bg-[#111411]/85 backdrop-blur-sm px-4 py-4 sm:px-5 sm:py-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)]`}
          >
            {index < nodes.length - 1 && (
              <div className="absolute left-6 top-full h-3 sm:h-4 w-px bg-brand/35" aria-hidden="true"></div>
            )}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm sm:text-base font-semibold tracking-tight text-white">{node.label}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">{node.sub}</p>
              </div>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${index === 2 || index === 4 ? 'bg-purple-400' : 'bg-brand'}`}></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
const SectionHeader = ({ eyebrow, title, children }) => (
  <div className="max-w-3xl">
    <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.24em] text-brand">{eyebrow}</p>
    <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-white leading-[1.05]">{title}</h2>
    {children && (
      <p className="mt-5 text-base md:text-lg leading-8 text-zinc-400">{children}</p>
    )}
  </div>
);

function App() {
  // --- STATE UNTUK ANIMASI NAVBAR ---
  const [isScrolled, setIsScrolled] = useState(false);
  const root = useRef(null);
  const scope = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
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

  // --- STATE UNTUK FLOW APLIKASI (LOGIN -> SCAN -> PAY) ---
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
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

  // ==========================================
  // USER PROFILE (derived from publicKey — no effect needed)
  // ==========================================
  const userProfile = useMemo(() => {
    const pKeyStr = publicKey?.toBase58() || mobileWalletPublicKey;
    if (pKeyStr) {
      if (import.meta.env.DEV) {
        console.log(pKeyStr);
      }
      return {
        isLoggedIn: true,
        name: `${pKeyStr.slice(0, 4)}...${pKeyStr.slice(-4)}`,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${hashString(pKeyStr)}`
      };
    }
    return {
      isLoggedIn: false,
      name: "Guest",
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=Guest`
    };
  }, [publicKey, mobileWalletPublicKey]);

  // ==========================================
  // 🚨 AREA BACKEND DEV: FUNGSI KONEK WALLET 🚨
  // ==========================================
  const handleConnectWallet = async () => {
    try {
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

      const phantomWallet = wallets.find((w) => w.adapter.name === 'Phantom');
      if (phantomWallet) {
        if (phantomWallet.readyState === 'Installed' || phantomWallet.readyState === 'Loadable') {
          select(phantomWallet.adapter.name);
          await connect();
          setIsLoginModalOpen(false);
        } else {
          alert("Phantom Wallet is not ready or installed. Please install it to continue.");
          window.open("https://phantom.app/", "_blank");
        }
      } else {
        alert("Phantom Wallet is not installed.");
        window.open("https://phantom.app/", "_blank");
      }
    } catch (error) {
      console.error("Failed to connect to wallet:", error);
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
      setIsMenuOpen(false);
      setScannedData(null);
      setParsedPaymentData(null);
      setRestoredPaymentQuote(null);
      setPaymentSubmission(null);
      setPaymentError(null);
      setPaymentVerification(createIdlePaymentVerification());
      setMobilePaymentState(null);
      clearPendingPhantomPayment();
    }
  }, [clearPendingPhantomPayment, connected, disconnect, publicKey]);

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
      });
    } catch (error) {
      console.error('Failed to decrypt Phantom mobile connect response:', error);
    } finally {
      cleanCurrentUrlParams();
    }
  }, [
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
        <header className={`sticky z-50 flex justify-center px-3 sm:px-5 transition-all duration-500 ${isScrolled ? 'top-3' : 'top-0'}`}>
          <nav className={`nav-item opacity-0 grid w-full max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-3 border backdrop-blur-xl transition-all duration-500 ${isScrolled ? 'mt-3 border-white/10 bg-[#0c100d]/88 px-3 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.28)]' : 'border-transparent bg-transparent px-0 py-5 sm:px-2'}`}>
            <button type="button" onClick={() => scrollToSection('top')} className="flex min-w-0 items-center gap-2.5 text-left">
              <KonekLogo className="h-8 w-8 shrink-0" />
              <span className="text-base sm:text-lg font-semibold tracking-tight text-white">Konek<span className="text-brand">Pay</span></span>
            </button>

            <ul className="hidden lg:flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              {navItems.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => scrollToSection(item.target)}
                    className="px-4 py-2 transition-colors hover:text-brand"
                  >
                    {t(item.key)}
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
              {userProfile.isLoggedIn ? (
                <div ref={profileMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}
                    className="flex items-center gap-2 border border-white/10 bg-white/4 p-1.5 text-xs font-semibold text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    aria-haspopup="menu"
                    aria-expanded={isProfileMenuOpen}
                  >
                    <span className="hidden xl:block max-w-24 truncate">{userProfile.name}</span>
                    <img src={userProfile.avatarUrl} alt="User Avatar" className="h-7 w-7 rounded-full object-cover" />
                  </button>

                  <div
                    className={`absolute right-0 top-11 w-56 max-w-[calc(100vw-2rem)] border border-white/10 bg-[#0c100d]/95 p-3 shadow-2xl backdrop-blur-xl transition-all duration-200 ${isProfileMenuOpen ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-2 invisible pointer-events-none'}`}
                    role="menu"
                  >
                    <div className="mb-2 flex items-center gap-3 border-b border-white/10 px-2 py-2">
                      <img src={userProfile.avatarUrl} alt="User Avatar" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                      <div className="min-w-0 text-left">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">{t('navbar.wallet')}</p>
                        <p className="truncate text-sm font-semibold text-white">{userProfile.name}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDisconnectWallet}
                      className="w-full px-3 py-3 text-left text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10"
                      role="menuitem"
                    >
                      {t('navbar.disconnectWallet')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsLoginModalOpen(true)}
                  className="hidden sm:inline-flex border border-white/10 bg-white/4 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-300 transition hover:border-brand/40 hover:text-brand"
                >
                  {t('navbar.connectWallet')}
                </button>
              )}

              <button onClick={toggleTheme} className="grid h-9 w-9 place-items-center border border-white/10 bg-white/4 text-zinc-300 transition hover:border-brand/40 hover:text-brand focus:outline-none" aria-label="Toggle theme">
                {theme === 'dark' ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                )}
              </button>

              <button onClick={toggleLang} className="h-9 border border-white/10 bg-white/4 px-2 text-[10px] font-bold uppercase tracking-[0.12em] transition hover:border-brand/40" title="Switch language">
                <span className={lang === 'id' ? 'text-brand' : 'text-zinc-500'}>ID</span>
                <span className="mx-0.5 text-zinc-700">/</span>
                <span className={lang === 'en' ? 'text-brand' : 'text-zinc-500'}>EN</span>
              </button>

              <button className="grid h-9 w-9 place-items-center border border-white/10 bg-white/4 text-zinc-300 transition hover:border-brand/40 hover:text-brand lg:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Toggle menu">
                <div className="relative h-4 w-5">
                  <span className={`absolute left-0 h-px w-full bg-current transition-all ${isMenuOpen ? 'top-1/2 rotate-45' : 'top-0'}`} />
                  <span className={`absolute left-0 top-1/2 h-px w-full bg-current transition-all ${isMenuOpen ? 'opacity-0' : 'opacity-100'}`} />
                  <span className={`absolute left-0 h-px w-full bg-current transition-all ${isMenuOpen ? 'top-1/2 -rotate-45' : 'top-full'}`} />
                </div>
              </button>
            </div>
          </nav>
        </header>

        <div className={`lg:hidden fixed left-3 right-3 top-20 z-40 border border-white/10 bg-[#0c100d]/95 p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 ${isMenuOpen ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-3 invisible pointer-events-none'}`}>
          <ul className="grid gap-2 text-sm font-bold uppercase tracking-[0.16em] text-zinc-300">
            {navItems.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className="w-full px-3 py-3 text-left transition-colors hover:bg-white/4 hover:text-brand"
                  onClick={() => {
                    setIsMenuOpen(false);
                    scrollToSection(item.target);
                  }}
                >
                  {t(item.key)}
                </button>
              </li>
            ))}
            {!userProfile.isLoggedIn && (
              <li>
                <button type="button" onClick={() => { setIsMenuOpen(false); setIsLoginModalOpen(true); }} className="w-full border border-brand/40 px-3 py-3 text-left text-brand">
                  {t('navbar.connectWallet')}
                </button>
              </li>
            )}
          </ul>
        </div>

        <main className="mx-auto grid min-h-[calc(100vh-84px)] w-full max-w-7xl grid-cols-1 items-center gap-10 px-4 pb-12 pt-10 sm:px-6 md:pt-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.8fr)] lg:px-8" data-hero-section>
          <section className="max-w-3xl">
            <div className="hero-text mb-5 inline-flex border border-brand/30 bg-brand/6 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-brand" data-hero-word>
              {t('hero.badge')}
            </div>
            <h1 className="hero-text text-[clamp(2.2rem,8vw,4.2rem)] font-semibold leading-[1.05] tracking-tight text-white" data-hero-word>
              {t('hero.headline')}
            </h1>
            <p className="hero-text mt-6 max-w-2xl text-base leading-8 text-zinc-400 md:text-lg" data-hero-copy>
              {t('hero.subtitle')}
            </p>
            <div className="hero-text mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" data-hero-cta>
              <button
                onClick={handleOpenApp}
                className="inline-flex min-h-12 items-center justify-center bg-brand px-7 py-3 text-sm font-bold uppercase tracking-[0.16em] text-black shadow-[0_0_26px_rgba(20,241,149,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_0_34px_rgba(20,241,149,0.34)]"
              >
                {t('hero.ctaBtn')}
              </button>
              <div className="inline-flex min-h-12 items-center justify-center gap-3 border border-white/10 bg-white/[0.035] px-4 py-3 text-sm">
                <span className="h-2 w-2 rounded-full bg-brand"></span>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">{t('hero.pythRate')}</span>
                <span className="font-semibold text-white">1 SOL</span>
                <span className="text-zinc-600">=</span>
                <span className="font-semibold text-brand">{solPrice ? `Rp ${Math.round(solPrice).toLocaleString('id-ID')}` : t('hero.loading')}</span>
              </div>
            </div>
          </section>

          <section className="hero-text w-full">
            <ProtocolDiagram t={t} />
          </section>
        </main>

        {/* ─── Ecosystem strip ─── */}
        <section className="border-y border-white/10 bg-[#090c09]/80">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-8 sm:px-6 lg:px-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-600">{t('partner.heading')}</p>
            <div className="flex flex-wrap items-center gap-8 opacity-55 grayscale">
              <img src={logoSolana} alt="Solana" className="h-7 w-auto object-contain" />
              <img src={logoPhantom} alt="Phantom" className="h-7 w-auto object-contain" />
              <img src={logoSuperteam} alt="Superteam" className="h-8 w-auto object-contain" />
            </div>
          </div>
        </section>

        {/* ─── Problem ─── */}
        <section id="problem-section" className="scroll-mt-28 border-b border-white/10">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-[0.92fr_1fr] lg:px-8 lg:py-28">
            <div className="scroll-animate opacity-0">
              <SectionHeader eyebrow={t('problem.eyebrow')} title={t('problem.heading')} />
            </div>
            <div className="scroll-animate opacity-0 grid gap-5 text-lg leading-8 text-zinc-400">
              <p>{t('problem.body')}</p>
            </div>
          </div>
        </section>

        {/* ─── Solution ─── */}
        <section id="about-section" className="scroll-mt-28 border-b border-white/10">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-[1fr_0.9fr] lg:px-8 lg:py-28">
            <div className="scroll-animate opacity-0">
              <SectionHeader eyebrow={t('solution.eyebrow')} title={t('solution.heading')}>
                {t('solution.body')}
              </SectionHeader>
            </div>
            <div className="scroll-animate opacity-0 border border-white/10 bg-white/[0.035] p-6">
              <div className="mb-8 flex items-center justify-between border-b border-white/10 pb-5">
                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">{t('solution.eyebrow')}</span>
                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand">Devnet Demo</span>
              </div>
              <div className="grid gap-4">
                {[t('protocol.node1Label'), t('protocol.node2Sub'), t('protocol.node3Label'), t('protocol.node4Sub')].map((item) => (
                  <div key={item} className="flex items-center justify-between border-b border-white/10 py-3 last:border-b-0">
                    <span className="text-sm text-zinc-400">{item}</span>
                    <span className="h-2 w-2 rounded-full bg-brand"></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── How it Works ─── */}
        <section id="workflow-section" className="scroll-mt-28 border-b border-white/10" data-how-section>
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="scroll-animate opacity-0 mb-12">
              <SectionHeader eyebrow={t('howItWorks.eyebrow')} title={t('howItWorks.heading')} />
            </div>
            <div className="grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-2 lg:grid-cols-5" data-how-track>
              {[1, 2, 3, 4, 5].map((n) => (
                <article key={n} className="scroll-animate opacity-0 bg-[#080b08] p-5 md:p-6" data-how-card>
                  <p className="text-[11px] font-bold text-brand">{String(n).padStart(2, '0')}</p>
                  <h3 className="mt-6 min-h-12 text-lg font-semibold leading-6 text-white">{t(`howItWorks.step${n}Title`)}</h3>
                  <p className="mt-4 text-sm leading-6 text-zinc-500">{t(`howItWorks.step${n}Desc`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Tech Proof ─── */}
        <section className="border-b border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="scroll-animate opacity-0 mb-10">
              <SectionHeader eyebrow={t('techProof.eyebrow')} title={t('techProof.heading')} />
            </div>
            <div className="scroll-animate opacity-0 grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {techProofItems.map((key) => (
                <div key={key} className="flex items-center gap-3 bg-[#080b08] px-5 py-4">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-brand"></span>
                  <span className="text-sm text-zinc-300">{t(`techProof.${key}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Demo Honesty ─── */}
        <section className="border-b border-white/10 bg-[#0a0d0a]">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="scroll-animate opacity-0 border-l-2 border-brand/70 pl-6">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-brand">{t('demoHonesty.eyebrow')}</p>
              <p className="max-w-4xl text-xl leading-9 text-zinc-300">{t('demoHonesty.body')}</p>
            </div>
          </div>
        </section>

        {/* ─── Team ─── */}
        <section id="team-section" className="creator-section scroll-mt-28 opacity-0 border-b border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="mb-12">
              <SectionHeader eyebrow={t('team.badge')} title={t('team.heading')} />
            </div>
            <div className="grid gap-px overflow-hidden border border-white/10 bg-white/10 md:grid-cols-2">
              {[
                { name: 'Henix', roleKey: 'team.henixRole', descKey: 'team.henixDesc', tags: ['Full-stack', 'Solana', 'Product'], photo: fotoSiti },
                { name: 'Aqiel', roleKey: 'team.aqielRole', descKey: 'team.aqielDesc', tags: ['Frontend', 'UI', 'Product'], photo: fotoAqiel },
              ].map((member) => (
                <article key={member.name} className="bg-[#080b08] p-6 md:p-8">
                  <div className="flex items-start gap-5">
                    <img src={member.photo} alt={member.name} className="h-20 w-20 shrink-0 border border-white/10 object-cover grayscale" />
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight text-white">{member.name}</h3>
                      <p className="mt-2 text-sm font-semibold text-brand">{t(member.roleKey)}</p>
                    </div>
                  </div>
                  <p className="mt-7 text-base leading-7 text-zinc-400">{t(member.descKey)}</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {member.tags.map((tag) => (
                      <span key={tag} className="border border-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">{tag}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <footer className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-12 pb-32 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <button type="button" className="flex items-center gap-2 text-white" onClick={() => scrollToSection('top')}>
            <KonekLogo className="h-6 w-6" />
            <span>Konek<span className="text-brand">Pay</span></span>
          </button>
          <p>{t('footer.builtFor')}</p>
        </footer>
      </div>

      <button
        onClick={handleOpenApp}
        className="fixed bottom-8 right-8 z-50 hidden min-h-12 items-center gap-2 bg-brand px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-black shadow-[0_0_24px_rgba(20,241,149,0.25)] transition hover:-translate-y-0.5 md:inline-flex"
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
        <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in transition-all">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-[2.5rem] max-w-sm w-full p-8 text-center shadow-2xl relative transition-colors">
            
            <button onClick={() => setIsLoginModalOpen(false)} className="absolute top-6 right-6 text-zinc-400 hover:text-red-500 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <div className="w-24 h-24 bg-purple-500/10 dark:bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(147,51,234,0.3)]">
              <img src={logoPhantom} alt="Phantom" className="w-12 h-12 object-contain" />
            </div>
            
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white mb-2 uppercase tracking-tight">{t('loginModal.title')}</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8 leading-relaxed">
              {t('loginModal.desc')}
            </p>
            
            <button 
              onClick={handleConnectWallet}
              className="w-full bg-[#AB9FF2] text-zinc-900 font-black tracking-widest uppercase py-4 rounded-2xl shadow-lg hover:scale-105 transition-all flex justify-center items-center gap-3"
            >
              {t('loginModal.btn')}
            </button>
          </div>
        </div>
      )}

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
