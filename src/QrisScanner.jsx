import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { parseEmvcoQris } from './utils/parseEmvcoQris';
import { getDemoQrisPayload, getStaticDemoQrisPayload } from './utils/demoQris';

const isMissingAmountError = (errorMsg) => {
  const msg = String(errorMsg).toLowerCase();
  return msg.includes('tag 54') || msg.includes('transaction amount') || msg.includes('amount is missing') || msg.includes('missing amount');
};

const getScannerIssueType = (scanResult) => {
  if (!scanResult || scanResult.parsedData?.isValid) {
    return null;
  }

  const parsedData = scanResult.parsedData;
  const errors = parsedData?.errors || [];
  const hasMissingAmountError = errors.some(isMissingAmountError);
  const isMissingAmountOnly = parsedData?.isTlvValid
    && parsedData?.merchantName
    && !parsedData?.amountText
    && errors.length === 1
    && hasMissingAmountError;

  return isMissingAmountOnly ? 'missingAmount' : 'unsupported';
};

// Thresholds for progressive scanner guidance
const SOFT_TIP_DELAY_MS = 4000;
const UNREADABLE_DELAY_MS = 12000;
const UNREADABLE_MIN_FAILED_FRAMES = 80;
const UNSUPPORTED_RESUME_DELAY_MS = 800;

/**
 * Classify a camera error into a user-facing status string.
 * The error may be a DOMException from getUserMedia (via html5-qrcode)
 * or a plain string thrown by the library itself.
 */
const classifyCameraError = (error) => {
  const errName = error?.name || '';
  const errMsg = String(error?.message || error || '').toLowerCase();

  if (import.meta.env.DEV) {
    console.log('[camera-error]', {
      name: errName,
      message: error?.message || String(error),
      protocol: window.location.protocol,
      isSecureContext: window.isSecureContext,
      hasMediaDevices: !!navigator.mediaDevices,
      hasGetUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    });
  }

  if (errName === 'NotAllowedError' || errMsg.includes('permission denied') || errMsg.includes('permission dismissed')) {
    return 'permission_denied';
  }
  if (errName === 'NotFoundError' || errMsg.includes('requested device not found') || errMsg.includes('no camera')) {
    return 'not_found';
  }
  if (errName === 'NotReadableError' || errMsg.includes('could not start video source') || errMsg.includes('already in use')) {
    return 'not_readable';
  }
  if (errName === 'OverconstrainedError') {
    return 'overconstrained';
  }
  if (errName === 'SecurityError') {
    return 'insecure_context';
  }
  if (errName === 'TypeError' || errMsg.includes('not supported') || errMsg.includes('not a function')) {
    return 'unsupported';
  }
  if (errMsg.includes('camera streaming not supported') || errMsg.includes('navigator.mediadevices not supported')) {
    return 'unsupported';
  }

  return 'failed';
};

/**
 * Get translation keys for a given camera error status.
 */
const getCameraErrorContent = (status) => {
  switch (status) {
    case 'permission_denied':
      return { titleKey: 'scanner.cameraBlockedTitle', descKey: 'scanner.cameraBlockedBody', helperKey: null, canRetry: true };
    case 'insecure_context':
      return { titleKey: 'scanner.securePageTitle', descKey: 'scanner.securePageBody', helperKey: null, canRetry: false };
    case 'unsupported':
      return { titleKey: 'scanner.cameraUnsupportedTitle', descKey: 'scanner.cameraUnsupportedBody', helperKey: null, canRetry: false };
    case 'not_found':
      return { titleKey: 'scanner.notFoundTitle', descKey: 'scanner.notFoundDesc', helperKey: null, canRetry: true };
    case 'not_readable':
      return { titleKey: 'scanner.notReadableTitle', descKey: 'scanner.notReadableDesc', helperKey: null, canRetry: true };
    default:
      return { titleKey: 'scanner.cameraFailedTitle', descKey: 'scanner.cameraFailedDesc', helperKey: null, canRetry: true };
  }
};

