import { Fragment, useEffect, useMemo, useState } from 'react';
import { parseEmvcoQris } from './utils/parseEmvcoQris';
import {
  buildSolanaExplorerDevnetTxUrl,
  formatIdrAmount,
  formatSolAmount,
  isQuoteExpired,
  normalizeApiError,
  solToLamports,
} from './utils/payment';

const quoteExpiryFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

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

const formatSettledAt = (iso) => {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const fetchPaymentQuote = async ({ qrisPayload, idrAmount }) => {
  const requestBody = { qrisPayload };

  if (idrAmount !== null && idrAmount !== undefined) {
    requestBody.idrAmount = String(idrAmount);
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
    });
  } catch {
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

const formatQuoteExpiry = (expiresAt) => {
  const expiresAtDate = new Date(expiresAt);

  if (!Number.isFinite(expiresAtDate.getTime())) {
    return 'Invalid expiry';
  }

  return quoteExpiryFormatter.format(expiresAtDate);
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
          <p className={`text-sm font-semibold ${noticeTitleStyles[variant] || noticeTitleStyles.info}`}>{title}</p>
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
      className={`flex min-h-12 w-full items-center justify-center px-4 py-3 text-center text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant] || variants.primary} ${className}`}
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
      : 'break-words';

  return (
    <div className="grid gap-1.5 border-b border-(--kp-border) px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(6.75rem,0.85fr)_minmax(0,1.15fr)] sm:gap-4 sm:px-4">
      <span className="kp-soft text-xs font-semibold">{label}</span>
      <span className={`min-w-0 text-left text-sm font-semibold sm:text-right ${mono ? 'font-mono' : ''} ${valueFlowClass} ${toneClass}`} title={title}>
        {value}
      </span>
    </div>
  );
};

const TechnicalDetails = ({ label, children, className = '' }) => (
  <details className={`group border border-(--kp-border) bg-(--kp-control-bg) ${className}`}>
    <summary className="kp-muted flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold transition-colors hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
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
  onCancel,
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

  useEffect(() => {
    if (!quote) {
      return undefined;
    }

    const timer = setInterval(() => {
      setQuoteClock(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, [quote]);

  const qrisIssueType = getQrisIssueType(parsedPayment);
  const isMissingAmountFlow = qrisIssueType === 'missingAmount';
  const manualAmountPreview = useMemo(() => {
    const result = validateManualIdrAmount(manualAmountText, t);
    return result.amount ? formatIdrAmount(result.amount) : '';
  }, [manualAmountText, t]);
  const paymentAmount = Number.isFinite(manualAmountIdr)
    ? manualAmountIdr
    : parsedPayment.amount;
  const paymentReviewData = useMemo(() => {
    if (!Number.isFinite(manualAmountIdr)) {
      return parsedPayment;
    }

    return {
      ...parsedPayment,
      isValid: true,
      hasRequiredTags: true,
      amount: manualAmountIdr,
      amountText: String(manualAmountIdr),
      formattedAmount: manualAmountIdr.toLocaleString('id-ID'),
      tags: {
        ...parsedPayment.tags,
        54: String(manualAmountIdr),
      },
      errors: [],
    };
  }, [manualAmountIdr, parsedPayment]);
  const canReviewPayment = parsedPayment.isValid || (isMissingAmountFlow && Number.isFinite(manualAmountIdr));
  const showManualAmountForm = isMissingAmountFlow && !Number.isFinite(manualAmountIdr);
  const merchantName = parsedPayment.merchantName || t('payment.lblMissing');
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
      expiresAtLabel: formatQuoteExpiry(quote.expiresAt),
      isExpired: isQuoteExpired(quote.expiresAt, quoteClock),
    };
  }, [quote, quoteClock]);
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
    amount_required: t('payment.manualAmountTitle'),
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
    || isMissingAmountFlow
    || flowState === 'failed'
    || flowState === 'paid_verified'
    || flowState === 'settled'
    || flowState === 'mobile_restored'
    || flowState === 'mobile_expired';
  const primaryExplorerUrl = verifiedPayment?.explorerUrl || submittedPayment?.explorerUrl || '';
  const isBusy = isQuoteLoading
    || isPaymentSubmitting
    || flowState === 'verifying'
    || flowState === 'mobile_returned'
    || flowState === 'mobile_submitting'
    || isSettling;

  const handleManualAmountContinue = () => {
    const result = validateManualIdrAmount(manualAmountText, t);

    if (result.error) {
      setManualAmountError(result.error);
      return;
    }

    setManualAmountError('');
    setManualAmountIdr(result.amount);
    setQuoteError(null);
    setPaymentError(null);
  };

  const handleConfirm = async () => {
    if (!canReviewPayment || isQuoteLoading) {
      return;
    }

    setIsQuoteLoading(true);
    setQuoteError(null);
    setQuote(null);
    setPaymentError(null);

    try {
      const nextQuote = await fetchPaymentQuote({
        qrisPayload: parsedPayment.rawData,
        idrAmount: Number.isFinite(manualAmountIdr) ? manualAmountIdr : null,
      });
      setQuote(nextQuote);
    } catch (error) {
      const apiError = error.apiError || normalizeApiError(null, error.message);
      setQuoteError(apiError);
    } finally {
      setIsQuoteLoading(false);
    }
  };

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
          merchantName: paymentReviewData.merchantName,
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
    ? formatSettledAt(settlementResult.settledAt)
    : formatSettledAt(submittedPayment?.submittedAt || quote?.createdAt);
  const payoutStatusLabel = t('payment.payoutStatusSimulated');

  return (
    <Fragment>
      <div className="fixed inset-0 z-110 overflow-hidden bg-black/85 p-0 backdrop-blur-lg transition-all animate-fade-in sm:p-4">
        <div
          className="kp-panel mx-auto flex h-dvh max-h-dvh w-full flex-col overflow-hidden border-0 border-brand/20 transition-colors duration-500 sm:my-5 sm:h-auto sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-190 sm:border"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-panel-title"
        >
          <div className="kp-panel-soft flex shrink-0 items-start justify-between gap-4 border-b px-4 py-4 sm:p-5">
            <div className="min-w-0">
              <div className="mb-2 text-xs font-semibold text-brand">{t('payment.qrisParsed')}</div>
              <h3 id="payment-panel-title" className="kp-text text-xl font-semibold transition-colors sm:text-2xl">
                {headerTitle}
              </h3>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="kp-control grid h-11 w-11 shrink-0 place-items-center border transition-colors hover:border-red-500/30 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label="Close payment modal"
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
                    className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline"
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

                {/* Payer Receipt Card */}
                <div className="flex flex-col overflow-hidden border border-brand/20 bg-(--kp-control-bg)">
                  <div className="border-b border-brand/20 bg-brand/10 p-3 sm:p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-brand">{t('payment.paymentProofTitle')}</p>
                    <p className="mt-2 text-xl font-semibold text-(--kp-text)">{t('payment.paymentProofStatus')}</p>
                    <p className="kp-muted mt-2 text-sm leading-6">
                      {t('payment.paymentProofBody')}
                    </p>
                  </div>

                  <div className="p-0">
                    <DetailRow label={t('payment.lblStore')} value={merchantName} title={merchantName} />
                    <DetailRow label={t('payment.lblTotalPay')} value={quoteReview?.idrAmountLabel || amountLabel} />
                    <DetailRow label={t('payment.lblSolPaid')} value={quoteReview?.solAmountLabel || t('payment.lblNotProvided')} tone="success" />
                    <DetailRow label={t('payment.lblSolanaStatus')} value={t('payment.statusPaid')} tone="success" />
                  </div>

                  <div className="border-t border-brand/20 bg-brand/5 p-3 sm:p-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {primaryExplorerUrl && (
                        <RailButton as="a" href={primaryExplorerUrl} target="_blank" rel="noreferrer" variant="secondary" className="border-brand/30 text-brand hover:bg-brand/10">
                          {t('payment.btnViewExplorer')}
                        </RailButton>
                      )}
                      <RailButton onClick={showScanAnother ? onScanAnother : onCancel} disabled={isBusy && !showScanAnother} variant="secondary">
                        {showScanAnother ? t('payment.btnScanAnother') : t('payment.btnCancel')}
                      </RailButton>
                    </div>
                  </div>
                </div>

                {/* Collapsed Demo Merchant Record */}
                <details className="group border border-(--kp-border) bg-(--kp-control-bg)">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-3 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:px-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold kp-muted">{t('payment.merchantDemoTitle')}</p>
                      <p className="kp-soft mt-1 text-xs leading-5">{t('payment.merchantDemoSummary')}</p>
                    </div>
                    <svg className="h-4 w-4 shrink-0 kp-soft transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>

                  <div className="border-t border-(--kp-border)">
                    <div className="border-b border-(--kp-border) bg-amber-500/6 px-3 py-3 sm:px-4">
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{t('payment.merchantDemoExpandedTitle')}</p>
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
                        <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{t('payment.btnSettling')}</span>
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
                  <h4 className="kp-text text-xl font-semibold">{t('payment.manualAmountTitle')}</h4>
                  <p className="kp-muted mt-2 text-sm leading-6">{t('payment.manualAmountBody')}</p>
                </div>

                <div className="border-y border-(--kp-border) bg-(--kp-control-bg) p-3 sm:border sm:p-4">
                  <p className="kp-soft text-xs font-semibold">{t('payment.manualAmountStoreHelper')}</p>
                  <p className="kp-text mt-1 wrap-break-word text-base font-semibold">{merchantName}</p>
                </div>

                <div>
                  <label htmlFor="manual-idr-amount" className="kp-text mb-2 block text-sm font-semibold">
                    {t('payment.manualAmountLabel')}
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
                    placeholder={t('payment.manualAmountPlaceholder')}
                    aria-invalid={manualAmountError ? 'true' : 'false'}
                    aria-describedby="manual-idr-amount-helper"
                    className="kp-input min-h-12 w-full border px-4 py-3 text-base font-semibold outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/15"
                  />
                  <div id="manual-idr-amount-helper" className="mt-2 min-h-5 text-xs font-semibold">
                    {manualAmountError ? (
                      <p className="text-red-700 dark:text-red-300">{manualAmountError}</p>
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
                <DetailRow label={t('payment.lblMerchant')} value={merchantName} title={merchantName} />

                {!quoteReview && (
                  <div className="border-y border-(--kp-border) bg-(--kp-control-bg) p-3 transition-colors sm:border sm:p-4">
                    <div className="flex h-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <span className="kp-text text-sm font-semibold transition-colors">{t('payment.lblTotalPay')}</span>
                      <div className="min-w-0 text-left sm:text-right">
                        <div className="wrap-break-word text-2xl font-semibold text-brand sm:text-3xl">{amountLabel}</div>
                        <div className="mt-1 text-xs font-semibold text-zinc-500">{currencyLabel}</div>
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
                        <div className="kp-muted mb-2 text-sm font-semibold">{t('payment.lblBackendQuote')}</div>
                        <div className={`wrap-break-word text-3xl font-semibold leading-none sm:text-4xl ${quoteReview.isExpired ? 'text-zinc-500' : 'text-brand'}`}>{quoteReview.solAmountLabel.replace(' SOL', '')}</div>
                        <div className="mt-2 text-xs font-semibold text-zinc-500">SOL</div>
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
            <div className="grid shrink-0 grid-cols-1 gap-3 border-t border-(--kp-border) p-3 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:p-5">
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
                  disabled={isBusy}
                >
                  {t('payment.manualAmountContinue')}
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
          )}


          
        </div>
      </div>
    </Fragment>
  );
}
