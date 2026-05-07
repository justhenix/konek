import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseEmvcoQris } from './utils/parseEmvcoQris';
import DevnetSafetyNotice from './components/DevnetSafetyNotice';
import { formatDateTime } from './utils/dateFormat';
import {
  buildReceiptSummary,
  cleanReceiptValue,
  copyTextToClipboard,
  createReceiptFileName,
  downloadTextFile,
  truncateMiddle,
} from './utils/receipt';
import {
  buildSolanaExplorerDevnetTxUrl,
  formatIdrAmount,
  formatSolAmount,
  isQuoteExpired,
  normalizeApiError,
  solToLamports,
} from './utils/payment';

const FRONTEND_TREASURY_MISSING_ERROR = 'Frontend VITE_TREASURY_WALLET is missing.';
const FRONTEND_TREASURY_INVALID_ERROR = 'Frontend VITE_TREASURY_WALLET is not a valid Solana address.';
const PAYMENT_CONFIG_MISSING_MESSAGE = (
  'Payment setup is not ready on this demo. Please try again later.'
);
const PAYMENT_CONFIG_INVALID_MESSAGE = (
  'Payment setup needs attention on this demo. Please try again later.'
);
const isMissingAmountError = (errorMsg) => {
  const msg = String(errorMsg).toLowerCase();
  return msg.includes('tag 54') || msg.includes('transaction amount') || msg.includes('amount is missing') || msg.includes('missing amount');
};
const MAX_IDR_AMOUNT = 1_000_000_000;
const MANUAL_IDR_AMOUNT_RE = /^\d+$/;

const formatPaymentErrorForDisplay = (error, t) => {
  if (!error) {
    return null;
  }

  const message = error.message || '';

  if (message.includes(FRONTEND_TREASURY_MISSING_ERROR)) {
    return {
      ...error,
      code: 'PAYMENT_CONFIG_MISSING',
      message: PAYMENT_CONFIG_MISSING_MESSAGE,
    };
  }

  if (message.includes(FRONTEND_TREASURY_INVALID_ERROR)) {
    return {
      ...error,
      code: 'PAYMENT_CONFIG_INVALID',
      message: PAYMENT_CONFIG_INVALID_MESSAGE,
    };
  }

  const lowerMessage = message.toLowerCase();
  if (
    lowerMessage.includes('tag 54') ||
    lowerMessage.includes('transaction amount') ||
    lowerMessage.includes('amount is missing') ||
    lowerMessage.includes('missing amount') ||
    lowerMessage.includes('tag 59') ||
    lowerMessage.includes('emvco') ||
    lowerMessage.includes('payload') ||
    lowerMessage.includes('parser') ||
    lowerMessage.includes('backend') ||
    lowerMessage.includes('settlement') ||
    lowerMessage.includes('signed quote') ||
    lowerMessage.includes('raw qris') ||
    lowerMessage.includes('devnet') ||
    lowerMessage.includes('qris data not ready')
  ) {
    return {
      ...error,
      message: t ? t('payment.errorBody') : 'Something went wrong while preparing this payment. Try again or use Demo QRIS.',
    };
  }

  return error;
};

const getParsedPayment = (qrisData, initialParsedData) => {
  const hasUsableInitialParsedData = initialParsedData?.rawData === qrisData
    && typeof initialParsedData.isValid === 'boolean'
    && Array.isArray(initialParsedData.errors)
    && initialParsedData.tags
    && typeof initialParsedData.tags === 'object';

  if (hasUsableInitialParsedData) {
    return initialParsedData;
  }

  return parseEmvcoQris(qrisData);
};

const getQrisIssueType = (parsedPayment) => {
  if (!parsedPayment || parsedPayment.isValid) {
    return null;
  }

  const errors = parsedPayment.errors || [];
  const hasMissingAmountError = errors.some(isMissingAmountError);
  const isMissingAmountOnly = parsedPayment.isTlvValid
    && parsedPayment.merchantName
    && !parsedPayment.amountText
    && errors.length === 1
    && hasMissingAmountError;

  return isMissingAmountOnly ? 'missingAmount' : 'unsupported';
};

const validateManualIdrAmount = (value, t) => {
  const normalizedValue = String(value ?? '').trim();

  if (!normalizedValue) {
    return { amount: null, error: t('payment.manualAmountRequired') };
  }

  if (!MANUAL_IDR_AMOUNT_RE.test(normalizedValue)) {
    return { amount: null, error: t('payment.manualAmountInvalid') };
  }

  const amount = BigInt(normalizedValue);

  if (amount <= 0n) {
    return { amount: null, error: t('payment.manualAmountPositive') };
  }

  if (amount > BigInt(MAX_IDR_AMOUNT)) {
    return { amount: null, error: t('payment.manualAmountTooHigh') };
  }

  return { amount: Number(amount), error: '' };
};

const readJsonResponse = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const fetchSettleDemo = async ({ quoteId, signature }) => {
  const response = await fetch('/api/v1/payment/settle-demo', {
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
      { ...(responseBody || {}), status: response.status },
      'Unable to simulate settlement.'
    );
    const error = new Error(apiError.message);
    error.apiError = apiError;
    throw error;
  }

  return responseBody;
};

const formatPanelDateTime = (value, language, t) => (
  formatDateTime(value, language) || t('payment.lblDateUnavailable')
);

const fetchPaymentQuote = async ({ qrisPayload, idrAmount, walletAddress, signal }) => {
  const requestBody = { qrisPayload };

  if (idrAmount !== null && idrAmount !== undefined) {
    requestBody.idrAmount = String(idrAmount);
  }

  if (walletAddress) {
    requestBody.walletAddress = walletAddress;
  }

  let response;
  try {
    response = await fetch('/api/v1/payment/quote', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    });
  } catch (fetchError) {
    if (fetchError?.name === 'AbortError') {
      throw fetchError;
    }
    const error = new Error('Payment could not be prepared. Check your connection and try again.');
    error.apiError = {
      code: 'NETWORK_ERROR',
      message: error.message,
      status: null,
      details: null,
    };
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const error = new Error('Payment could not be prepared. Check your connection and try again.');
    error.apiError = {
      code: 'API_UNREACHABLE',
      message: error.message,
      status: response.status,
      details: null,
    };
    throw error;
  }

  const responseBody = await readJsonResponse(response);

  if (!response.ok) {
    const apiError = normalizeApiError(
      {
        ...(responseBody || {}),
        status: response.status,
      },
      'Unable to create payment quote.'
    );
    const error = new Error(apiError.message);
    error.apiError = apiError;
    throw error;
  }

  if (!responseBody || typeof responseBody !== 'object') {
    throw new Error('Quote API returned an invalid response.');
  }

  return responseBody;
};

