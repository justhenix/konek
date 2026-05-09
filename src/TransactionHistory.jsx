import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime } from "./utils/dateFormat";
import {
  buildHistoryExportText,
  fetchWalletHistoryFromBackend,
  HISTORY_UPDATED_EVENT,
  mergeWalletHistoryRecords,
  readWalletHistory,
} from "./utils/history";
import {
  buildReceiptSummary,
  copyTextToClipboard,
  createReceiptFileName,
  downloadTextFile,
  truncateMiddle,
} from "./utils/receipt";
import { formatIdrAmount } from "./utils/payment";

const getStatusLabel = (status, t) => {
  const normalizedStatus = String(status || "").toLowerCase();
  if (
    normalizedStatus === "paid_verified" ||
    normalizedStatus === "confirmed"
  ) {
    return t("history.statusPaidVerified");
  }
  if (normalizedStatus === "pending") return t("history.statusPending");
  if (normalizedStatus === "failed") return t("history.statusFailed");
  if (normalizedStatus === "settled") return t("history.statusSettled");
  return t("history.statusUnknown");
};

const getQrisTypeLabel = (qrisType, t) => {
  if (qrisType === "static") return t("payment.qrisTypeStatic");
  if (qrisType === "dynamic") return t("payment.qrisTypeDynamic");
  return t("payment.lblNotProvided");
};

const formatHistoryDate = (value, language, t) =>
  formatDateTime(value, language) || t("payment.lblDateUnavailable");

const getIdrAmountLabel = (record) =>
  record.idrAmountLabel ||
  (Number.isFinite(record.idrAmount) ? formatIdrAmount(record.idrAmount) : "");

const getSolAmountLabel = (record) =>
  record.solAmountLabel || (record.solAmount ? `${record.solAmount} SOL` : "");