export default function QrisScanner({ onClose, onResult, t }) {
  // cameraStatus: 'idle' | 'requesting' | 'active' | 'permission_denied' | 'not_found' |
  //               'not_readable' | 'insecure_context' | 'unsupported' | 'failed'
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [scanResult, setScanResult] = useState(null);
  const [showDemoQr, setShowDemoQr] = useState(false);
  const [demoQrType, setDemoQrType] = useState('dynamic');

  // Progressive hint state: 'idle' | 'scanning' | 'unreadable'
  const [scanHint, setScanHint] = useState('idle');

  const scannerRef = useRef(null);
  const scanStartTimeRef = useRef(null);
  const failedFrameCountRef = useRef(0);
  const hintTimerRef = useRef(null);
  const lastAcceptedPayloadRef = useRef(null);
  const startingRef = useRef(false);
  const scannerId = "reader";

  const clearHintTimer = useCallback(() => {
    if (hintTimerRef.current) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(async () => {
    clearHintTimer();
    startingRef.current = false;
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch {
        // Camera stop can fail if already stopped
      }
    }
  }, [clearHintTimer]);

  const handleClose = async () => {
    await stopCamera();
    onClose();
  };

  const processPayment = useCallback((decodedText) => {
    // Ignore if this exact payload was already accepted
    if (lastAcceptedPayloadRef.current === decodedText) {
      return false;
    }

    clearHintTimer();
    setScanHint('idle');
    failedFrameCountRef.current = 0;

    const parsedData = parseEmvcoQris(decodedText);
    const nextScanResult = { rawData: decodedText, parsedData };
    const issueType = getScannerIssueType(nextScanResult);

    if (!parsedData.isValid && issueType !== 'missingAmount') {
      // Unsupported QR: show banner but allow continued scanning
      setScanResult(nextScanResult);

      // Auto-clear the unsupported banner after a short delay so scanning resumes
      hintTimerRef.current = window.setTimeout(() => {
        setScanResult((current) => {
          // Only clear if it is still the same unsupported result
          if (current?.rawData === decodedText) {
            return null;
          }
          return current;
        });
        hintTimerRef.current = null;
      }, UNSUPPORTED_RESUME_DELAY_MS);

      return false;
    }

    // Successful decode or missing-amount flow
    lastAcceptedPayloadRef.current = decodedText;

    if (onResult) {
      onResult({
        rawData: decodedText,
        parsedData,
      });
    }

    return true;
  }, [clearHintTimer, onResult]);

  /**
   * Start camera -- called directly from button click handler to preserve
   * user gesture for mobile permission prompts.
   */
  const startCamera = useCallback(async () => {
    // Prevent double-start race
    if (startingRef.current) return;
    startingRef.current = true;

    clearHintTimer();
    setScanHint('idle');
    setScanResult(null);
    failedFrameCountRef.current = 0;
    scanStartTimeRef.current = null;
    lastAcceptedPayloadRef.current = null;

    // Pre-check: secure context
    if (!window.isSecureContext) {
      setCameraStatus('insecure_context');
      startingRef.current = false;
      return;
    }

    // Pre-check: browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus('unsupported');
      startingRef.current = false;
      return;
    }

    setCameraStatus('requesting');

    // Ensure the scanner container element exists before html5-qrcode init
    await new Promise((r) => { requestAnimationFrame(() => { requestAnimationFrame(r); }); });

    const readerEl = document.getElementById(scannerId);
    if (!readerEl) {
      setCameraStatus('failed');
      startingRef.current = false;
      return;
    }

    try {
      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      const config = {
        fps: 10,
        aspectRatio: 1.0,
      };

      scanStartTimeRef.current = Date.now();
      failedFrameCountRef.current = 0;

      const onSuccess = (decodedText) => {
        const accepted = processPayment(decodedText);
        if (accepted) {
          stopCamera();
        }
      };

      const onFailedFrame = () => {
        failedFrameCountRef.current += 1;
        const elapsed = Date.now() - (scanStartTimeRef.current || Date.now());

        if (
          elapsed >= UNREADABLE_DELAY_MS
          && failedFrameCountRef.current >= UNREADABLE_MIN_FAILED_FRAMES
        ) {
          setScanHint('unreadable');
        } else if (elapsed >= SOFT_TIP_DELAY_MS) {
          setScanHint((current) => {
            if (current === 'unreadable') return current;
            return 'scanning';
          });
        }
      };

      // Try environment camera first with non-strict constraint
      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          onSuccess,
          onFailedFrame
        );
        setCameraStatus('active');
        startingRef.current = false;
        return;
      } catch (envError) {
        // Classify to decide if fallback is appropriate
        const envStatus = classifyCameraError(envError);
        // Only retry with simpler constraints for overconstrained/not_found
        if (envStatus !== 'overconstrained' && envStatus !== 'not_found') {
          setCameraStatus(envStatus);
          startingRef.current = false;
          return;
        }
      }

      // Fallback: try any available camera
      try {
        // Need a fresh instance since the previous one may be in a bad state
        scannerRef.current = null;
        const html5QrCodeFallback = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCodeFallback;

        await html5QrCodeFallback.start(
          { facingMode: "user" },
          config,
          onSuccess,
          onFailedFrame
        );
        setCameraStatus('active');
        startingRef.current = false;
        return;
      } catch (fallbackError) {
        setCameraStatus(classifyCameraError(fallbackError));
        startingRef.current = false;
      }
    } catch (outerError) {
      setCameraStatus(classifyCameraError(outerError));
      startingRef.current = false;
    }
  }, [clearHintTimer, processPayment, stopCamera, scannerId]);

  const currentDemoPayload = useMemo(() => (
    demoQrType === 'static' ? getStaticDemoQrisPayload() : getDemoQrisPayload()
  ), [demoQrType]);

  const handleUseDemoQris = async (type = 'dynamic') => {
    const demoPayload = type === 'static' ? getStaticDemoQrisPayload() : getDemoQrisPayload();
    await stopCamera();
    processPayment(demoPayload);
  };

  const handleScanAnother = () => {
    clearHintTimer();
    setScanHint('idle');
    setScanResult(null);
    failedFrameCountRef.current = 0;
    scanStartTimeRef.current = Date.now();
    lastAcceptedPayloadRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearHintTimer();
      stopCamera();
    };
  }, [clearHintTimer, stopCamera]);

  // Reset hint state when a successful decode clears scanResult
  useEffect(() => {
    if (!scanResult && cameraStatus === 'active') {
      if (scanStartTimeRef.current) {
        const elapsed = Date.now() - scanStartTimeRef.current;
        if (elapsed < SOFT_TIP_DELAY_MS) {
          setScanHint('idle');
        }
      }
    }
  }, [scanResult, cameraStatus]);

  const isCameraError = !['idle', 'requesting', 'active'].includes(cameraStatus);
  const showCameraPreview = cameraStatus === 'active' || cameraStatus === 'requesting';

  return (
    <Fragment>
      <style>
        {`@keyframes scan-laser { 0% { top: 0; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }`}
      </style>

      <div className="fixed inset-0 z-100 flex items-stretch justify-center overflow-hidden bg-black/80 p-0 backdrop-blur-md transition-all sm:items-start sm:p-4">
        <div
          className={`kp-panel rail-scrollbar relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden border-0 sm:my-3 sm:h-auto sm:max-h-[calc(100dvh-1.5rem)] sm:border ${showCameraPreview ? 'sm:max-w-200' : 'sm:max-w-lg'}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="qris-scanner-title"
        >

          <div className="kp-panel-soft flex shrink-0 items-start justify-between gap-4 border-b px-4 py-4 sm:p-5">
            <div className="min-w-0">
              <h3 id="qris-scanner-title" className="kp-text text-xl font-semibold transition-colors">{t('scanner.scanTitle')}</h3>
              <p className="kp-soft mt-1 text-xs font-semibold">
                {cameraStatus === 'requesting' ? t('scanner.requestingCamera') : cameraStatus === 'active' ? t('scanner.scanSubtitle') : t('scanner.cameraPermissionTitle')}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="kp-control grid h-11 w-11 shrink-0 place-items-center border transition-colors hover:border-red-500/30 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label={t('scanner.closeLabel')}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <div className={`min-h-0 flex-1 overflow-y-auto ${showCameraPreview ? 'md:grid md:grid-cols-[minmax(0,1fr)_18rem]' : ''}`}>
          {/* SCREEN: IDLE -- initial prompt */}
          {cameraStatus === 'idle' && (
            <div className="flex flex-col items-center p-4 text-center sm:p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center border border-brand/25 bg-brand/8">
                <svg className="h-6 w-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              </div>
              <h4 className="kp-text mb-2 text-xl font-semibold">{t('scanner.cameraPermissionTitle')}</h4>
              <p className="kp-muted mb-5 max-w-sm text-sm leading-6">{t('scanner.cameraPermissionBody')}</p>
              <button type="button" onClick={startCamera} className="min-h-12 w-full bg-brand px-5 py-3 text-sm font-bold text-black transition hover:bg-brand/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">{t('scanner.openCamera')}</button>
            </div>
          )}

          {/* SCREEN: CAMERA ERROR -- specific failure states */}
          {isCameraError && (() => {
            const content = getCameraErrorContent(cameraStatus);
            return (
              <div className="flex flex-col items-center justify-center p-4 text-center sm:p-8">
                <div className="mb-5 flex h-16 w-16 items-center justify-center border border-red-500/25 bg-red-500/10">
                  <svg className="h-8 w-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                  </svg>
                </div>
                <h4 className="kp-text mb-2 text-xl font-semibold transition-colors">{t(content.titleKey)}</h4>
                <p className="kp-muted mb-3 text-sm leading-7 transition-colors">
                  {t(content.descKey)}
                </p>
                {content.helperKey && (
                  <p className="kp-soft mb-5 max-w-sm text-xs leading-5">
                    {t(content.helperKey)}
                  </p>
                )}
                {content.canRetry && (
                  <button type="button" onClick={startCamera} className="kp-button-secondary min-h-12 w-full border px-5 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    {t('scanner.tryAgain')}
                  </button>
                )}
              </div>
            );
          })()}

          {/* SCREEN: SCANNING / REQUESTING */}
          {showCameraPreview && (
            <div className="relative aspect-square w-full overflow-hidden bg-black">
              <div id={scannerId} className="absolute inset-0 w-full h-full [&_video]:object-cover! [&_video]:w-full! [&_video]:h-full!"></div>
              {cameraStatus === 'active' && (
                <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[68%] w-[68%] max-w-72 -translate-x-1/2 -translate-y-1/2 border border-dashed border-brand/50">
                  <div className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-brand"></div>
                  <div className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-brand"></div>
                  <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-brand"></div>
                  <div className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-brand"></div>
                  <div className="absolute left-0 right-0 z-10 h-px bg-brand" style={{ animation: 'scan-laser 2.5s ease-in-out infinite' }}></div>
                </div>
              )}
            </div>
          )}

          <div className={`${showCameraPreview ? 'border-t md:border-l md:border-t-0' : 'border-t'} kp-panel-soft flex flex-col p-3 transition-colors sm:p-5`}>
            <div className="flex flex-col items-start">
              <p className={`${showCameraPreview ? 'text-sm' : 'text-base'} kp-text mb-1 font-semibold`}>
                {showCameraPreview ? t('scanner.activeTitle') : t('scanner.demoTitle')}
              </p>
              <p className={`${showCameraPreview ? 'mb-3 text-xs leading-5' : 'mb-4 text-sm leading-6'} kp-muted`}>
                {showCameraPreview ? t('scanner.activeBody') : t('scanner.demoHint')}
              </p>

              {/* Progressive scanner guidance */}
              {cameraStatus === 'active' && !scanResult && scanHint === 'idle' && (
                <div className="mb-3 w-full border border-brand/15 bg-brand/5 p-3">
                  <p className="kp-text mb-1 text-xs font-semibold">{t('scanner.scanTipsTitle')}</p>
                  <p className="kp-muted text-xs leading-5">{t('scanner.scanTipsBody')}</p>
                </div>
              )}

              {cameraStatus === 'active' && !scanResult && scanHint === 'scanning' && (
                <div className="mb-3 w-full border border-brand/15 bg-brand/5 p-3">
                  <p className="kp-text mb-1 text-xs font-semibold">{t('scanner.scanningTitle')}</p>
                  <p className="kp-muted text-xs leading-5">{t('scanner.scanningBody')}</p>
                </div>
              )}

              {cameraStatus === 'active' && !scanResult && scanHint === 'unreadable' && (
                <div className="mb-3 w-full border border-amber-400/25 bg-amber-400/10 p-3 text-amber-800 dark:text-amber-100">
                  <p className="mb-1 text-xs font-semibold text-amber-700 dark:text-amber-200">{t('scanner.unreadableTitle')}</p>
                  <p className="text-xs leading-5 text-current">{t('scanner.unreadableBody')}</p>
                </div>
              )}

              <div className={`grid w-full grid-cols-1 gap-2 ${showCameraPreview ? '' : 'sm:grid-cols-3'}`}>
                <button
                  type="button"
                  onClick={() => setShowDemoQr((prev) => !prev)}
                  className={`${showCameraPreview ? 'min-h-10 px-3 py-2 text-xs' : 'min-h-12 px-4 py-3 text-sm'} kp-button-secondary flex-1 border font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
                >
                  {t('scanner.showDemo')}
                </button>
                <button
                  type="button"
                  onClick={() => handleUseDemoQris('dynamic')}
                  className={`${showCameraPreview ? 'min-h-10 px-3 py-2 text-xs' : 'min-h-12 px-4 py-3 text-sm'} kp-button-secondary flex-1 border font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
                >
                  {t('scanner.useDynamicDemo')}
                </button>
                <button
                  type="button"
                  onClick={() => handleUseDemoQris('static')}
                  className={`${showCameraPreview ? 'min-h-10 px-3 py-2 text-xs' : 'min-h-12 px-4 py-3 text-sm'} kp-button-secondary flex-1 border font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
                >
                  {t('scanner.useStaticDemo')}
                </button>
              </div>

              {showDemoQr && (
                <div className="mt-3 flex w-full flex-col items-center border-y border-(--kp-border) bg-(--kp-panel) p-3 shadow-none sm:border sm:p-4">
                  <p className="kp-text mb-2 text-sm font-semibold">{t('scanner.showDemoTitle')}</p>
                  <p className="kp-muted mb-3 max-w-xs text-center text-xs leading-5">
                    {demoQrType === 'static' ? t('scanner.showStaticDemoHelper') : t('scanner.showDynamicDemoHelper')}
                  </p>
                  <div className="mb-3 grid w-full grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDemoQrType('dynamic')}
                      aria-pressed={demoQrType === 'dynamic'}
                      className={`min-h-10 border px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${demoQrType === 'dynamic' ? 'border-brand/35 bg-brand/10 text-brand' : 'kp-button-secondary'}`}
                    >
                      {t('scanner.demoDynamicLabel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDemoQrType('static')}
                      aria-pressed={demoQrType === 'static'}
                      className={`min-h-10 border px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${demoQrType === 'static' ? 'border-brand/35 bg-brand/10 text-brand' : 'kp-button-secondary'}`}
                    >
                      {t('scanner.demoStaticLabel')}
                    </button>
                  </div>
                  <div className={`flex w-full items-center justify-center rounded bg-white p-3 ${showCameraPreview ? 'min-h-52 max-w-52' : 'min-h-61 max-w-61'}`}>
                    <QRCodeSVG
                      value={currentDemoPayload}
                      size={showCameraPreview ? 184 : 220}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#000000"
                      includeMargin={false}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>

          {scanResult && !scanResult.parsedData.isValid && (
            <div className="border-t border-amber-400/25 bg-amber-400/10 px-4 py-4 text-amber-800 dark:text-amber-100 sm:px-5">
              <div className="mb-1 text-xs font-semibold text-amber-700 dark:text-amber-200">
                {t('scanner.unsupportedTitle')}
              </div>
              <p className="text-xs leading-6 text-current">
                {t('scanner.unsupportedBody')}
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleScanAnother}
                  className="kp-button-secondary min-h-12 flex-1 border px-4 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {t('scanner.scanAnother')}
                </button>
                <button
                  type="button"
                  onClick={() => handleUseDemoQris('dynamic')}
                  className="kp-button-secondary min-h-12 flex-1 border px-4 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {t('scanner.useDynamicDemo')}
                </button>
              </div>
            </div>
          )}


        </div>
      </div>
    </Fragment>
  );
}