const formatQuoteSolAmount = (solAmount) => {
  try {
    return formatSolAmount(solToLamports(solAmount));
  } catch {
    return `${solAmount || '0'} SOL`;
  }
};

const formatQuoteExpiry = (expiresAt, language, t) => (
  formatPanelDateTime(expiresAt, language, t)
);

const safeBuildSolanaExplorerDevnetTxUrl = (signature) => {
  try {
    return signature ? buildSolanaExplorerDevnetTxUrl(signature) : '';
  } catch {
    return '';
  }
};

const noticeStyles = {
  info: 'border-(--kp-border) bg-(--kp-control-bg) text-(--kp-text-muted)',
  success: 'border-brand/25 bg-brand/8 text-(--kp-text)',
  wallet: 'border-purple-400/25 bg-purple-500/10 text-(--kp-text)',
  warning: 'border-amber-400/30 bg-amber-400/10 text-amber-800 dark:text-amber-100',
  danger: 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-100',
};

const noticeTitleStyles = {
  info: 'text-(--kp-text)',
  success: 'text-brand',
  wallet: 'text-purple-700 dark:text-purple-200',
  warning: 'text-amber-700 dark:text-amber-200',
  danger: 'text-red-700 dark:text-red-300',
};

const AppNotice = ({ variant = 'info', title, children, pulse = false }) => (
  <div className={`border p-3 sm:p-4 ${noticeStyles[variant] || noticeStyles.info}`}>
    <div className="flex items-start gap-3">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${variant === 'danger' ? 'bg-red-400' : variant === 'warning' ? 'bg-amber-300' : variant === 'wallet' ? 'bg-purple-400' : 'bg-brand'} ${pulse ? 'animate-pulse' : ''}`}></span>
      <div className="min-w-0">
        {title && (
          <p className={`text-sm  ${noticeTitleStyles[variant] || noticeTitleStyles.info}`}>{title}</p>
        )}
        <div className="mt-1 text-sm leading-6 text-current">{children}</div>
      </div>
    </div>
  </div>
);

const RailButton = ({ as = 'button', variant = 'primary', className = '', children, ...props }) => {
  const ButtonComponent = as;
  const variants = {
    primary: 'bg-brand text-black hover:bg-brand/90 focus-visible:ring-brand',
    wallet: 'kp-button-wallet focus-visible:ring-purple-300',
    secondary: 'kp-button-secondary border focus-visible:ring-zinc-500',
    danger: 'border border-red-500/20 bg-red-500/5 text-red-300 hover:border-red-500/40 hover:bg-red-500/10 focus-visible:ring-red-400',
  };

  return (
    <ButtonComponent
      className={`flex min-h-12 w-full items-center justify-center px-4 py-3 text-center text-sm  transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant] || variants.primary} ${className}`}
      {...props}
    >
      {children}
    </ButtonComponent>
  );
};

const DetailRow = ({ label, value, mono = false, tone = 'default', title, truncateValue = false }) => {
  const toneClass = tone === 'success'
    ? 'text-brand'
    : tone === 'muted'
      ? 'kp-soft'
      : 'kp-text';
  const valueFlowClass = truncateValue
    ? 'truncate'
    : mono
      ? 'break-all'
      : 'wrap-break-word';

  return (
    <div className="grid min-w-0 gap-1.5 border-b border-(--kp-border) px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(6.75rem,0.85fr)_minmax(0,1.15fr)] sm:gap-4 sm:px-4">
      <span className="kp-soft text-xs ">{label}</span>
      <span className={`min-w-0 text-left text-sm  sm:text-right ${mono ? 'font-mono' : ''} ${valueFlowClass} ${toneClass}`} title={title}>
        {value}
      </span>
    </div>
  );
};

const TechnicalDetails = ({ label, children, className = '' }) => (
  <details className={`group border border-(--kp-border) bg-(--kp-control-bg) ${className}`}>
    <summary className="kp-muted flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm  transition-colors hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <span>{label}</span>
      <svg className="h-4 w-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </summary>
    <div className="border-t border-(--kp-border)">
      {children}
    </div>
  </details>
);

const QrisTypeBadge = ({ type, t }) => {
  const isStatic = type === 'static';

  return (
    <span className={`inline-flex shrink-0 items-center border px-2.5 py-1 text-[11px]  uppercase tracking-[0.12em] ${isStatic ? 'border-amber-400/35 bg-amber-400/10 text-amber-700 dark:text-amber-200' : 'border-brand/30 bg-brand/10 text-brand'}`}>
      {isStatic ? t('payment.qrisTypeStatic') : t('payment.qrisTypeDynamic')}
    </span>
  );
};

const SuccessCheckmark = () => (
  <div className="receipt-checkmark grid h-16 w-16 shrink-0 place-items-center rounded-full border border-brand/30 bg-brand/12 text-brand shadow-[0_0_32px_rgba(20,241,149,0.18)]" aria-hidden="true">
    <svg className="h-9 w-9" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="3" opacity="0.22" />
      <path className="receipt-checkmark-path" d="M15 24.5L21.5 31L34 18" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

const InlineActionButton = ({ as = 'button', children, className = '', ...props }) => {
  const ButtonComponent = as;
  const buttonProps = as === 'button' ? { type: 'button' } : {};

  return (
    <ButtonComponent
      className={`shrink-0 border border-brand/25 px-2.5 py-1.5 text-[11px]  uppercase tracking-[0.12em] text-brand transition hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${className}`}
      {...buttonProps}
      {...props}
    >
      {children}
    </ButtonComponent>
  );
};

const ReceiptField = ({
  label,
  value,
  mono = false,
  tone = 'default',
  title,
  action,
}) => {
  const cleanValue = cleanReceiptValue(value);

  if (!cleanValue) {
    return null;
  }

  const toneClass = tone === 'success'
    ? 'text-brand'
    : tone === 'muted'
      ? 'kp-soft'
      : 'kp-text';

  return (
    <div className="grid min-w-0 gap-2 border-b border-(--kp-border) px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(6.75rem,0.78fr)_minmax(0,1.22fr)] sm:gap-4 sm:px-4">
      <span className="kp-soft text-xs ">{label}</span>
      <div className="flex min-w-0 items-start gap-2 sm:justify-end">
        <span className={`min-w-0 text-left text-sm  sm:text-right ${mono ? 'break-all font-mono' : 'wrap-break-word'} ${toneClass}`} title={title || cleanValue}>
          {cleanValue}
        </span>
        {action}
      </div>
    </div>
  );
};

export default function PaymentPage({
  qrisData,
  initialParsedData,
  initialQuote,
  paymentSubmission,
  paymentVerification,
  externalPaymentError,
  mobilePaymentState,
  onParsedData,
  onConfirm,
  onRetryVerification,
  onScanAnother,
  onVerifiedReceipt,
  onCancel,
  rpcEndpoint,
  walletAddress,
  language,
  t,
}) {
  const [parsedPayment] = useState(() => (
    getParsedPayment(qrisData, initialParsedData)
  ));
  const [quote, setQuote] = useState(() => initialQuote || null);
  const [quoteError, setQuoteError] = useState(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteClock, setQuoteClock] = useState(() => new Date());
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [settlementResult, setSettlementResult] = useState(null);
  const [settlementError, setSettlementError] = useState(null);
  const [isSettling, setIsSettling] = useState(false);
  const [manualAmountText, setManualAmountText] = useState('');
  const [manualAmountError, setManualAmountError] = useState('');
  const [manualAmountIdr, setManualAmountIdr] = useState(null);
  const [receiptActionMessage, setReceiptActionMessage] = useState('');
  const savedReceiptHistoryKeyRef = useRef('');
  const quoteAbortRef = useRef(null);

  useEffect(() => {
    if (!quote) {
      return undefined;
    }

    const timer = setInterval(() => {
      setQuoteClock(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, [quote]);

  useEffect(() => {
    if (!receiptActionMessage) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setReceiptActionMessage('');
    }, 2200);

    return () => clearTimeout(timer);
  }, [receiptActionMessage]);

  const qrisIssueType = getQrisIssueType(parsedPayment);
  const qrisType = parsedPayment.qrisType || (parsedPayment.amountText ? 'dynamic' : 'static');
  const isStaticQris = qrisType === 'static' || qrisIssueType === 'missingAmount';
  const isDynamicQris = qrisType === 'dynamic';
  const isStaticPaymentFlow = isStaticQris && (parsedPayment.isValid || qrisIssueType === 'missingAmount');
  const manualAmountValidation = useMemo(() => (
    validateManualIdrAmount(manualAmountText, t)
  ), [manualAmountText, t]);
  const isManualAmountInputValid = Number.isFinite(manualAmountValidation.amount);
  const manualAmountPreview = isManualAmountInputValid
    ? formatIdrAmount(manualAmountValidation.amount)
    : '';
  const visibleManualAmountError = manualAmountText.trim() && manualAmountValidation.error
    ? manualAmountValidation.error
    : manualAmountError;
  const paymentAmount = Number.isFinite(manualAmountIdr)
    ? manualAmountIdr
    : parsedPayment.amount;
  const paymentReviewData = useMemo(() => {
    if (!Number.isFinite(manualAmountIdr)) {
      return {
        ...parsedPayment,
        qrisType,
        amountSource: isDynamicQris ? 'qris' : parsedPayment.amountSource || null,
      };
    }

    return {
      ...parsedPayment,
      isValid: true,
      hasRequiredTags: true,
      qrisType: 'static',
      amountSource: 'manual',
      amount: manualAmountIdr,
      amountText: String(manualAmountIdr),
      formattedAmount: formatIdrAmount(manualAmountIdr),
      errors: [],
    };
  }, [isDynamicQris, manualAmountIdr, parsedPayment, qrisType]);
  const canReviewPayment = (isDynamicQris && parsedPayment.isValid)
    || (isStaticPaymentFlow && Number.isFinite(manualAmountIdr));
  const showManualAmountForm = isStaticPaymentFlow && !Number.isFinite(manualAmountIdr);
  const merchantName = parsedPayment.merchantName || t('payment.lblMissing');
  const merchantCity = parsedPayment.merchantCity || parsedPayment.tags?.['60'] || '';
  const merchantId = parsedPayment.merchantId || parsedPayment.merchantAccountInfo?.merchantId || '';
  const qrisTypeDescription = isStaticQris
    ? t('payment.staticQrisDetectedBody')
    : t('payment.dynamicQrisDetectedBody');
  const amountSourceLabel = isStaticQris
    ? t('payment.amountManualLabel')
    : t('payment.amountLockedLabel');
  const amountLabel = Number.isFinite(paymentAmount)
    ? formatIdrAmount(paymentAmount)
    : t('payment.lblNotProvided');
  const currencyLabel = parsedPayment.currencyCode === '360'
    ? 'IDR'
    : parsedPayment.currencyCode || t('payment.lblNotProvided');

  useEffect(() => {
    onParsedData?.(paymentReviewData);
  }, [onParsedData, paymentReviewData]);

  const quoteReview = useMemo(() => {
    if (!quote) {
      return null;
    }

    return {
      idrAmountLabel: formatIdrAmount(quote.fiatAmount),
      solAmountLabel: formatQuoteSolAmount(quote.solAmount),
      exchangeRateLabel: `${formatIdrAmount(Number(quote.exchangeRate))} / SOL`,
      expiresAtLabel: formatQuoteExpiry(quote.expiresAt, language, t),
      isExpired: isQuoteExpired(quote.expiresAt, quoteClock),
    };
  }, [language, quote, quoteClock, t]);
  const submittedPayment = useMemo(() => (
    paymentSubmission?.signature
      ? {
        ...paymentSubmission,
        explorerUrl: paymentSubmission.explorerUrl
          || buildSolanaExplorerDevnetTxUrl(paymentSubmission.signature),
      }
      : null
  ), [paymentSubmission]);
  const verificationStatus = paymentVerification?.status || 'idle';
  const verifiedPayment = verificationStatus === 'paid_verified'
    ? paymentVerification?.result
    : null;
  const verificationError = verificationStatus === 'failed'
    ? paymentVerification?.error
    : null;
  const visiblePaymentError = formatPaymentErrorForDisplay(
    verificationError || externalPaymentError || paymentError,
    t
  );
  const mobileStatus = mobilePaymentState?.status || null;
  const qrisReadNotice = {
    title: t('payment.errParser'),
    body: t('payment.qrisReadErrorBody'),
  };
  const flowState = useMemo(() => {
    if (settlementResult) return 'settled';
    if (verificationStatus === 'paid_verified') return 'paid_verified';
    if (verificationStatus === 'verifying') return 'verifying';
    if (mobileStatus === 'returned') return 'mobile_returned';
    if (mobileStatus === 'submitting_signed_transaction') return 'mobile_submitting';
    if (mobileStatus === 'expired') return 'mobile_expired';
    if (verificationStatus === 'failed' || quoteError || visiblePaymentError) return 'failed';
    if (submittedPayment) return 'tx_submitted';
    if (mobileStatus === 'restored') return 'mobile_restored';
    if (isPaymentSubmitting) return 'awaiting_signature';
    if (isQuoteLoading) return 'quoting';
    if (quoteReview) return 'quote_ready';
    if (showManualAmountForm) return 'amount_required';
    if (!canReviewPayment) return 'unsupported';
    if (parsedPayment) return 'parsed';
    return 'idle';
  }, [
    canReviewPayment,
    isPaymentSubmitting,
    isQuoteLoading,
    mobileStatus,
    parsedPayment,
    quoteError,
    quoteReview,
    settlementResult,
    showManualAmountForm,
    submittedPayment,
    verificationStatus,
    visiblePaymentError,
  ]);
  const headerTitle = {
    idle: t('payment.headerIdle'),
    amount_required: t('payment.staticQrisDetectedTitle'),
    unsupported: t('payment.headerFailed'),
    parsed: t('payment.headerIdle'),
    quoting: t('payment.headerQuoting'),
    quote_ready: t('payment.headerQuoteReady'),
    awaiting_signature: t('payment.headerAwaiting'),
    mobile_returned: t('payment.headerAwaiting'),
    mobile_submitting: t('payment.headerSubmitted'),
    mobile_restored: t('payment.mobileSessionRestored'),
    mobile_expired: t('payment.headerFailed'),
    tx_submitted: t('payment.headerSubmitted'),
    verifying: t('payment.headerVerifying'),
    paid_verified: t('payment.headerPaid'),
    settled: t('payment.headerSettled'),
    failed: t('payment.headerFailed'),
  }[flowState];

  const showTryAgain = flowState === 'failed' && canReviewPayment;
  const showScanAnother = !canReviewPayment
    || isStaticPaymentFlow
    || flowState === 'failed'
    || flowState === 'paid_verified'
    || flowState === 'settled'
    || flowState === 'mobile_restored'
    || flowState === 'mobile_expired';
  const fullPaymentSignature = verifiedPayment?.signature || submittedPayment?.signature || '';
  const primaryExplorerUrl = verifiedPayment?.explorerUrl
    || submittedPayment?.explorerUrl
    || safeBuildSolanaExplorerDevnetTxUrl(fullPaymentSignature);
  const isBusy = isQuoteLoading
    || isPaymentSubmitting
    || flowState === 'verifying'
    || flowState === 'mobile_returned'
    || flowState === 'mobile_submitting'
    || isSettling;

  const handleManualAmountContinue = () => {
    const result = manualAmountValidation;

    if (result.error) {
      setManualAmountError(result.error);
      return;
    }

    setManualAmountError('');
    setManualAmountIdr(result.amount);
    setQuoteError(null);
    setPaymentError(null);
  };

  const handleConfirm = useCallback(async () => {
    if (!canReviewPayment || isQuoteLoading) {
      return;
    }

    // Abort any previous in-flight quote request
    if (quoteAbortRef.current) {
      quoteAbortRef.current.abort();
    }
    const abortController = new AbortController();
    quoteAbortRef.current = abortController;

    setIsQuoteLoading(true);
    setQuoteError(null);
    setQuote(null);
    setPaymentError(null);

    try {
      const nextQuote = await fetchPaymentQuote({
        qrisPayload: parsedPayment.rawData,
        idrAmount: Number.isFinite(manualAmountIdr) ? manualAmountIdr : null,
        walletAddress,
        signal: abortController.signal,
      });

      // Only update state if this request wasn't superseded
      if (!abortController.signal.aborted) {
        setQuote(nextQuote);
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
      const apiError = error.apiError || normalizeApiError(null, error.message);
      setQuoteError(apiError);
    } finally {
      if (!abortController.signal.aborted) {
        setIsQuoteLoading(false);
      }
      if (quoteAbortRef.current === abortController) {
        quoteAbortRef.current = null;
      }
    }
  }, [canReviewPayment, isQuoteLoading, manualAmountIdr, parsedPayment.rawData, walletAddress]);

  // Abort in-flight quote request when modal closes
  useEffect(() => () => {
    if (quoteAbortRef.current) {
      quoteAbortRef.current.abort();
      quoteAbortRef.current = null;
    }
  }, []);

  const handleContinueToPhantom = async () => {
    if (!quote || quoteReview?.isExpired || isPaymentSubmitting || submittedPayment || verificationStatus === 'verifying') {
      return;
    }

    setIsPaymentSubmitting(true);
    setPaymentError(null);

    try {
      const result = await onConfirm?.({
        parsedPayment: {
          rawData: paymentReviewData.rawData,
          rawPayload: paymentReviewData.rawPayload || paymentReviewData.rawData,
          qrisType: paymentReviewData.qrisType,
          amountSource: paymentReviewData.amountSource,
          merchantName: paymentReviewData.merchantName,
          merchantCity: paymentReviewData.merchantCity,
          merchantId: paymentReviewData.merchantId,
          amount: paymentReviewData.amount,
          amountText: paymentReviewData.amountText,
          formattedAmount: paymentReviewData.formattedAmount,
          currencyCode: paymentReviewData.currencyCode,
          tags: paymentReviewData.tags,
          isValid: paymentReviewData.isValid,
          errors: paymentReviewData.errors,
        },
        quote,
      });

      if (result?.status !== 'redirecting') {
        setIsPaymentSubmitting(false);
      }
    } catch (error) {
      const apiError = error.apiError || {
        code: error.code || 'PAYMENT_FAILED',
        message: error.message || 'Unable to submit payment with Phantom.',
        status: null,
        details: null,
      };

      setPaymentError({
        ...apiError,
        code: apiError.code || 'PAYMENT_FAILED',
      });
      setIsPaymentSubmitting(false);
    }
  };

  const handleTryAgain = async () => {
    setPaymentError(null);

    if (verificationStatus === 'failed' && submittedPayment) {
      await onRetryVerification?.();
      return;
    }

    if (quoteReview) {
      await handleContinueToPhantom();
      return;
    }

    await handleConfirm();
  };

  const handleSettleDemo = async () => {
    if (isSettling || settlementResult) return;

    const sig = verifiedPayment?.signature || submittedPayment?.signature;
    const qId = quote?.quoteId;

    if (!sig || !qId) return;

    setIsSettling(true);
    setSettlementError(null);

    try {
      const result = await fetchSettleDemo({ quoteId: qId, signature: sig });
      setSettlementResult(result);
    } catch (error) {
      setSettlementError(error.apiError || { code: 'SETTLEMENT_FAILED', message: error.message });
    } finally {
      setIsSettling(false);
    }
  };

  const shortSignature = (sig) => {
    if (!sig || sig.length < 16) return sig || '';
    return `${sig.slice(0, 8)}...${sig.slice(-8)}`;
  };
  const demoReference = settlementResult?.settlementReference
    || `DEMO-PAYOUT-${(verifiedPayment?.signature || submittedPayment?.signature || '').slice(-8).toUpperCase()}`;
  const linkedSolanaTx = shortSignature(verifiedPayment?.signature);
  const merchantRecordCreatedAt = settlementResult
    ? formatPanelDateTime(settlementResult.settledAt, language, t)
    : formatPanelDateTime(submittedPayment?.submittedAt || quote?.createdAt, language, t);
  const payoutStatusLabel = t('payment.payoutStatusSimulated');
  const receiptQrisTypeLabel = isStaticQris ? t('payment.qrisTypeStatic') : t('payment.qrisTypeDynamic');
  const receiptIdrAmountLabel = quoteReview?.idrAmountLabel
    || (Number.isFinite(paymentAmount) ? formatIdrAmount(paymentAmount) : '');
  const receiptSolAmountLabel = quoteReview?.solAmountLabel
    || (quote?.solAmount ? formatQuoteSolAmount(quote.solAmount) : '');
  const receiptStatusLabel = t('payment.receiptStatusPaidVerified') || verifiedPayment?.status || t('payment.statusPaid');
  const receiptWalletAddress = submittedPayment?.walletAddress || verifiedPayment?.walletAddress || '';
  const receiptQuoteId = quote?.quoteId || submittedPayment?.quote?.quoteId || verifiedPayment?.quoteId || '';
  const receiptTimestamp = formatPanelDateTime(
    verifiedPayment?.verifiedAt || submittedPayment?.submittedAt || quote?.createdAt,
    language,
    t
  );
  const receiptSummary = useMemo(() => buildReceiptSummary({
    title: t('payment.receiptSummaryTitle'),
    fields: [
      { label: t('payment.lblStore'), value: merchantName },
      { label: t('payment.lblCity'), value: merchantCity },
      { label: t('payment.lblQrisType'), value: receiptQrisTypeLabel },
      { label: t('payment.lblIdrAmount'), value: receiptIdrAmountLabel },
      { label: t('payment.lblSolPaid'), value: receiptSolAmountLabel },
      { label: t('payment.lblStatus'), value: receiptStatusLabel },
      { label: t('payment.lblWallet'), value: receiptWalletAddress },
      { label: t('payment.lblSignature'), value: fullPaymentSignature },
      { label: t('payment.lblExplorerLink'), value: primaryExplorerUrl },
      { label: t('payment.receiptTimestamp'), value: receiptTimestamp },
      { label: t('payment.lblQuoteId'), value: receiptQuoteId },
      { label: t('payment.lblNetwork'), value: t('payment.receiptNetwork') },
    ],
    disclaimer: `${t('payment.receiptVerifiedBody')} ${t('payment.receiptSettlementDemoNote')}`,
  }), [
    fullPaymentSignature,
    merchantCity,
    merchantName,
    primaryExplorerUrl,
    receiptIdrAmountLabel,
    receiptQrisTypeLabel,
    receiptQuoteId,
    receiptSolAmountLabel,
    receiptStatusLabel,
    receiptTimestamp,
    receiptWalletAddress,
    t,
  ]);
  const verifiedReceiptHistoryRecord = useMemo(() => {
    if (!verifiedPayment) {
      return null;
    }

    return {
      id: fullPaymentSignature || receiptQuoteId,
      source: 'local_demo',
      merchantName,
      merchantCity,
      qrisType: isStaticQris ? 'static' : 'dynamic',
      idrAmount: Number.isFinite(Number(quote?.fiatAmount))
        ? Number(quote.fiatAmount)
        : Number.isFinite(paymentAmount)
          ? paymentAmount
          : null,
      idrAmountLabel: receiptIdrAmountLabel,
      solAmount: quote?.solAmount || '',
      solAmountLabel: receiptSolAmountLabel,
      status: 'paid_verified',
      statusLabel: receiptStatusLabel,
      walletAddress: receiptWalletAddress,
      signature: fullPaymentSignature,
      explorerUrl: primaryExplorerUrl,
      timestamp: verifiedPayment?.verifiedAt || submittedPayment?.submittedAt || quote?.createdAt || new Date().toISOString(),
      quoteId: receiptQuoteId,
      network: 'devnet',
      networkLabel: t('payment.receiptNetwork'),
      settlementDisclaimer: t('payment.receiptSettlementDemoNote'),
    };
  }, [
    fullPaymentSignature,
    isStaticQris,
    merchantCity,
    merchantName,
    paymentAmount,
    primaryExplorerUrl,
    quote,
    receiptIdrAmountLabel,
    receiptQuoteId,
    receiptSolAmountLabel,
    receiptStatusLabel,
    receiptWalletAddress,
    submittedPayment,
    t,
    verifiedPayment,
  ]);

  useEffect(() => {
    if (!verifiedReceiptHistoryRecord || !onVerifiedReceipt) {
      return;
    }

    const historyKey = `${verifiedReceiptHistoryRecord.walletAddress}:${verifiedReceiptHistoryRecord.signature || verifiedReceiptHistoryRecord.quoteId}`;
    if (!verifiedReceiptHistoryRecord.walletAddress || savedReceiptHistoryKeyRef.current === historyKey) {
      return;
    }

    savedReceiptHistoryKeyRef.current = historyKey;
    onVerifiedReceipt(verifiedReceiptHistoryRecord);
  }, [onVerifiedReceipt, verifiedReceiptHistoryRecord]);
  const canUseWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const receiptShareButtonLabel = canUseWebShare ? t('payment.btnShareReceipt') : t('payment.btnCopyReceipt');

  const handleCopyReceiptValue = async (value, successMessage) => {
    const didCopy = await copyTextToClipboard(value);
    setReceiptActionMessage(didCopy ? successMessage : t('payment.copyUnavailable'));
  };

  const handleShareReceipt = async () => {
    if (canUseWebShare) {
      try {
        await navigator.share({
          title: t('payment.receiptSummaryTitle'),
          text: receiptSummary,
          url: primaryExplorerUrl || undefined,
        });
        setReceiptActionMessage(t('payment.receiptShared'));
        return;
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }
      }
    }

    await handleCopyReceiptValue(receiptSummary, t('payment.receiptCopied'));
  };

  const handleDownloadReceipt = () => {
    const didDownload = downloadTextFile({
      fileName: createReceiptFileName(fullPaymentSignature),
      text: receiptSummary,
    });

    setReceiptActionMessage(
      didDownload ? t('payment.receiptDownloaded') : t('payment.receiptDownloadFailed')
    );
  };

  return (
    <Fragment>
      <div className="fixed inset-0 z-110 overflow-hidden bg-black/85 p-0 backdrop-blur-lg transition-all animate-fade-in sm:p-4">
        <div
          className="kp-panel mx-auto flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden border-0 border-brand/20 transition-colors duration-500 sm:my-5 sm:h-auto sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-190 sm:border"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-panel-title"
        >
          <div className="kp-panel-soft flex shrink-0 items-start justify-between gap-4 border-b px-4 py-4 sm:p-5">
            <div className="min-w-0">
              <div className="mb-2 text-xs  text-brand">{t('payment.qrisParsed')}</div>
              <h3 id="payment-panel-title" className="kp-text text-xl  transition-colors sm:text-2xl">
                {headerTitle}
              </h3>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="kp-control grid h-11 w-11 shrink-0 place-items-center border transition-colors hover:border-red-500/30 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label={t('payment.closeLabel')}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
          <div className="rail-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:p-5">
            {!canReviewPayment && !showManualAmountForm && (
              <AppNotice variant="warning" title={qrisReadNotice.title}>
                <p>{qrisReadNotice.body}</p>
              </AppNotice>
            )}

            {quoteError && (
              <AppNotice variant="danger" title={t('payment.errorTitle')}>
                <p>{t('payment.errorBody')}</p>
                {canReviewPayment && (
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={isQuoteLoading}
                    className="mt-3 inline-flex text-sm  text-brand hover:underline disabled:opacity-50"
                  >
                    {isQuoteLoading ? t('payment.btnLoading') : t('payment.btnTryAgain')}
                  </button>
                )}
              </AppNotice>
            )}

            {visiblePaymentError && (
              <AppNotice variant="danger" title={t('payment.errorTitle')}>
                <p>{t('payment.errorBody')}</p>
                {primaryExplorerUrl && (
                  <a
                    href={primaryExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex text-sm  text-brand hover:underline"
                  >
                    {t('payment.btnViewExplorer')}
                  </a>
                )}
              </AppNotice>
            )}

            {isQuoteLoading && (
              <AppNotice variant="success" title={t('payment.statusLoading')} pulse>
                <p>{t('payment.statusFetching')}</p>
              </AppNotice>
            )}

            {isPaymentSubmitting && (
              <AppNotice variant="wallet" title={t('payment.mobileWaiting')} pulse>
                <p>{t('payment.statusApprove')}</p>
              </AppNotice>
            )}

            {flowState === 'mobile_restored' && (
              <AppNotice variant="warning" title={t('payment.mobileSessionRestored')}>
                <p>{t('payment.mobileInterrupted')}</p>
              </AppNotice>
            )}

            {flowState === 'mobile_expired' && (
              <AppNotice variant="danger" title={t('payment.headerFailed')}>
                <p>{t('payment.mobileQuoteExpired')}</p>
              </AppNotice>
            )}

            {(flowState === 'mobile_returned' || flowState === 'mobile_submitting') && (
              <AppNotice
                variant="wallet"
                title={flowState === 'mobile_submitting' ? t('payment.mobileSubmitting') : t('payment.mobileReturned')}
                pulse
              >
                <p>{flowState === 'mobile_submitting' ? t('payment.mobileSubmittingDesc') : t('payment.mobileReturnedDesc')}</p>
              </AppNotice>
            )}

            {flowState === 'tx_submitted' && submittedPayment && (
              <AppNotice variant="success" title={t('payment.statusTxSub')}>
                <p>{t('payment.statusTxSubDesc')}</p>
                <TechnicalDetails label={t('payment.detailsTitle')} className="mt-4">
                  <DetailRow label={t('payment.lblSignature')} value={submittedPayment.signature} mono title={submittedPayment.signature} />
                </TechnicalDetails>
              </AppNotice>
            )}

            {flowState === 'verifying' && submittedPayment && (
              <AppNotice variant="success" title={t('payment.statusVerifying')} pulse>
                <p>{t('payment.statusChecking')}</p>
              </AppNotice>
            )}

            {(flowState === 'paid_verified' || flowState === 'settled') && verifiedPayment && (
              <section className="flex w-full flex-col gap-5">

                <div className="flex flex-col overflow-hidden border border-brand/25 bg-(--kp-control-bg)">
                  <div className="border-b border-brand/20 bg-brand/8 p-4 sm:p-5">
                    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <SuccessCheckmark />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs  uppercase tracking-wider text-brand">{t('payment.receiptEyebrow')}</p>
                            <span className="inline-flex border border-brand/30 bg-brand/10 px-2 py-1 text-[11px]  uppercase tracking-[0.12em] text-brand">
                              {t('payment.receiptDevnetBadge')}
                            </span>
                          </div>
                          <h4 className="kp-text mt-2 text-2xl ">{t('payment.receiptTitle')}</h4>
                          <p className="kp-muted mt-2 text-sm leading-6">{t('payment.receiptVerifiedBody')}</p>
                        </div>
                      </div>
                      <div className="min-w-0 border border-brand/20 bg-brand/10 px-3 py-2 text-left sm:text-right">
                        <p className="kp-soft text-[11px]  uppercase tracking-[0.12em]">{t('payment.lblStatus')}</p>
                        <p className="mt-1 wrap-break-word font-mono text-sm  text-brand">{receiptStatusLabel}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-0">
                    <ReceiptField label={t('payment.lblStore')} value={merchantName} title={merchantName} />
                    <ReceiptField label={t('payment.lblCity')} value={merchantCity} />
                    <ReceiptField label={t('payment.lblQrisType')} value={receiptQrisTypeLabel} />
                    <ReceiptField label={t('payment.lblIdrAmount')} value={receiptIdrAmountLabel} />
                    <ReceiptField label={t('payment.lblSolPaid')} value={receiptSolAmountLabel} tone="success" />
                    <ReceiptField label={t('payment.lblWallet')} value={truncateMiddle(receiptWalletAddress)} mono title={receiptWalletAddress} action={receiptWalletAddress ? (
                      <InlineActionButton onClick={() => handleCopyReceiptValue(receiptWalletAddress, t('payment.walletCopied'))} aria-label={t('payment.btnCopyWallet')}>
                        {t('payment.btnCopy')}
                      </InlineActionButton>
                    ) : null} />
                    <ReceiptField label={t('payment.lblSignature')} value={truncateMiddle(fullPaymentSignature, 10, 10)} mono title={fullPaymentSignature} action={fullPaymentSignature ? (
                      <InlineActionButton onClick={() => handleCopyReceiptValue(fullPaymentSignature, t('payment.signatureCopied'))} aria-label={t('payment.btnCopySignature')}>
                        {t('payment.btnCopy')}
                      </InlineActionButton>
                    ) : null} />
                    <ReceiptField label={t('payment.lblExplorerLink')} value={primaryExplorerUrl ? t('payment.receiptExplorerValue') : ''} title={primaryExplorerUrl} action={primaryExplorerUrl ? (
                      <InlineActionButton as="a" href={primaryExplorerUrl} target="_blank" rel="noreferrer" aria-label={t('payment.btnViewExplorer')}>
                        {t('payment.btnViewExplorer')}
                      </InlineActionButton>
                    ) : null} />
                    <ReceiptField label={t('payment.receiptTimestamp')} value={receiptTimestamp} />
                    <ReceiptField label={t('payment.lblQuoteId')} value={truncateMiddle(receiptQuoteId, 12, 10)} mono title={receiptQuoteId} action={receiptQuoteId ? (
                      <InlineActionButton onClick={() => handleCopyReceiptValue(receiptQuoteId, t('payment.referenceCopied'))} aria-label={t('payment.btnCopyReference')}>
                        {t('payment.btnCopy')}
                      </InlineActionButton>
                    ) : null} />
                    <ReceiptField label={t('payment.lblNetwork')} value={t('payment.receiptNetwork')} tone="success" />
                  </div>

                  <div className="border-t border-brand/20 bg-brand/5 p-4 sm:p-5">
                    <p className="text-sm  text-amber-700 dark:text-amber-300">
                      {t('payment.receiptSettlementDemoNote')}
                    </p>

                    {receiptActionMessage && (
                      <p className="mt-3 text-sm  text-brand" role="status">
                        {receiptActionMessage}
                      </p>
                    )}

                    <div className="mt-4 grid gap-3">
                      {primaryExplorerUrl && (
                        <RailButton as="a" href={primaryExplorerUrl} target="_blank" rel="noreferrer">
                          {t('payment.btnViewExplorer')}
                        </RailButton>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <RailButton onClick={() => handleCopyReceiptValue(fullPaymentSignature, t('payment.signatureCopied'))} disabled={!fullPaymentSignature} variant="secondary">
                          {t('payment.btnCopySignature')}
                        </RailButton>
                        <RailButton onClick={handleShareReceipt} variant="secondary">
                          {receiptShareButtonLabel}
                        </RailButton>
                        <RailButton onClick={handleDownloadReceipt} variant="secondary">
                          {t('payment.btnDownloadReceipt')}
                        </RailButton>
                        <RailButton onClick={showScanAnother ? onScanAnother : onCancel} disabled={isBusy && !showScanAnother} variant="secondary">
                          {showScanAnother ? t('payment.btnScanAnother') : t('payment.btnCancel')}
                        </RailButton>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Collapsed Demo Merchant Record */}
                <details className="group border border-(--kp-border) bg-(--kp-control-bg)">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-3 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:px-4">
                    <div className="min-w-0">
                      <p className="text-sm  kp-muted">{t('payment.merchantDemoTitle')}</p>
                      <p className="kp-soft mt-1 text-xs leading-5">{t('payment.merchantDemoSummary')}</p>
                    </div>
                    <svg className="h-4 w-4 shrink-0 kp-soft transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>

                  <div className="border-t border-(--kp-border)">
                    <div className="border-b border-(--kp-border) bg-amber-500/6 px-3 py-3 sm:px-4">
                      <p className="text-sm  text-amber-700 dark:text-amber-300">{t('payment.merchantDemoExpandedTitle')}</p>
                      <p className="kp-muted mt-1 text-xs leading-5">{t('payment.merchantDemoExpandedBody')}</p>
                    </div>

                    {settlementError && (
                      <div className="p-3">
                        <AppNotice variant="danger" title={t('payment.errorTitle')}>
                          <p>{t('payment.errorBody')}</p>
                        </AppNotice>
                      </div>
                    )}

                    {isSettling && (
                      <div className="flex items-center gap-3 border-b border-(--kp-border) px-3 py-3">
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500"></span>
                        <span className="text-sm  text-amber-700 dark:text-amber-400">{t('payment.btnSettling')}</span>
                      </div>
                    )}

                    <DetailRow label={t('payment.lblStore')} value={merchantName} title={merchantName} />
                    <DetailRow label={t('payment.lblTotalPay')} value={quoteReview?.idrAmountLabel || amountLabel} />
                    <DetailRow
                      label={t('payment.lblPayoutStatus')}
                      value={payoutStatusLabel}
                      tone="success"
                    />
                    <DetailRow
                      label={t('payment.lblDemoRef')}
                      value={demoReference}
                      mono
                      truncateValue
                    />
                    <DetailRow
                      label={t('payment.lblLinkedSolanaTx')}
                      value={linkedSolanaTx}
                      mono
                      title={verifiedPayment.signature}
                      truncateValue
                    />
                    <DetailRow
                      label={t('payment.lblCreatedAt')}
                      value={merchantRecordCreatedAt}
                    />

                    <div className="border-t border-(--kp-border) px-3 py-3 sm:px-4">
                      <p className="text-xs font-medium leading-5 text-amber-700 dark:text-amber-400/80">
                        {t('payment.payoutDemoNote')}
                      </p>

                      {!settlementResult && !isSettling && (
                        <RailButton onClick={handleSettleDemo} variant="secondary" className="mt-3 w-full border-amber-500/30 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300">
                          {t('payment.btnCreatePayoutRecord')}
                        </RailButton>
                      )}
                    </div>
                  </div>
                </details>
              </section>
            )}

            {!(flowState === 'paid_verified' || flowState === 'settled') && showManualAmountForm && (
              <section className="-mx-3 space-y-5 border-y border-brand/20 bg-brand/6 p-3 sm:mx-0 sm:border sm:p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="kp-text text-xl ">{t('payment.staticQrisDetectedTitle')}</h4>
                    <QrisTypeBadge type="static" t={t} />
                  </div>
                  <p className="kp-muted mt-2 text-sm leading-6">{t('payment.staticQrisDetectedBody')}</p>
                </div>

                <div className="border-y border-(--kp-border) bg-(--kp-control-bg) p-3 sm:border sm:p-4">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="kp-soft text-xs ">{t('payment.manualAmountStoreHelper')}</p>
                      <p className="kp-text mt-1 wrap-break-word text-base ">{merchantName}</p>
                      {merchantCity && (
                        <p className="kp-muted mt-1 text-xs ">{merchantCity}</p>
                      )}
                    </div>
                    {merchantId && (
                      <div className="min-w-0 text-left sm:text-right">
                        <p className="kp-soft text-xs ">{t('payment.lblMerchantId')}</p>
                        <p className="kp-muted mt-1 break-all text-xs ">{merchantId}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="manual-idr-amount" className="kp-text mb-2 block text-sm ">
                    {t('scanner.paymentAmount')}
                  </label>
                  <input
                    id="manual-idr-amount"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={manualAmountText}
                    onChange={(event) => {
                      setManualAmountText(event.target.value);
                      if (manualAmountError) {
                        setManualAmountError('');
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleManualAmountContinue();
                      }
                    }}
                    placeholder={t('scanner.paymentAmountPlaceholder')}
                    aria-invalid={visibleManualAmountError ? 'true' : 'false'}
                    aria-describedby="manual-idr-amount-helper"
                    className="kp-input min-h-12 w-full border px-4 py-3 text-base  outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/15"
                  />
                  <div id="manual-idr-amount-helper" className="mt-2 min-h-5 text-xs ">
                    {visibleManualAmountError ? (
                      <p className="text-red-700 dark:text-red-300">{visibleManualAmountError}</p>
                    ) : manualAmountPreview ? (
                      <p className="text-brand">{manualAmountPreview}</p>
                    ) : (
                      <p className="kp-soft">{t('payment.manualAmountHelper')}</p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {!(flowState === 'paid_verified' || flowState === 'settled') && !showManualAmountForm && canReviewPayment && (
              <div className="space-y-4">
                <div className="border-y border-(--kp-border) bg-(--kp-control-bg) p-3 transition-colors sm:border sm:p-4">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="kp-soft text-xs ">{t('payment.lblMerchant')}</p>
                      <p className="kp-text mt-1 wrap-break-word text-lg ">{merchantName}</p>
                      {merchantCity && (
                        <p className="kp-muted mt-1 text-xs ">{merchantCity}</p>
                      )}
                    </div>
                    <QrisTypeBadge type={isStaticQris ? 'static' : 'dynamic'} t={t} />
                  </div>
                  <p className="kp-muted mt-3 text-sm leading-6">{qrisTypeDescription}</p>
                  {merchantId && (
                    <p className="kp-soft mt-2 break-all text-xs ">
                      {t('payment.lblMerchantId')}: {merchantId}
                    </p>
                  )}
                </div>

                {!quoteReview && (
                  <div className="border-y border-(--kp-border) bg-(--kp-control-bg) p-3 transition-colors sm:border sm:p-4">
                    <div className="flex h-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <span className="kp-text text-sm  transition-colors">{amountSourceLabel}</span>
                      <div className="min-w-0 text-left sm:text-right">
                        <div className="wrap-break-word text-2xl  text-brand sm:text-3xl">{amountLabel}</div>
                        <div className="mt-1 text-xs  text-zinc-500">{currencyLabel}</div>
                      </div>
                    </div>
                  </div>
                )}

                {quoteReview && (
                  <>  
                    {quoteReview.isExpired && (
                      <AppNotice variant="warning" title={t('payment.quoteExpiredTitle')}>
                        <p>{t('payment.quoteExpiredBody')}</p>
                      </AppNotice>
                    )}
                    <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                      <div className={`border p-3 transition-colors sm:p-4 ${quoteReview.isExpired ? 'border-(--kp-border) bg-(--kp-control-bg) opacity-60' : 'border-brand/25 bg-brand/8'}`}>
                        <div className="kp-muted mb-2 text-sm ">{t('payment.lblBackendQuote')}</div>
                        <div className={`wrap-break-word text-3xl  leading-none sm:text-4xl ${quoteReview.isExpired ? 'text-zinc-500' : 'text-brand'}`}>{quoteReview.solAmountLabel.replace(' SOL', '')}</div>
                        <div className="mt-2 text-xs  text-zinc-500">SOL</div>
                      </div>

                      <div className="kp-surface overflow-hidden border">
                        <DetailRow label={t('payment.lblIdrAmount')} value={quoteReview.idrAmountLabel} />
                        <DetailRow label={t('payment.lblRate')} value={quoteReview.exchangeRateLabel} />
                        <DetailRow label={t('payment.lblExpires')} value={quoteReview.expiresAtLabel} tone={quoteReview.isExpired ? 'muted' : 'default'} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {!(flowState === 'paid_verified' || flowState === 'settled') && (
            <div className="shrink-0 border-t border-(--kp-border) p-3 sm:p-5">
              {quoteReview && !submittedPayment && flowState !== 'unsupported' && (
                <DevnetSafetyNotice
                  t={t}
                  rpcEndpoint={rpcEndpoint}
                  className="mb-3"
                />
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <RailButton
                  onClick={showScanAnother ? onScanAnother : onCancel}
                  disabled={isBusy && !showScanAnother}
                  variant="secondary"
                >
                  {showScanAnother ? t('payment.btnScanAnother') : t('payment.btnCancel')}
                </RailButton>
                
                {flowState === 'mobile_expired' || flowState === 'unsupported' ? null : flowState === 'amount_required' ? (
                  <RailButton
                    onClick={handleManualAmountContinue}
                    disabled={isBusy || !isManualAmountInputValid}
                  >
                    {t('scanner.continue')}
                  </RailButton>
                ) : flowState === 'mobile_restored' ? (
                  <RailButton
                    onClick={handleContinueToPhantom}
                    disabled={quoteReview?.isExpired || isPaymentSubmitting}
                    variant="wallet"
                  >
                    {t('payment.btnResumePayment')}
                  </RailButton>
                ) : showTryAgain ? (
                  <RailButton
                    onClick={handleTryAgain}
                    disabled={isBusy}
                  >
                    {t('payment.btnTryAgain')}
                  </RailButton>
                ) : submittedPayment && primaryExplorerUrl ? (
                  <RailButton
                    as="a"
                    href={primaryExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('payment.btnViewExplorer')}
                  </RailButton>
                ) : quoteReview ? (
                  quoteReview.isExpired ? (
                    <RailButton
                      onClick={handleConfirm}
                      disabled={isQuoteLoading}
                    >
                      {isQuoteLoading ? t('payment.btnLoading') : t('payment.btnTryAgain')}
                    </RailButton>
                  ) : (
                    <RailButton
                      onClick={handleContinueToPhantom}
                      disabled={isPaymentSubmitting}
                      variant="wallet"
                    >
                      {isPaymentSubmitting ? t('payment.btnOpeningPhantom') : t('payment.btnPayPhantom')}
                    </RailButton>
                  )
                ) : (
                  <RailButton
                    onClick={handleConfirm}
                    disabled={!canReviewPayment || isQuoteLoading}
                  >
                    {isQuoteLoading ? t('payment.btnLoading') : t('payment.btnConfirm')}
                  </RailButton>
                )}
              </div>
            </div>
          )}


          
        </div>
      </div>
    </Fragment>
  );
}