const HistoryActionButton = ({ children, className = "", ...props }) => (
  <button
    type="button"
    className={`min-h-10 border border-brand/25 px-3 py-2 text-xs  uppercase tracking-[0.12em] text-brand transition hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  >
    {children}
  </button>
);

const HistoryLinkButton = ({ children, className = "", ...props }) => (
  <a
    className={`inline-flex min-h-10 items-center justify-center border border-brand/25 px-3 py-2 text-xs  uppercase tracking-[0.12em] text-brand transition hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${className}`}
    {...props}
  >
    {children}
  </a>
);

const ReceiptDetailRow = ({ label, value, mono = false, title }) => {
  if (!value) return null;

  return (
    <div className="grid min-w-0 gap-2 border-b border-(--kp-border) px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(6.75rem,0.78fr)_minmax(0,1.22fr)] sm:px-4">
      <span className="kp-soft text-xs ">{label}</span>
      <span
        className={`min-w-0 text-left text-sm  sm:text-right ${mono ? "break-all font-mono" : "wrap-break-word"} kp-text`}
        title={title || value}
      >
        {value}
      </span>
    </div>
  );
};

function HistoryReceiptDetail({ record, language, t, onClose }) {
  const [actionMessage, setActionMessage] = useState("");
  const qrisTypeLabel = getQrisTypeLabel(record.qrisType, t);
  const statusLabel = getStatusLabel(record.status, t);
  const idrAmountLabel = getIdrAmountLabel(record);
  const solAmountLabel = getSolAmountLabel(record);
  const timestampLabel = formatHistoryDate(record.timestamp, language, t);
  const networkLabel = record.networkLabel || t("payment.receiptNetwork");
  const disclaimer =
    record.settlementDisclaimer || t("payment.receiptSettlementDemoNote");
  const receiptSummary = useMemo(
    () =>
      buildReceiptSummary({
        title: t("payment.receiptSummaryTitle"),
        fields: [
          { label: t("payment.lblStore"), value: record.merchantName },
          { label: t("payment.lblCity"), value: record.merchantCity },
          { label: t("payment.lblQrisType"), value: qrisTypeLabel },
          { label: t("payment.lblIdrAmount"), value: idrAmountLabel },
          { label: t("payment.lblSolPaid"), value: solAmountLabel },
          { label: t("payment.lblStatus"), value: statusLabel },
          { label: t("payment.lblWallet"), value: record.walletAddress },
          { label: t("payment.lblSignature"), value: record.signature },
          { label: t("payment.lblExplorerLink"), value: record.explorerUrl },
          { label: t("payment.receiptTimestamp"), value: timestampLabel },
          { label: t("payment.lblQuoteId"), value: record.quoteId },
          { label: t("payment.lblNetwork"), value: networkLabel },
        ],
        disclaimer: `${t("payment.receiptVerifiedBody")} ${disclaimer}`,
      }),
    [
      disclaimer,
      idrAmountLabel,
      networkLabel,
      qrisTypeLabel,
      record,
      solAmountLabel,
      statusLabel,
      t,
      timestampLabel,
    ],
  );

  useEffect(() => {
    if (!actionMessage) return undefined;

    const timer = window.setTimeout(() => setActionMessage(""), 2200);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const handleCopy = async (value, successMessage) => {
    const didCopy = await copyTextToClipboard(value);
    setActionMessage(didCopy ? successMessage : t("payment.copyUnavailable"));
  };

  const handleShareReceipt = async () => {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({
          title: t("payment.receiptSummaryTitle"),
          text: receiptSummary,
          url: record.explorerUrl || undefined,
        });
        setActionMessage(t("payment.receiptShared"));
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    await handleCopy(receiptSummary, t("payment.receiptCopied"));
  };

  const handleDownload = () => {
    const didDownload = downloadTextFile({
      fileName: createReceiptFileName(record.signature),
      text: receiptSummary,
    });

    setActionMessage(
      didDownload
        ? t("payment.receiptDownloaded")
        : t("payment.receiptDownloadFailed"),
    );
  };

  const canUseWebShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      className="fixed inset-0 z-100 flex items-end bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-receipt-title"
    >
      <div className="kp-panel mx-auto flex max-h-dvh w-full max-w-180 flex-col overflow-hidden border border-brand/20 sm:max-h-[calc(100dvh-2rem)]">
        {/* Dialog header */}
        <div className="kp-panel-soft flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3 sm:px-5">
          <p className="kp-muted text-sm">{t("history.receiptDetail")}</p>
          <button
            type="button"
            onClick={onClose}
            className="kp-control grid h-9 w-9 shrink-0 place-items-center border transition-colors hover:border-red-500/30 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={t("history.closeReceipt")}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </button>
        </div>

        <div className="rail-scrollbar min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {/* Receipt card */}
          <div className="flex flex-col overflow-hidden rounded-sm border border-brand/30 bg-(--kp-control-bg) shadow-[0_4px_32px_rgba(20,241,149,0.07)]">
            {/* 1. Header */}
            <div className="border-b border-brand/15 bg-brand/6 px-4 pb-4 pt-5 sm:px-5">
              <div className="flex min-w-0 items-center gap-4">
                <div
                  className="receipt-checkmark grid h-12 w-12 shrink-0 place-items-center rounded-full border border-brand/30 bg-brand/12 text-brand shadow-[0_0_32px_rgba(20,241,149,0.18)]"
                  aria-hidden="true"
                >
                  <svg className="h-7 w-7" viewBox="0 0 48 48" fill="none">
                    <circle
                      cx="24"
                      cy="24"
                      r="18"
                      stroke="currentColor"
                      strokeWidth="3"
                      opacity="0.22"
                    />
                    <path
                      className="receipt-checkmark-path"
                      d="M15 24.5L21.5 31L34 18"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-widest text-brand">
                      {t("payment.receiptEyebrow")}
                    </p>
                    <span className="inline-flex items-center border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-brand">
                      {t("payment.receiptDevnetBadge")}
                    </span>
                  </div>
                  <h3
                    id="history-receipt-title"
                    className="kp-text mt-1 text-xl font-semibold sm:text-2xl"
                  >
                    {t("payment.receiptTitle")}
                  </h3>
                  <p className="kp-muted mt-0.5 text-sm">
                    {t("payment.receiptStatusVerified")}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Amount block */}
            {idrAmountLabel && (
              <div className="border-b border-brand/10 bg-brand/4 px-4 py-4 sm:px-5">
                <p className="text-xs font-medium uppercase tracking-wider text-brand/70">
                  {t("payment.lblAmount")}
                </p>
                <p className="mt-1 text-3xl font-bold text-brand sm:text-4xl">
                  {idrAmountLabel}
                </p>
                {solAmountLabel && (
                  <p className="kp-soft mt-1 text-sm">{solAmountLabel}</p>
                )}
              </div>
            )}

            {/* 3. Merchant summary */}
            <div className="border-b border-(--kp-border) px-4 py-3 sm:px-5 sm:py-4">
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-brand/60">
                {t("payment.lblMerchant")}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <p className="kp-soft text-[11px]">{t("payment.lblStore")}</p>
                  <p className="kp-text mt-0.5 text-sm font-medium">
                    {record.merchantName || t("payment.lblNotProvided")}
                  </p>
                </div>
                {record.merchantCity && (
                  <div>
                    <p className="kp-soft text-[11px]">
                      {t("payment.lblCity")}
                    </p>
                    <p className="kp-text mt-0.5 text-sm">
                      {record.merchantCity}
                    </p>
                  </div>
                )}
                <div>
                  <p className="kp-soft text-[11px]">
                    {t("payment.lblQrisType")}
                  </p>
                  <p className="kp-text mt-0.5 text-sm">{qrisTypeLabel}</p>
                </div>
                <div>
                  <p className="kp-soft text-[11px]">
                    {t("payment.receiptTimestamp")}
                  </p>
                  <p className="kp-text mt-0.5 text-sm">{timestampLabel}</p>
                </div>
              </div>
            </div>

            {/* 4. Proof summary */}
            <div className="border-b border-(--kp-border) px-4 py-3 sm:px-5 sm:py-4">
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-brand/60">
                {t("payment.receiptProofSection")}
              </p>
              <div className="space-y-2">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="kp-soft shrink-0 text-xs">
                    {t("payment.proofNetwork")}
                  </span>
                  <span className="text-xs font-medium text-brand">
                    {networkLabel}
                  </span>
                </div>
                {record.signature && (
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="kp-soft shrink-0 text-xs">
                      {t("payment.lblTransactionId")}
                    </span>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="min-w-0 truncate font-mono text-xs kp-text"
                        title={record.signature}
                      >
                        {truncateMiddle(record.signature, 8, 8)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(record.signature, t("payment.txIdCopied"))
                        }
                        className="shrink-0 border border-brand/25 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.12em] text-brand transition hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        aria-label={t("payment.btnCopyTxId")}
                      >
                        {t("payment.btnCopy")}
                      </button>
                      {record.explorerUrl && (
                        <a
                          href={record.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 border border-brand/25 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.12em] text-brand transition hover:bg-brand/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          aria-label={t("payment.btnViewExplorer")}
                        >
                          &#x2197;
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 5. Settlement note */}
            <div className="border-b border-amber-400/20 bg-amber-400/5 px-4 py-3 sm:px-5">
              <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                {disclaimer}
              </p>
            </div>

            {/* 6. Actions */}
            <div className="p-3 sm:p-4">
              {actionMessage && (
                <p
                  className="mb-3 text-sm font-medium text-brand"
                  role="status"
                >
                  {actionMessage}
                </p>
              )}

              {/* Primary */}
              {record.explorerUrl && (
                <a
                  href={record.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-3 flex min-h-12 w-full items-center justify-center bg-brand px-4 py-3 text-center text-sm text-black transition hover:bg-brand/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <svg
                    className="mr-2 h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  {t("payment.btnViewExplorer")}
                </a>
              )}

              {/* Secondary compact */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(record.signature, t("payment.txIdCopied"))
                  }
                  disabled={!record.signature}
                  className="kp-receipt-action-compact"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect
                      x="9"
                      y="9"
                      width="13"
                      height="13"
                      rx="2"
                      strokeWidth="2"
                    />
                    <path
                      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                      strokeWidth="2"
                    />
                  </svg>
                  <span>{t("payment.btnCopyTxId")}</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareReceipt}
                  className="kp-receipt-action-compact"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  <span>
                    {canUseWebShare
                      ? t("payment.btnShareReceipt")
                      : t("payment.btnCopyReceipt")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="kp-receipt-action-compact"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  <span>{t("payment.btnDownloadReceipt")}</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="kp-receipt-action-compact"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <span>{t("payment.btnClose")}</span>
                </button>
              </div>
            </div>

            {/* Technical details — collapsed */}
            <details className="group border-t border-(--kp-border) bg-(--kp-control-bg)">
              <summary className="kp-muted flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm transition-colors hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <span>{t("payment.technicalDetailsTitle")}</span>
                <svg
                  className="h-4 w-4 transition-transform group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="border-t border-(--kp-border)">
                <ReceiptDetailRow
                  label={t("payment.lblWallet")}
                  value={truncateMiddle(record.walletAddress)}
                  mono
                  title={record.walletAddress}
                />
                <ReceiptDetailRow
                  label={t("payment.lblTransactionId")}
                  value={record.signature}
                  mono
                  title={record.signature}
                />
                <ReceiptDetailRow
                  label={t("payment.lblQuoteId")}
                  value={truncateMiddle(record.quoteId, 12, 10)}
                  mono
                  title={record.quoteId}
                />
                <ReceiptDetailRow
                  label={t("payment.lblStatus")}
                  value={statusLabel}
                  mono
                />
                <ReceiptDetailRow
                  label={t("payment.lblExplorerUrl")}
                  value={record.explorerUrl}
                  mono
                  title={record.explorerUrl}
                />
              </div>
            </details>
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
  onBackToPayment,
}) {
  const [historyVersion, setHistoryVersion] = useState(0);
  const [backendRecords, setBackendRecords] = useState([]);
  const [backendWalletAddress, setBackendWalletAddress] = useState("");
  const [historySource, setHistorySource] = useState("local_demo");
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [actionMessage, setActionMessage] = useState("");
  const isConnected = Boolean(walletAddress);
  const localRecords = useMemo(
    () =>
      walletAddress
        ? readWalletHistory({ walletAddress, refreshToken: historyVersion })
        : [],
    [historyVersion, walletAddress],
  );
  const effectiveBackendRecords = useMemo(
    () => (backendWalletAddress === walletAddress ? backendRecords : []),
    [backendRecords, backendWalletAddress, walletAddress],
  );
  const records = useMemo(
    () =>
      mergeWalletHistoryRecords({
        walletAddress,
        backendRecords: effectiveBackendRecords,
        localRecords,
      }),
    [effectiveBackendRecords, localRecords, walletAddress],
  );
  const visibleSelectedRecord =
    selectedRecord?.walletAddress === walletAddress ? selectedRecord : null;
  const isShowingLocalFallback =
    isConnected && historySource !== "supabase" && localRecords.length > 0;

  const loadBackendHistory = useCallback(async () => {
    if (!walletAddress) {
      setBackendRecords([]);
      setBackendWalletAddress("");
      setHistorySource("local_demo");
      setHistoryError(null);
      return;
    }

    setIsHistoryLoading(true);
    setHistoryError(null);
    setSelectedRecord(null);

    try {
      const nextBackendRecords = await fetchWalletHistoryFromBackend({
        walletAddress,
      });
      setBackendRecords(nextBackendRecords);
      setBackendWalletAddress(walletAddress);
      setHistorySource("supabase");
    } catch (error) {
      setBackendRecords([]);
      setBackendWalletAddress("");
      setHistorySource("local_demo");
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
      if (
        !event.detail?.walletAddress ||
        event.detail.walletAddress === walletAddress
      ) {
        setHistoryVersion((currentVersion) => currentVersion + 1);
      }
    };
    const handleStorage = (event) => {
      if (event.key?.startsWith(`konekpay:history:${walletAddress}`)) {
        setHistoryVersion((currentVersion) => currentVersion + 1);
      }
    };

    window.addEventListener(HISTORY_UPDATED_EVENT, handleHistoryUpdated);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearTimeout(loadTimer);
      window.removeEventListener(HISTORY_UPDATED_EVENT, handleHistoryUpdated);
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadBackendHistory, walletAddress]);

  useEffect(() => {
    if (!actionMessage) return undefined;

    const timer = window.setTimeout(() => setActionMessage(""), 2200);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const exportText = useMemo(
    () =>
      buildHistoryExportText({
        walletAddress,
        records: records.map((record) => ({
          ...record,
          qrisTypeLabel: getQrisTypeLabel(record.qrisType, t),
          statusLabel: getStatusLabel(record.status, t),
        })),
        language,
        labels: {
          title: t("history.exportTitle"),
          wallet: t("payment.lblWallet"),
          generatedAt: t("history.generatedAt"),
          disclaimer: t("history.localDemoNotice"),
          missing: t("payment.lblNotProvided"),
          qrisType: t("payment.lblQrisType"),
          idrAmount: t("payment.lblIdrAmount"),
          solAmount: t("payment.lblSolPaid"),
          status: t("payment.lblStatus"),
          signature: t("payment.lblSignature"),
          explorerUrl: t("history.explorerUrl"),
          timestamp: t("payment.receiptTimestamp"),
          quoteId: t("payment.lblQuoteId"),
          network: t("payment.lblNetwork"),
        },
      }),
    [language, records, t, walletAddress],
  );

  const handleExport = () => {
    const didDownload = downloadTextFile({
      fileName: `konekpay-history-${truncateMiddle(walletAddress, 6, 4).replace("...", "-") || "wallet"}.txt`,
      text: exportText,
    });
    setActionMessage(
      didDownload ? t("history.exported") : t("history.exportFailed"),
    );
  };

  const handlePrint = () => {
    if (typeof window === "undefined" || typeof window.print !== "function") {
      setActionMessage(t("history.printUnavailable"));
      return;
    }

    window.print();
  };

  return (
    <section id="history-section" className="border-y border-white/10">
      {onBackToPayment && (
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pb-2 pt-6 sm:px-6 md:pt-10 md:pb-8 lg:px-8">
          <button
            type="button"
            onClick={onBackToPayment}
            className="inline-flex w-fit items-center gap-2 border border-white/10 px-4 py-2 text-sm text-zinc-400 transition hover:border-white/20 hover:text-white"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            {language === "id" ? "Pembayaran" : "Payment"}
          </button>
        </div>
      )}
      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-2 sm:px-6 md:pb-10 md:pt-6 lg:px-8">
        <div className="kp-panel overflow-hidden border border-white/10">
          <div className="kp-panel-soft flex min-w-0 flex-col gap-4 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <div className="min-w-0">
              <h2 className="text-2xl text-brand">
                {t("history.transactionHistory")}
              </h2>
              <p className="kp-muted mt-2 text-sm leading-6">
                {isConnected
                  ? t("history.backendHistoryIntro")
                  : t("history.connectWalletToView")}
              </p>
            </div>
            {isConnected && (
              <div className="flex min-w-0 flex-col gap-2 sm:items-end">
                <span className="inline-flex w-fit border border-brand/30 bg-brand/10 px-2.5 py-1 text-[11px]  uppercase tracking-[0.12em] text-brand">
                  {t("payment.receiptDevnetBadge")}
                </span>
                <p
                  className="max-w-full truncate font-mono text-xs  text-zinc-500"
                  title={walletAddress}
                >
                  {truncateMiddle(walletAddress, 10, 8)}
                </p>
              </div>
            )}
          </div>

          {!isConnected ? (
            <div className="grid gap-4 p-6 sm:p-8">
              <div className="border border-dashed border-(--kp-border) bg-(--kp-control-bg) p-8 text-center">
                <p className="kp-text text-base ">
                  {t("history.connectWalletToView")}
                </p>
                <button
                  type="button"
                  onClick={onConnectWallet}
                  className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 border border-purple-400/25 bg-purple-500/10 px-5 py-2.5 text-sm  text-purple-200 transition hover:border-purple-400/45 hover:bg-purple-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
                >
                  {t("navbar.connectWallet")}
                </button>
              </div>
            </div>
          ) : isHistoryLoading && records.length === 0 ? (
            <div className="p-6 sm:p-8">
              <div className="animate-border-glow border border-brand/40 bg-(--kp-control-bg) p-8">
                <p className="text-brand text-base">
                  {t("history.loadingHistory").replace(/\.+$/, "")}
                  <span className="loading-dots"></span>
                </p>
              </div>
            </div>
          ) : records.length === 0 ? (
            <div className="p-6 sm:p-8">
              <div className="border border-dashed border-(--kp-border) bg-(--kp-control-bg) p-8 text-center">
                {historyError ? (
                  <>
                    <p className="kp-text text-base ">
                      {t("history.unableToLoadHistory")}
                    </p>
                    <div className="mt-4 flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={loadBackendHistory}
                        className="kp-soft text-xs  underline underline-offset-2 hover:text-(--kp-text)"
                      >
                        {t("history.retryHistoryLoad")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="kp-text text-base ">
                      {t("history.noTransactions")}
                    </p>
                    <p className="kp-muted mt-2 text-sm leading-6">
                      {t("history.noTransactionsBody")}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-0">
              {(isShowingLocalFallback || historyError) && (
                <div className="border-b border-(--kp-border) bg-(--kp-control-bg) px-4 py-3 sm:px-5">
                  <p className="kp-soft text-xs font-medium">
                    {isShowingLocalFallback
                      ? t("history.showingLocalDemoHistory")
                      : t("history.backendUnavailable")}
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-3 border-b border-(--kp-border) p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <p className="kp-muted text-sm ">
                  {t("history.itemCount").replace(
                    "{count}",
                    String(records.length),
                  )}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {historyError && (
                    <HistoryActionButton onClick={loadBackendHistory}>
                      {t("history.retryHistoryLoad")}
                    </HistoryActionButton>
                  )}
                  <HistoryActionButton onClick={handleExport}>
                    {t("history.exportHistory")}
                  </HistoryActionButton>
                  <HistoryActionButton onClick={handlePrint}>
                    {t("history.printHistory")}
                  </HistoryActionButton>
                </div>
              </div>

              <div className="divide-y divide-(--kp-border)">
                {records.map((record) => {
                  const statusLabel = getStatusLabel(record.status, t);
                  const timestampLabel = formatHistoryDate(
                    record.timestamp,
                    language,
                    t,
                  );
                  const explorerUrl = record.explorerUrl;

                  return (
                    <article
                      key={record.id}
                      className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                    >
                      <div className="min-w-0">
                        <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center">
                          <h3 className="kp-text min-w-0 wrap-break-word text-base ">
                            {record.merchantName || t("payment.lblNotProvided")}
                          </h3>
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className="inline-flex max-w-full shrink-0 border border-brand/25 bg-brand/8 px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-brand sm:text-[11px] sm:tracking-[0.12em]">
                              {getQrisTypeLabel(record.qrisType, t)}
                            </span>
                            <span className="inline-flex max-w-full shrink-0 border border-purple-400/25 bg-purple-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-purple-700 dark:text-purple-200 sm:text-[11px] sm:tracking-[0.12em]">
                              {record.networkLabel ||
                                t("payment.receiptNetwork")}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                          <div className="min-w-0">
                            <p className="kp-soft text-xs ">
                              {t("payment.lblIdrAmount")}
                            </p>
                            <p className="kp-text mt-1 wrap-break-word">
                              {getIdrAmountLabel(record) ||
                                t("payment.lblNotProvided")}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="kp-soft text-xs ">
                              {t("payment.lblSolPaid")}
                            </p>
                            <p className="kp-text mt-1 wrap-break-word">
                              {getSolAmountLabel(record) ||
                                t("payment.lblNotProvided")}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="kp-soft text-xs ">
                              {t("payment.lblStatus")}
                            </p>
                            <p className="mt-1 wrap-break-word font-mono text-xs  text-brand">
                              {statusLabel}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="kp-soft text-xs ">
                              {t("payment.receiptTimestamp")}
                            </p>
                            <p className="kp-text mt-1 wrap-break-word">
                              {timestampLabel}
                            </p>
                          </div>
                        </div>

                        {record.signature && (
                          <p
                            className="kp-muted mt-3 min-w-0 break-all font-mono text-xs "
                            title={record.signature}
                          >
                            {truncateMiddle(record.signature, 12, 12)}
                          </p>
                        )}
                      </div>

                      <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:w-44 lg:grid-cols-1">
                        <HistoryActionButton
                          onClick={() => setSelectedRecord(record)}
                        >
                          {t("history.viewReceipt")}
                        </HistoryActionButton>
                        {explorerUrl && (
                          <HistoryLinkButton
                            href={explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t("payment.btnViewExplorer")}
                          </HistoryLinkButton>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {actionMessage && (
                <p
                  className="border-t border-(--kp-border) px-4 py-3 text-sm  text-brand sm:px-5"
                  role="status"
                >
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
