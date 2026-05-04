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

const getParsedPayment = (qrisData, initialParsedData) => {
  if (initialParsedData?.rawData === qrisData) {
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

export default function PaymentPage({
  qrisData,
  initialParsedData,
  initialQuote,
  paymentSubmission,
  paymentVerification,
  externalPaymentError,
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
  const visiblePaymentError = verificationError || externalPaymentError || paymentError;
  const flowState = useMemo(() => {
    if (verificationStatus === 'paid_verified') return 'paid_verified';
    if (verificationStatus === 'verifying') return 'verifying';
    if (verificationStatus === 'failed' || quoteError || visiblePaymentError) return 'failed';
    if (submittedPayment) return 'tx_submitted';
    if (isPaymentSubmitting) return 'awaiting_signature';
    if (isQuoteLoading) return 'quoting';
    if (quoteReview) return 'quote_ready';
    if (parsedPayment) return 'parsed';
    return 'idle';
  }, [
    isPaymentSubmitting,
    isQuoteLoading,
    parsedPayment,
    quoteError,
    quoteReview,
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
    tx_submitted: t('payment.headerSubmitted'),
    verifying: t('payment.headerVerifying'),
    paid_verified: t('payment.headerPaid'),
    failed: t('payment.headerFailed'),
  }[flowState];
  const footerLabel = flowState === 'paid_verified'
    ? t('payment.footerPaid')
    : flowState === 'verifying'
      ? t('payment.footerVerifying')
      : flowState === 'tx_submitted'
        ? t('payment.footerSubmitted')
        : quote?.quoteSource === 'DEMO_SIGNED_FALLBACK'
          ? t('payment.footerDemo')
          : quote
            ? `Quote ${String(quote.quoteId).slice(0, 12)}`
            : t('payment.footerParsed');
  const showTryAgain = flowState === 'failed' && parsedPayment.isValid;
  const showScanAnother = flowState === 'failed' || flowState === 'paid_verified';
  const primaryExplorerUrl = verifiedPayment?.explorerUrl || submittedPayment?.explorerUrl || '';
  const isBusy = isQuoteLoading || isPaymentSubmitting || flowState === 'verifying';

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
          currencyCode: parsedPayment.currencyCode,
          tags: parsedPayment.tags,
        },
        quote,
      });

      if (result?.status !== 'redirecting') {
        setIsPaymentSubmitting(false);
      }
    } catch (error) {
      setPaymentError({
        code: 'PAYMENT_FAILED',
        message: error.message || 'Unable to submit payment with Phantom.',
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

  return (
    <Fragment>
      <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/90 backdrop-blur-lg p-4 transition-all animate-fade-in">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-brand/30 rounded-4xl sm:rounded-[2.5rem] w-full max-w-md max-h-[calc(100vh-2rem)] overflow-hidden shadow-2xl flex flex-col transition-colors duration-500">
          
          <div className="p-6 sm:p-8 text-center border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900 transition-colors">
            <div className="text-brand text-[10px] font-black tracking-[0.4em] uppercase mb-2">{t('payment.qrisParsed')}</div>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter transition-colors">
              {headerTitle}
            </h3>
          </div>
          
          <div className="p-6 sm:p-8 space-y-6 overflow-y-auto">
            {!parsedPayment.isValid && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5">
                <div className="text-red-400 text-xs font-bold uppercase tracking-widest mb-2">{t('payment.errParser')}</div>
                <div className="space-y-1">
                  {parsedPayment.errors.map((error) => (
                    <p key={error} className="text-red-300 text-sm">{error}</p>
                  ))}
                </div>
              </div>
            )}

            {quoteError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5">
                <div className="text-red-400 text-xs font-bold uppercase tracking-widest mb-2">{quoteError.code}</div>
                <p className="text-red-300 text-sm leading-relaxed">{quoteError.message}</p>
              </div>
            )}

            {visiblePaymentError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5">
                <div className="text-red-400 text-xs font-bold uppercase tracking-widest mb-2">{visiblePaymentError.code}</div>
                <p className="text-red-300 text-sm leading-relaxed">{visiblePaymentError.message}</p>
                {primaryExplorerUrl && (
                  <a
                    href={primaryExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex mt-4 text-brand text-xs font-black uppercase tracking-widest hover:underline"
                  >
                    {t('payment.btnViewExplorer')}
                  </a>
                )}
              </div>
            )}

            {isQuoteLoading && (
              <div className="bg-brand/10 border border-brand/30 rounded-2xl p-5 flex items-center gap-4">
                <span className="w-3 h-3 rounded-full bg-brand animate-pulse shrink-0"></span>
                <div>
                  <div className="text-brand text-xs font-bold uppercase tracking-widest">{t('payment.statusLoading')}</div>
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">{t('payment.statusFetching')}</p>
                </div>
              </div>
            )}

            {isPaymentSubmitting && (
              <div className="bg-brand/10 border border-brand/30 rounded-2xl p-5 flex items-center gap-4">
                <span className="w-3 h-3 rounded-full bg-brand animate-pulse shrink-0"></span>
                <div>
                  <div className="text-brand text-xs font-bold uppercase tracking-widest">{t('payment.statusOpening')}</div>
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">{t('payment.statusApprove')}</p>
                </div>
              </div>
            )}

            {flowState === 'tx_submitted' && submittedPayment && (
              <div className="bg-brand/10 border border-brand/30 rounded-2xl p-5">
                <div className="text-brand text-xs font-bold uppercase tracking-widest mb-2">{t('payment.statusTxSub')}</div>
                <p className="text-zinc-600 dark:text-zinc-300 text-sm leading-relaxed mb-4">
                  {t('payment.statusTxSubDesc')}
                </p>
                <div className="rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-white/5 p-4">
                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-1">{t('payment.lblSignature')}</div>
                  <p className="text-xs text-zinc-900 dark:text-white font-mono break-all">{submittedPayment.signature}</p>
                </div>
              </div>
            )}

            {flowState === 'verifying' && submittedPayment && (
              <div className="bg-brand/10 border border-brand/30 rounded-2xl p-5 flex items-center gap-4">
                <span className="w-3 h-3 rounded-full bg-brand animate-pulse shrink-0"></span>
                <div>
                  <div className="text-brand text-xs font-bold uppercase tracking-widest">{t('payment.statusVerifying')}</div>
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
                    {t('payment.statusChecking')}
                  </p>
                </div>
              </div>
            )}

            {flowState === 'paid_verified' && verifiedPayment && (
              <div className="bg-brand/10 border border-brand/30 rounded-2xl p-5">
                <div className="text-brand text-xs font-bold uppercase tracking-widest mb-2">{t('payment.statusPaid')}</div>
                <p className="text-zinc-600 dark:text-zinc-300 text-sm leading-relaxed mb-4">
                  {t('payment.statusPaidDesc')}
                </p>
                <div className="rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-white/5 p-4">
                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-1">{t('payment.lblSignature')}</div>
                  <p className="text-xs text-zinc-900 dark:text-white font-mono break-all">{verifiedPayment.signature}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex justify-between items-start gap-4">
                <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest transition-colors">{t('payment.lblMerchant')}</span>
                <span className="text-zinc-900 dark:text-white font-black text-right max-w-[62%] wrap-break-word transition-colors" title={merchantName}>
                  {merchantName}
                </span>
              </div>

              {!quoteReview && (
                <Fragment>
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-3xl p-6 border border-zinc-100 dark:border-white/5 transition-colors">
                    <div className="flex justify-between items-center gap-4">
                      <span className="text-zinc-900 dark:text-white font-black uppercase text-xs tracking-widest transition-colors">{t('payment.lblTotalPay')}</span>
                      <div className="text-right">
                        <div className="text-3xl font-black text-brand">{amountLabel}</div>
                        <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">{currencyLabel}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-zinc-100 dark:border-white/5 overflow-hidden">
                    <div className="flex justify-between items-start gap-4 p-4 bg-white dark:bg-zinc-900 transition-colors">
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-600 font-bold uppercase tracking-widest">Tag 54</span>
                      <span className="text-sm text-zinc-900 dark:text-white font-bold text-right break-all">{parsedPayment.tags['54'] || t('payment.lblMissing')}</span>
                    </div>
                    <div className="flex justify-between items-start gap-4 p-4 bg-zinc-50 dark:bg-zinc-950 transition-colors">
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-600 font-bold uppercase tracking-widest">Tag 59</span>
                      <span className="text-sm text-zinc-900 dark:text-white font-bold text-right break-all">{parsedPayment.tags['59'] || 'Missing'}</span>
                    </div>
                  </div>
                </Fragment>
              )}

              {quoteReview && (
                <div className="space-y-4">
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-3xl p-6 border border-zinc-100 dark:border-white/5 transition-colors">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-2">{t('payment.lblBackendQuote')}</div>
                    <div className="text-4xl font-black text-brand leading-none">{quoteReview.solAmountLabel.replace(' SOL', '')}</div>
                    <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-2">SOL</div>
                  </div>

                  <div className="rounded-3xl border border-zinc-100 dark:border-white/5 overflow-hidden">
                    <div className="flex justify-between items-start gap-4 p-4 bg-white dark:bg-zinc-900 transition-colors">
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-600 font-bold uppercase tracking-widest">{t('payment.lblIdrAmount')}</span>
                      <span className="text-sm text-zinc-900 dark:text-white font-bold text-right">{quoteReview.idrAmountLabel}</span>
                    </div>
                    <div className="flex justify-between items-start gap-4 p-4 bg-zinc-50 dark:bg-zinc-950 transition-colors">
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-600 font-bold uppercase tracking-widest">{t('payment.lblRate')}</span>
                      <span className="text-sm text-zinc-900 dark:text-white font-bold text-right">{quoteReview.exchangeRateLabel}</span>
                    </div>
                    <div className="flex justify-between items-start gap-4 p-4 bg-white dark:bg-zinc-900 transition-colors">
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-600 font-bold uppercase tracking-widest">{t('payment.lblExpires')}</span>
                      <span className={`text-sm font-bold text-right ${quoteReview.isExpired ? 'text-red-400' : 'text-zinc-900 dark:text-white'}`}>
                        {quoteReview.expiresAtLabel}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 sm:p-8 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
              onClick={showScanAnother ? onScanAnother : onCancel}
              disabled={isBusy && !showScanAnother}
              className="min-h-14 py-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold uppercase text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
            >
              {showScanAnother ? t('payment.btnScanAnother') : t('payment.btnCancel')}
            </button>
            
            {flowState === 'paid_verified' && primaryExplorerUrl ? (
              <a
                href={primaryExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="min-h-14 py-4 rounded-2xl bg-brand text-black font-black uppercase text-xs leading-tight shadow-[0_0_20px_rgba(4,250,58,0.3)] hover:shadow-[0_0_30px_rgba(4,250,58,0.5)] hover:scale-105 transition-all flex justify-center items-center text-center px-4"
              >
                {t('payment.btnViewExplorer')}
              </a>
            ) : showTryAgain ? (
              <button
                onClick={handleTryAgain}
                disabled={isBusy}
                className="min-h-14 py-4 rounded-2xl bg-brand text-black font-black uppercase text-xs leading-tight shadow-[0_0_20px_rgba(4,250,58,0.3)] hover:shadow-[0_0_30px_rgba(4,250,58,0.5)] hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 transition-all flex justify-center items-center text-center px-4"
              >
                {t('payment.btnTryAgain')}
              </button>
            ) : submittedPayment && primaryExplorerUrl ? (
              <a
                href={primaryExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="min-h-14 py-4 rounded-2xl bg-brand text-black font-black uppercase text-xs leading-tight shadow-[0_0_20px_rgba(4,250,58,0.3)] hover:shadow-[0_0_30px_rgba(4,250,58,0.5)] hover:scale-105 transition-all flex justify-center items-center text-center px-4"
              >
                {t('payment.btnViewExplorer')}
              </a>
            ) : quoteReview ? (
              <button 
                onClick={handleContinueToPhantom}
                disabled={quoteReview.isExpired || isPaymentSubmitting}
                className="min-h-14 py-4 rounded-2xl bg-brand text-black font-black uppercase text-xs leading-tight shadow-[0_0_20px_rgba(4,250,58,0.3)] hover:shadow-[0_0_30px_rgba(4,250,58,0.5)] hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 transition-all flex justify-center items-center text-center px-4"
              >
                {isPaymentSubmitting ? t('payment.btnOpeningPhantom') : t('payment.btnPayPhantom')}
              </button>
            ) : (
              <button 
                onClick={handleConfirm}
                disabled={!parsedPayment.isValid || isQuoteLoading}
                className="min-h-14 py-4 rounded-2xl bg-brand text-black font-black uppercase text-xs shadow-[0_0_20px_rgba(4,250,58,0.3)] hover:shadow-[0_0_30px_rgba(4,250,58,0.5)] hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 transition-all flex justify-center items-center"
              >
                {isQuoteLoading ? t('payment.btnLoading') : t('payment.btnConfirm')}
              </button>
            )}
          </div>

          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 text-center border-t border-zinc-100 dark:border-white/5 transition-colors">
            <div className="text-[9px] text-zinc-400 dark:text-zinc-600 font-bold tracking-[0.2em] uppercase transition-colors">
              {footerLabel}
            </div>
          </div>
          
        </div>
      </div>
    </Fragment>
  );
}
