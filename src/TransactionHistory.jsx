import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDateTime } from './utils/dateFormat';
import {
  buildHistoryExportText,
  fetchWalletHistoryFromBackend,
  HISTORY_UPDATED_EVENT,
  mergeWalletHistoryRecords,
  readWalletHistory,
} from './utils/history';
import {
  buildReceiptSummary,
  copyTextToClipboard,
  createReceiptFileName,
  downloadTextFile,
  truncateMiddle,
} from './utils/receipt';
import { formatIdrAmount } from './utils/payment';

const getStatusLabel = (status, t) => {
  const normalizedStatus = String(status || '').toLowerCase();
  if (normalizedStatus === 'paid_verified' || normalizedStatus === 'confirmed') {
    return t('history.statusPaidVerified');
  }
  if (normalizedStatus === 'pending') return t('history.statusPending');
  if (normalizedStatus === 'failed') return t('history.statusFailed');
  if (normalizedStatus === 'settled') return t('history.statusSettled');
  return t('history.statusUnknown');
};

const getQrisTypeLabel = (qrisType, t) => {
  if (qrisType === 'static') return t('payment.qrisTypeStatic');
  if (qrisType === 'dynamic') return t('payment.qrisTypeDynamic');
  return t('payment.lblNotProvided');
};

const formatHistoryDate = (value, language, t) => (
  formatDateTime(value, language) || t('payment.lblDateUnavailable')
);

const getIdrAmountLabel = (record) => (
  record.idrAmountLabel || (Number.isFinite(record.idrAmount) ? formatIdrAmount(record.idrAmount) : '')
);

const getSolAmountLabel = (record) => (
  record.solAmountLabel || (record.solAmount ? `${record.solAmount} SOL` : '')
);

