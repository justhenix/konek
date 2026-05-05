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
  'Payment configuration is missing on this deployment. Set VITE_TREASURY_WALLET in Vercel and redeploy.'
);
const PAYMENT_CONFIG_INVALID_MESSAGE = (
  'Payment configuration is invalid on this deployment. Set VITE_TREASURY_WALLET to a valid Solana address in Vercel and redeploy.'
);

const formatPaymentErrorForDisplay = (error) => {
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

const fetchPaymentQuote = async (qrisPayload) => {
  const response = await fetch('/api/v1/payment/quote', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ qrisPayload }),
  });
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
  info: 'border-white/10 bg-white/[0.035] text-zinc-300',
  success: 'border-brand/25 bg-brand/8 text-zinc-200',
  warning: 'border-amber-400/25 bg-amber-400/8 text-amber-100',
  danger: 'border-red-500/25 bg-red-500/10 text-red-100',
};

const noticeTitleStyles = {
  info: 'text-zinc-200',
  success: 'text-brand',
  warning: 'text-amber-200',
  danger: 'text-red-300',
};

const AppNotice = ({ variant = 'info', title, children, pulse = false }) => (
  <div className={`border p-4 ${noticeStyles[variant] || noticeStyles.info}`}>
    <div className="flex items-start gap-3">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${variant === 'danger' ? 'bg-red-400' : variant === 'warning' ? 'bg-amber-300' : 'bg-brand'} ${pulse ? 'animate-pulse' : ''}`}></span>
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
    wallet: 'bg-[#AB9FF2] text-zinc-950 hover:bg-[#bdb3ff] focus-visible:ring-purple-300',
    secondary: 'border border-white/10 bg-white/4 text-zinc-300 hover:border-white/20 hover:bg-white/7 focus-visible:ring-zinc-500',
    danger: 'border border-red-500/20 bg-red-500/5 text-red-300 hover:border-red-500/40 hover:bg-red-500/10 focus-visible:ring-red-400',
  };

  return (
    <ButtonComponent
      className={`flex min-h-12 items-center justify-center px-4 py-3 text-center text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant] || variants.primary} ${className}`}
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
      ? 'text-zinc-500'
      : 'text-white';
  const valueFlowClass = truncateValue
    ? 'truncate'
    : mono
      ? 'break-all'
      : 'break-words';

  return (
    <div className="grid gap-1.5 border-b border-white/10 px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(6.75rem,0.85fr)_minmax(0,1.15fr)] sm:gap-4">
      <span className="text-xs font-semibold text-zinc-500">{label}</span>
      <span className={`min-w-0 text-left text-sm font-semibold sm:text-right ${mono ? 'font-mono' : ''} ${valueFlowClass} ${toneClass}`} title={title}>
        {value}
      </span>
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

  useEffect(() => {
    onParsedData?.(parsedPayment);
  }, [onParsedData, parsedPayment]);

  useEffect(() => {
    if (!quote) {
      return undefined;
    }

    const timer = setInterval(() => {
      setQuoteClock(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, [quote]);

  const merchantName = parsedPayment.merchantName || t('payment.lblMissing');
  const amountLabel = Number.isFinite(parsedPayment.amount)
    ? `Rp ${parsedPayment.formattedAmount}`
    : t('payment.lblNotProvided');
  const currencyLabel = parsedPayment.currencyCode === '360'
    ? 'IDR'
    : parsedPayment.currencyCode || t('payment.lblNotProvided');
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
    verificationError || externalPaymentError || paymentError
  );
  const mobileStatus = mobilePaymentState?.status || null;
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
    if (parsedPayment) return 'parsed';
    return 'idle';
  }, [
    isPaymentSubmitting,
    isQuoteLoading,
    mobileStatus,
    parsedPayment,
    quoteError,
    quoteReview,
    settlementResult,
    submittedPayment,
    verificationStatus,
    visiblePaymentError,
  ]);
  const headerTitle = {
    idle: t('payment.headerIdle'),
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
  const footerLabel = flowState === 'settled'
    ? t('payment.footerSettled')
    : flowState === 'paid_verified'
      ? t('payment.footerPaid')
      : flowState === 'verifying'
        ? t('payment.footerVerifying')
        : flowState === 'tx_submitted'
          ? t('payment.footerSubmitted')
          : flowState === 'mobile_restored'
            ? t('payment.mobileSessionRestored')
            : flowState === 'mobile_expired'
              ? t('payment.mobileQuoteExpired')
              : flowState === 'mobile_returned'
                ? t('payment.mobileReturned')
                : flowState === 'mobile_submitting'
                  ? t('payment.mobileSubmitting')
          : quote?.quoteSource === 'DEMO_SIGNED_FALLBACK'
            ? t('payment.footerDemo')
            : quote
              ? `Quote ${String(quote.quoteId).slice(0, 12)}`
              : t('payment.footerParsed');
  const showTryAgain = flowState === 'failed' && parsedPayment.isValid;
  const showScanAnother = flowState === 'failed'
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

  const handleConfirm = async () => {
    if (!parsedPayment.isValid || isQuoteLoading) {
      return;
    }

    setIsQuoteLoading(true);
    setQuoteError(null);
    setQuote(null);
    setPaymentError(null);

    try {
      const nextQuote = await fetchPaymentQuote(parsedPayment.rawData);
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
          rawData: parsedPayment.rawData,
          merchantName: parsedPayment.merchantName,
          amount: parsedPayment.amount,
          amountText: parsedPayment.amountText,
          formattedAmount: parsedPayment.formattedAmount,
          currencyCode: parsedPayment.currencyCode,
          tags: parsedPayment.tags,
          isValid: parsedPayment.isValid,
          errors: parsedPayment.errors,
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

  return (
    <Fragment>
      <div className="fixed inset-0 z-110 overflow-y-auto bg-black/85 p-3 backdrop-blur-lg transition-all animate-fade-in sm:p-4">
        <div
          className="mx-auto my-3 w-full max-w-[47.5rem] border border-brand/20 bg-[#080b08] shadow-[0_24px_70px_rgba(0,0,0,0.42)] transition-colors duration-500 sm:my-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-panel-title"
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[#0b0f0b] p-4 sm:p-5">
            <div className="min-w-0">
              <div className="mb-2 text-xs font-semibold text-brand">{t('payment.qrisParsed')}</div>
              <h3 id="payment-panel-title" className="text-xl font-semibold text-white transition-colors sm:text-2xl">
                {headerTitle}
              </h3>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="grid h-9 w-9 shrink-0 place-items-center border border-white/10 bg-white/4 text-zinc-400 transition-colors hover:border-red-500/30 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label="Close payment modal"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
          <div className="space-y-4 p-4 sm:p-5">
            {!parsedPayment.isValid && (
              <AppNotice variant="danger" title={t('payment.errParser')}>
                <div className="space-y-1">
                  {parsedPayment.errors.map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              </AppNotice>
            )}

            {quoteError && (
              <AppNotice variant="danger" title={quoteError.code}>
                <p>{quoteError.message}</p>
              </AppNotice>
            )}

            {visiblePaymentError && (
              <AppNotice variant="danger" title={visiblePaymentError.code}>
                <p>{visiblePaymentError.message}</p>
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
              <AppNotice variant="success" title={t('payment.mobileWaiting')} pulse>
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
                variant="success"
                title={flowState === 'mobile_submitting' ? t('payment.mobileSubmitting') : t('payment.mobileReturned')}
                pulse
              >
                <p>{flowState === 'mobile_submitting' ? t('payment.mobileSubmittingDesc') : t('payment.mobileReturnedDesc')}</p>
              </AppNotice>
            )}

            {flowState === 'tx_submitted' && submittedPayment && (
              <AppNotice variant="success" title={t('payment.statusTxSub')}>
                <p>{t('payment.statusTxSubDesc')}</p>
                <div className="mt-4 border border-white/10 bg-[#050705] p-3">
                  <div className="mb-1 text-xs font-semibold text-zinc-500">{t('payment.lblSignature')}</div>
                  <p className="font-mono text-xs break-all text-white">{submittedPayment.signature}</p>
                </div>
              </AppNotice>
            )}

            {flowState === 'verifying' && submittedPayment && (
              <AppNotice variant="success" title={t('payment.statusVerifying')} pulse>
                <p>{t('payment.statusChecking')}</p>
              </AppNotice>
            )}

            {(flowState === 'paid_verified' || flowState === 'settled') && verifiedPayment && (
              <section className="space-y-4 border border-brand/25 bg-brand/8 p-4">
                <div className="border border-brand/20 bg-[#061108] p-4">
                  <p className="text-lg font-semibold text-brand">{flowState === 'settled' ? t('payment.headerSettled') : t('payment.statusPaid')}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {flowState === 'settled' ? t('payment.statusSettledDesc') : t('payment.statusPaidDesc')}
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="overflow-hidden border border-white/10 bg-[#050705]">
                    <DetailRow label={t('payment.lblSignature')} value={shortSignature(verifiedPayment.signature)} mono title={verifiedPayment.signature} truncateValue />
                    <DetailRow label={t('payment.lblNetwork')} value={t('payment.receiptNetwork')} />
                    <DetailRow label={t('payment.lblVerifiedBy')} value={t('payment.receiptVerifier')} />
                    <DetailRow
                      label={t('payment.lblSettlement')}
                      value={settlementResult ? t('payment.receiptSettlementDone') : t('payment.receiptSettlementNone')}
                      tone={settlementResult ? 'success' : 'muted'}
                    />
                    {settlementResult && (
                      <>
                        <DetailRow label={t('payment.lblSettlementRef')} value={settlementResult.settlementReference} mono tone="success" title={settlementResult.settlementReference} truncateValue />
                        <DetailRow label={t('payment.lblSettledAt')} value={formatSettledAt(settlementResult.settledAt)} />
                      </>
                    )}
                  </div>

                  {quoteReview && (
                    <div className="space-y-3">
                      <DetailRow label={t('payment.lblMerchant')} value={merchantName} title={merchantName} />
                      <div className="border border-brand/25 bg-brand/8 p-4 transition-colors">
                        <div className="mb-2 text-sm font-semibold text-zinc-300">{t('payment.lblBackendQuote')}</div>
                        <div className="break-words text-3xl font-semibold leading-none text-brand">{quoteReview.solAmountLabel.replace(' SOL', '')}</div>
                        <div className="mt-2 text-xs font-semibold text-zinc-500">SOL</div>
                      </div>
                      <div className="overflow-hidden border border-white/10 bg-[#050705]">
                        <DetailRow label={t('payment.lblIdrAmount')} value={quoteReview.idrAmountLabel} />
                        <DetailRow label={t('payment.lblRate')} value={quoteReview.exchangeRateLabel} />
                        <DetailRow label={t('payment.lblExpires')} value={quoteReview.expiresAtLabel} tone={quoteReview.isExpired ? 'muted' : 'default'} />
                      </div>
                    </div>
                  )}
                </div>

                {settlementResult && (
                  <AppNotice variant="warning">
                    <p>{t('payment.receiptDemoNote')}</p>
                  </AppNotice>
                )}

                {settlementError && (
                  <AppNotice variant="danger" title={settlementError.code}>
                    <p>{settlementError.message}</p>
                  </AppNotice>
                )}

                {isSettling && (
                  <div className="mt-2 flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand animate-pulse"></span>
                    <span className="text-sm font-semibold text-brand">{t('payment.btnSettling')}</span>
                  </div>
                )}
              </section>
            )}

            {!(flowState === 'paid_verified' || flowState === 'settled') && (
            <div className="space-y-4">
              <DetailRow label={t('payment.lblMerchant')} value={merchantName} title={merchantName} />

              {!quoteReview && (
                <Fragment>
                  <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="border border-white/10 bg-white/[0.035] p-4 transition-colors">
                      <div className="flex h-full items-center justify-between gap-4">
                        <span className="text-sm font-semibold text-white transition-colors">{t('payment.lblTotalPay')}</span>
                        <div className="text-right">
                          <div className="text-2xl font-semibold text-brand sm:text-3xl">{amountLabel}</div>
                          <div className="mt-1 text-xs font-semibold text-zinc-500">{currencyLabel}</div>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-hidden border border-white/10 bg-[#050705]">
                      <DetailRow label="Tag 54" value={parsedPayment.tags['54'] || t('payment.lblMissing')} mono />
                      <DetailRow label="Tag 59" value={parsedPayment.tags['59'] || t('payment.lblMissing')} mono />
                    </div>
                  </div>
                </Fragment>
              )}

              {quoteReview && (
                <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="border border-brand/25 bg-brand/8 p-4 transition-colors">
                    <div className="mb-2 text-sm font-semibold text-zinc-300">{t('payment.lblBackendQuote')}</div>
                    <div className="break-words text-3xl font-semibold leading-none text-brand sm:text-4xl">{quoteReview.solAmountLabel.replace(' SOL', '')}</div>
                    <div className="mt-2 text-xs font-semibold text-zinc-500">SOL</div>
                  </div>

                  <div className="overflow-hidden border border-white/10 bg-[#050705]">
                    <DetailRow label={t('payment.lblIdrAmount')} value={quoteReview.idrAmountLabel} />
                    <DetailRow label={t('payment.lblRate')} value={quoteReview.exchangeRateLabel} />
                    <DetailRow label={t('payment.lblExpires')} value={quoteReview.expiresAtLabel} tone={quoteReview.isExpired ? 'muted' : 'default'} />
                  </div>
                </div>
              )}
            </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-white/10 p-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:p-5">
            <RailButton
              onClick={showScanAnother ? onScanAnother : onCancel}
              disabled={isBusy && !showScanAnother}
              variant="secondary"
            >
              {showScanAnother ? t('payment.btnScanAnother') : t('payment.btnCancel')}
            </RailButton>
            
            {(flowState === 'paid_verified' || flowState === 'settled') && primaryExplorerUrl ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {flowState === 'paid_verified' && !settlementResult && !isSettling && (
                  <RailButton
                    onClick={handleSettleDemo}
                    variant="wallet"
                  >
                    {t('payment.btnSettleDemo')}
                  </RailButton>
                )}
                <RailButton
                  as="a"
                  href={primaryExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('payment.btnViewExplorer')}
                </RailButton>
              </div>
            ) : flowState === 'mobile_expired' ? null : flowState === 'mobile_restored' ? (
              <RailButton
                onClick={handleContinueToPhantom}
                disabled={quoteReview?.isExpired || isPaymentSubmitting}
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
              <RailButton
                onClick={handleContinueToPhantom}
                disabled={quoteReview.isExpired || isPaymentSubmitting}
              >
                {isPaymentSubmitting ? t('payment.btnOpeningPhantom') : t('payment.btnPayPhantom')}
              </RailButton>
            ) : (
              <RailButton
                onClick={handleConfirm}
                disabled={!parsedPayment.isValid || isQuoteLoading}
              >
                {isQuoteLoading ? t('payment.btnLoading') : t('payment.btnConfirm')}
              </RailButton>
            )}
          </div>

          <div className="border-t border-white/10 bg-[#050705] p-4 text-center transition-colors">
            <div className="text-xs font-semibold text-zinc-600 transition-colors">
              {footerLabel}
            </div>
          </div>
          
        </div>
      </div>
    </Fragment>
  );
}