const HistoryActionButton = ({ children, className = '', ...props }) => (
  <button
    type="button"
    className={`min-h-10 border border-brand/25 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-brand transition hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  >
    {children}
  </button>
);

const HistoryLinkButton = ({ children, className = '', ...props }) => (
  <a
    className={`inline-flex min-h-10 items-center justify-center border border-brand/25 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-brand transition hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${className}`}
    {...props}
  >
    {children}
  </a>
);

const ReceiptDetailRow = ({ label, value, mono = false, title }) => {
  if (!value) return null;

  return (
    <div className="grid min-w-0 gap-2 border-b border-(--kp-border) px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(6.75rem,0.78fr)_minmax(0,1.22fr)] sm:px-4">
      <span className="kp-soft text-xs font-semibold">{label}</span>
      <span className={`min-w-0 text-left text-sm font-semibold sm:text-right ${mono ? 'break-all font-mono' : 'wrap-break-word'} kp-text`} title={title || value}>
        {value}
      </span>
    </div>
  );
};

function HistoryReceiptDetail({
  record,
  language,
  t,
  onClose,
}) {
  const [actionMessage, setActionMessage] = useState('');
  const qrisTypeLabel = getQrisTypeLabel(record.qrisType, t);
  const statusLabel = getStatusLabel(record.status, t);
  const idrAmountLabel = getIdrAmountLabel(record);
  const solAmountLabel = getSolAmountLabel(record);
  const timestampLabel = formatHistoryDate(record.timestamp, language, t);
  const networkLabel = record.networkLabel || t('payment.receiptNetwork');
  const disclaimer = record.settlementDisclaimer || t('payment.receiptSettlementDemoNote');
  const receiptSummary = useMemo(() => buildReceiptSummary({
    title: t('payment.receiptSummaryTitle'),
    fields: [
      { label: t('payment.lblStore'), value: record.merchantName },
      { label: t('payment.lblCity'), value: record.merchantCity },
      { label: t('payment.lblQrisType'), value: qrisTypeLabel },
      { label: t('payment.lblIdrAmount'), value: idrAmountLabel },
      { label: t('payment.lblSolPaid'), value: solAmountLabel },
      { label: t('payment.lblStatus'), value: statusLabel },
      { label: t('payment.lblWallet'), value: record.walletAddress },
      { label: t('payment.lblSignature'), value: record.signature },
      { label: t('payment.lblExplorerLink'), value: record.explorerUrl },
      { label: t('payment.receiptTimestamp'), value: timestampLabel },
      { label: t('payment.lblQuoteId'), value: record.quoteId },
      { label: t('payment.lblNetwork'), value: networkLabel },
    ],
    disclaimer: `${t('payment.receiptVerifiedBody')} ${disclaimer}`,
  }), [
    disclaimer,
    idrAmountLabel,
    networkLabel,
    qrisTypeLabel,
    record,
    solAmountLabel,
    statusLabel,
    t,
    timestampLabel,
  ]);

  useEffect(() => {
    if (!actionMessage) return undefined;

    const timer = window.setTimeout(() => setActionMessage(''), 2200);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const handleCopy = async (value, successMessage) => {
    const didCopy = await copyTextToClipboard(value);
    setActionMessage(didCopy ? successMessage : t('payment.copyUnavailable'));
  };

  const handleShareReceipt = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: t('payment.receiptSummaryTitle'),
          text: receiptSummary,
          url: record.explorerUrl || undefined,
        });
        setActionMessage(t('payment.receiptShared'));
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }

    await handleCopy(receiptSummary, t('payment.receiptCopied'));
  };

  const handleDownload = () => {
    const didDownload = downloadTextFile({
      fileName: createReceiptFileName(record.signature),
      text: receiptSummary,
    });

    setActionMessage(didDownload ? t('payment.receiptDownloaded') : t('payment.receiptDownloadFailed'));
  };

  return (
    <div className="fixed inset-0 z-100 flex items-end bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="history-receipt-title">
      <div className="kp-panel mx-auto flex max-h-dvh w-full max-w-180 flex-col overflow-hidden border border-brand/20 sm:max-h-[calc(100dvh-2rem)]">
        <div className="kp-panel-soft flex shrink-0 items-start justify-between gap-4 border-b px-4 py-4 sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-brand">{t('payment.receiptEyebrow')}</p>
              <span className="inline-flex border border-brand/30 bg-brand/10 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                {t('payment.receiptDevnetBadge')}
              </span>
            </div>
            <h3 id="history-receipt-title" className="kp-text mt-2 text-xl font-semibold sm:text-2xl">{t('history.receiptDetail')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="kp-control grid h-11 w-11 shrink-0 place-items-center border transition-colors hover:border-red-500/30 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={t('history.closeReceipt')}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div className="rail-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className="p-0">
            <ReceiptDetailRow label={t('payment.lblStore')} value={record.merchantName} title={record.merchantName} />
            <ReceiptDetailRow label={t('payment.lblCity')} value={record.merchantCity} />
            <ReceiptDetailRow label={t('payment.lblQrisType')} value={qrisTypeLabel} />
            <ReceiptDetailRow label={t('payment.lblIdrAmount')} value={idrAmountLabel} />
            <ReceiptDetailRow label={t('payment.lblSolPaid')} value={solAmountLabel} />
            <ReceiptDetailRow label={t('payment.lblStatus')} value={statusLabel} mono />
            <ReceiptDetailRow label={t('payment.lblWallet')} value={truncateMiddle(record.walletAddress)} mono title={record.walletAddress} />
            <ReceiptDetailRow label={t('payment.lblSignature')} value={truncateMiddle(record.signature, 10, 10)} mono title={record.signature} />
            <ReceiptDetailRow label={t('payment.lblExplorerLink')} value={record.explorerUrl ? t('payment.receiptExplorerValue') : ''} title={record.explorerUrl} />
            <ReceiptDetailRow label={t('payment.receiptTimestamp')} value={timestampLabel} />
            <ReceiptDetailRow label={t('payment.lblQuoteId')} value={truncateMiddle(record.quoteId, 12, 10)} mono title={record.quoteId} />
            <ReceiptDetailRow label={t('payment.lblNetwork')} value={networkLabel} />
          </div>

          <div className="border-t border-brand/20 bg-brand/5 p-4 sm:p-5">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{disclaimer}</p>
            {actionMessage && (
              <p className="mt-3 text-sm font-semibold text-brand" role="status">{actionMessage}</p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {record.explorerUrl && (
                <HistoryLinkButton href={record.explorerUrl} target="_blank" rel="noreferrer">
                  {t('payment.btnViewExplorer')}
                </HistoryLinkButton>
              )}
              <HistoryActionButton onClick={() => handleCopy(record.signature, t('payment.signatureCopied'))} disabled={!record.signature}>
                {t('payment.btnCopySignature')}
              </HistoryActionButton>
              <HistoryActionButton onClick={handleShareReceipt}>
                {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? t('payment.btnShareReceipt') : t('payment.btnCopyReceipt')}
              </HistoryActionButton>
              <HistoryActionButton onClick={handleDownload}>
                {t('payment.btnDownloadReceipt')}
              </HistoryActionButton>
              <HistoryActionButton onClick={onClose} className="text-zinc-300">
                {t('history.closeReceipt')}
              </HistoryActionButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TransactionHistory({
  walletAddress,
  language,
  t,
  onConnectWallet,
}) {
  const [historyVersion, setHistoryVersion] = useState(0);
  const [backendRecords, setBackendRecords] = useState([]);
  const [historySource, setHistorySource] = useState('local_demo');
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const isConnected = Boolean(walletAddress);
  const localRecords = useMemo(() => (
    walletAddress ? readWalletHistory({ walletAddress, refreshToken: historyVersion }) : []
  ), [historyVersion, walletAddress]);
  const records = useMemo(() => (
    mergeWalletHistoryRecords({ walletAddress, backendRecords, localRecords })
  ), [backendRecords, localRecords, walletAddress]);
  const visibleSelectedRecord = selectedRecord?.walletAddress === walletAddress
    ? selectedRecord
    : null;
  const isShowingLocalFallback = isConnected && historySource !== 'supabase' && localRecords.length > 0;

  const loadBackendHistory = useCallback(async () => {
    if (!walletAddress) {
      setBackendRecords([]);
      setHistorySource('local_demo');
      setHistoryError(null);
      return;
    }

    setIsHistoryLoading(true);
    setHistoryError(null);

    try {
      const nextBackendRecords = await fetchWalletHistoryFromBackend({ walletAddress });
      setBackendRecords(nextBackendRecords);
      setHistorySource('supabase');
    } catch (error) {
      setBackendRecords([]);
      setHistorySource('local_demo');
      setHistoryError(error);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      return undefined;
    }

    const loadTimer = window.setTimeout(() => {
      loadBackendHistory();
    }, 0);

    const handleHistoryUpdated = (event) => {
      if (!event.detail?.walletAddress || event.detail.walletAddress === walletAddress) {
        setHistoryVersion((currentVersion) => currentVersion + 1);
      }
    };
    const handleStorage = (event) => {
      if (event.key?.startsWith(`konekpay:history:${walletAddress}`)) {
        setHistoryVersion((currentVersion) => currentVersion + 1);
      }
    };

    window.addEventListener(HISTORY_UPDATED_EVENT, handleHistoryUpdated);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.clearTimeout(loadTimer);
      window.removeEventListener(HISTORY_UPDATED_EVENT, handleHistoryUpdated);
      window.removeEventListener('storage', handleStorage);
    };
  }, [loadBackendHistory, walletAddress]);

  useEffect(() => {
    if (!actionMessage) return undefined;

    const timer = window.setTimeout(() => setActionMessage(''), 2200);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const exportText = useMemo(() => buildHistoryExportText({
    walletAddress,
    records: records.map((record) => ({
      ...record,
      qrisTypeLabel: getQrisTypeLabel(record.qrisType, t),
      statusLabel: getStatusLabel(record.status, t),
    })),
    language,
    labels: {
      title: t('history.exportTitle'),
      wallet: t('payment.lblWallet'),
      generatedAt: t('history.generatedAt'),
      disclaimer: t('history.localDemoNotice'),
      missing: t('payment.lblNotProvided'),
      qrisType: t('payment.lblQrisType'),
      idrAmount: t('payment.lblIdrAmount'),
      solAmount: t('payment.lblSolPaid'),
      status: t('payment.lblStatus'),
      signature: t('payment.lblSignature'),
      explorerUrl: t('history.explorerUrl'),
      timestamp: t('payment.receiptTimestamp'),
      quoteId: t('payment.lblQuoteId'),
      network: t('payment.lblNetwork'),
    },
  }), [language, records, t, walletAddress]);

  const handleExport = () => {
    const didDownload = downloadTextFile({
      fileName: `konekpay-history-${truncateMiddle(walletAddress, 6, 4).replace('...', '-') || 'wallet'}.txt`,
      text: exportText,
    });
    setActionMessage(didDownload ? t('history.exported') : t('history.exportFailed'));
  };

  const handlePrint = () => {
    if (typeof window === 'undefined' || typeof window.print !== 'function') {
      setActionMessage(t('history.printUnavailable'));
      return;
    }

    window.print();
  };

  return (
    <section id="history-section" className="border-y border-white/10">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="kp-panel overflow-hidden border border-white/10">
          <div className="kp-panel-soft flex min-w-0 flex-col gap-4 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">{t('history.history')}</p>
              <h2 className="kp-text mt-2 text-2xl font-semibold">{t('history.transactionHistory')}</h2>
              <p className="kp-muted mt-2 text-sm leading-6">
                {isConnected ? t('history.backendHistoryIntro') : t('history.connectWalletPrompt')}
              </p>
            </div>
            {isConnected && (
              <div className="flex min-w-0 flex-col gap-2 sm:items-end">
                <span className="inline-flex w-fit border border-brand/30 bg-brand/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                  {t('payment.receiptDevnetBadge')}
                </span>
                <p className="max-w-full truncate font-mono text-xs font-semibold text-zinc-500" title={walletAddress}>
                  {truncateMiddle(walletAddress, 10, 8)}
                </p>
              </div>
            )}
          </div>

          {!isConnected ? (
            <div className="grid gap-4 p-4 sm:p-5">
              <p className="kp-muted text-sm leading-6">{t('history.connectWalletToView')}</p>
              <HistoryActionButton onClick={onConnectWallet} className="w-full bg-brand text-black hover:bg-brand/90 sm:w-fit">
                {t('navbar.connectWallet')}
              </HistoryActionButton>
            </div>
          ) : isHistoryLoading && records.length === 0 ? (
            <div className="p-4 sm:p-5">
              <div className="border border-(--kp-border) bg-(--kp-control-bg) p-5">
                <p className="kp-text text-base font-semibold">{t('history.loadingHistory')}</p>
                <p className="kp-muted mt-2 text-sm leading-6">{t('history.loadingHistoryBody')}</p>
              </div>
            </div>
          ) : records.length === 0 ? (
            <div className="p-4 sm:p-5">
              <div className="border border-dashed border-(--kp-border) bg-(--kp-control-bg) p-5 text-center">
                <p className="kp-text text-base font-semibold">{t('history.noTransactions')}</p>
                <p className="kp-muted mt-2 text-sm leading-6">{t('history.noTransactionsBody')}</p>
                {historyError && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{t('history.unableToLoadHistory')}</p>
                    <HistoryActionButton onClick={loadBackendHistory} className="mt-3">
                      {t('history.retryHistoryLoad')}
                    </HistoryActionButton>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-0">
              {(isShowingLocalFallback || historyError) && (
                <div className="border-b border-amber-400/25 bg-amber-400/10 px-4 py-3 sm:px-5">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    {isShowingLocalFallback ? t('history.showingLocalDemoHistory') : t('history.backendUnavailable')}
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-3 border-b border-(--kp-border) p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <p className="kp-muted text-sm font-semibold">{t('history.itemCount').replace('{count}', String(records.length))}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {historyError && (
                    <HistoryActionButton onClick={loadBackendHistory}>{t('history.retryHistoryLoad')}</HistoryActionButton>
                  )}
                  <HistoryActionButton onClick={handleExport}>{t('history.exportHistory')}</HistoryActionButton>
                  <HistoryActionButton onClick={handlePrint}>{t('history.printHistory')}</HistoryActionButton>
                </div>
              </div>

              <div className="divide-y divide-(--kp-border)">
                {records.map((record) => {
                  const statusLabel = getStatusLabel(record.status, t);
                  const timestampLabel = formatHistoryDate(record.timestamp, language, t);
                  const explorerUrl = record.explorerUrl;

                  return (
                    <article key={record.id} className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h3 className="kp-text min-w-0 wrap-break-word text-base font-semibold">{record.merchantName || t('payment.lblNotProvided')}</h3>
                          <span className="inline-flex shrink-0 border border-brand/25 bg-brand/8 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                            {getQrisTypeLabel(record.qrisType, t)}
                          </span>
                          <span className="inline-flex shrink-0 border border-purple-400/25 bg-purple-500/10 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-purple-700 dark:text-purple-200">
                            {record.networkLabel || t('payment.receiptNetwork')}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                          <div className="min-w-0">
                            <p className="kp-soft text-xs font-semibold">{t('payment.lblIdrAmount')}</p>
                            <p className="kp-text mt-1 font-semibold">{getIdrAmountLabel(record) || t('payment.lblNotProvided')}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="kp-soft text-xs font-semibold">{t('payment.lblSolPaid')}</p>
                            <p className="kp-text mt-1 font-semibold">{getSolAmountLabel(record) || t('payment.lblNotProvided')}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="kp-soft text-xs font-semibold">{t('payment.lblStatus')}</p>
                            <p className="mt-1 wrap-break-word font-mono text-xs font-bold text-brand">{statusLabel}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="kp-soft text-xs font-semibold">{t('payment.receiptTimestamp')}</p>
                            <p className="kp-text mt-1 font-semibold">{timestampLabel}</p>
                          </div>
                        </div>

                        {record.signature && (
                          <p className="kp-muted mt-3 min-w-0 break-all font-mono text-xs font-semibold" title={record.signature}>
                            {truncateMiddle(record.signature, 12, 12)}
                          </p>
                        )}
                      </div>

                      <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:w-44 lg:grid-cols-1">
                        <HistoryActionButton onClick={() => setSelectedRecord(record)}>
                          {t('history.viewReceipt')}
                        </HistoryActionButton>
                        {explorerUrl && (
                          <HistoryLinkButton href={explorerUrl} target="_blank" rel="noreferrer">
                            {t('payment.btnViewExplorer')}
                          </HistoryLinkButton>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {actionMessage && (
                <p className="border-t border-(--kp-border) px-4 py-3 text-sm font-semibold text-brand sm:px-5" role="status">
                  {actionMessage}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {visibleSelectedRecord && (
        <HistoryReceiptDetail
          record={visibleSelectedRecord}
          language={language}
          t={t}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </section>
  );
}
