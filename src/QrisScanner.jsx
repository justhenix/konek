import { Fragment, useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { parseEmvcoQris } from './utils/parseEmvcoQris';
import { getDemoQrisPayload } from './utils/demoQris';

// Tambahan properti "onResult" untuk ngirim data ke App.jsx
export default function QrisScanner({ onClose, onResult, t }) {
  const [permission, setPermission] = useState('prompt'); 
  const [scanResult, setScanResult] = useState(null);
  const [manualPayload, setManualPayload] = useState('');
  const scannerRef = useRef(null);
  const scannerId = "reader"; 
  const isCameraActive = permission === 'granted' || permission === 'starting';

  const stopCamera = useCallback(async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error("Gagal stop camera:", err);
      }
    }
  }, []);

  const handleClose = async () => {
    await stopCamera();
    onClose();
  };

  const processPayment = useCallback((decodedText) => {
    const parsedData = parseEmvcoQris(decodedText);
    setScanResult({ rawData: decodedText, parsedData });

    if (!parsedData.isValid) {
      return false;
    }

    if (onResult) {
      onResult({
        rawData: decodedText,
        parsedData,
      }); 
    }

    return true;
  }, [onResult]);

  const triggerScanner = () => {
    setScanResult(null);
    setPermission('starting');
  };

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    await stopCamera();
    processPayment(manualPayload);
  };

  const handleUseDemoQris = async () => {
    const demoPayload = getDemoQrisPayload();
    setManualPayload(demoPayload);
    await stopCamera();
    processPayment(demoPayload);
  };

  useEffect(() => {
    if (permission === 'starting') {
      const initScanner = async () => {
        try {
          const html5QrCode = new Html5Qrcode(scannerId);
          scannerRef.current = html5QrCode;
          const config = { fps: 10, aspectRatio: 1.0 };

          await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
              const accepted = processPayment(decodedText);
              if (accepted) {
                stopCamera();
              }
            },
            () => {} // remove error message unused
          );
          setPermission('granted'); 
        } catch (err) {
          console.error("Akses kamera ditolak:", err);
          setPermission('denied'); 
        }
      };
      initScanner();
    }
  }, [permission, processPayment, stopCamera]);

  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  return (
    <Fragment>
      <style>
        {`@keyframes scan-laser { 0% { top: 0; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }`}
      </style>

      <div className="fixed inset-0 z-100 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md transition-all">
        <div
          className={`rail-scrollbar relative my-3 flex w-full flex-col overflow-hidden border border-brand/20 bg-[#080b08] shadow-[0_24px_70px_rgba(0,0,0,0.42)] ${isCameraActive ? 'max-w-200' : 'max-w-lg'}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="qris-scanner-title"
        >
          
          <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[#0b0f0b] p-5">
            <div className="min-w-0">
              <h3 id="qris-scanner-title" className="text-xl font-semibold text-white transition-colors">{t('scanner.title')}</h3>
              <p className="mt-1 text-xs font-semibold text-zinc-500">
                {permission === 'granted' ? t('scanner.cameraReady') : t('scanner.cameraAuth')}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="grid h-9 w-9 shrink-0 place-items-center border border-white/10 bg-white/4 text-zinc-400 transition-all hover:border-red-500/30 hover:text-red-300"
              aria-label="Close QRIS scanner"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <div className={isCameraActive ? 'md:grid md:grid-cols-[minmax(0,1fr)_20rem]' : ''}>
          {/* SCREEN: PROMPT */}
          {permission === 'prompt' && (
            <div className="flex flex-col items-center p-5 text-center sm:p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center border border-brand/25 bg-brand/8">
                <svg className="h-6 w-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              </div>
              <h4 className="mb-2 text-xl font-semibold text-white">{t('scanner.promptTitle')}</h4>
              <p className="mb-5 text-sm leading-6 text-zinc-400">{t('scanner.promptDesc')}</p>
              <button onClick={triggerScanner} className="min-h-11 w-full bg-brand px-5 py-2 text-sm font-bold text-black transition hover:bg-brand/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">{t('scanner.enableBtn')}</button>
            </div>
          )}

          {/* SCREEN: DENIED */}
          {permission === 'denied' && (
            <div className="flex flex-col items-center justify-center p-7 text-center sm:p-8">
              <div className="mb-5 flex h-16 w-16 items-center justify-center border border-red-500/25 bg-red-500/10">
                <svg className="h-8 w-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
              </div>
              <h4 className="mb-2 text-xl font-semibold text-white transition-colors">{t('scanner.deniedTitle')}</h4>
              <p className="mb-7 text-sm leading-7 text-zinc-400 transition-colors">
                {t('scanner.deniedDesc')}
              </p>
              <button onClick={triggerScanner} className="min-h-12 w-full border border-white/10 bg-white/4 px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:border-brand/30 hover:text-brand">
                {t('scanner.tryAgainBtn')}
              </button>
            </div>
          )}

          {/* SCREEN: SCANNING */}
          {isCameraActive && (
            <div className="relative aspect-square w-full overflow-hidden bg-black">
              <div id={scannerId} className="absolute inset-0 w-full h-full [&_video]:object-cover! [&_video]:w-full! [&_video]:h-full!"></div>
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[68%] w-[68%] max-w-72 -translate-x-1/2 -translate-y-1/2 border border-dashed border-brand/50">
                <div className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-brand"></div>
                <div className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-brand"></div>
                <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-brand"></div>
                <div className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-brand"></div>
                <div className="absolute left-0 right-0 z-10 h-px bg-brand" style={{ animation: 'scan-laser 2.5s ease-in-out infinite' }}></div>
              </div>
            </div>
          )}

          <div className={`${isCameraActive ? 'border-t md:border-l md:border-t-0' : 'border-t'} flex flex-col border-white/10 bg-[#0b0f0b] p-4 transition-colors sm:p-5`}>
            <div className="mb-4 flex flex-col items-start">
              <p className="mb-3 text-sm font-semibold text-zinc-300">
                {t('scanner.noQrisLabel')}
              </p>
              <button
                type="button"
                onClick={handleUseDemoQris}
                className="min-h-11 w-full border border-brand/30 bg-brand/5 px-4 py-3 text-sm font-bold text-brand transition-all hover:bg-brand/10"
              >
                {t('scanner.demoBtn')}
              </button>
              <p className="mt-2 text-xs text-zinc-500">
                {t('scanner.demoDisclaimer')}
              </p>
            </div>

            <details className="group mt-1 border-t border-white/5 pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-zinc-400 transition-colors hover:text-white focus:outline-none">
                <span>{t('scanner.manualToggle')}</span>
                <svg className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <form onSubmit={handleManualSubmit} className="mt-4 flex flex-col">
                <label htmlFor="manual-qris-payload" className="mb-2 block text-xs font-semibold text-zinc-500">
                  {t('scanner.manualLabel')}
                </label>
                <textarea
                  id="manual-qris-payload"
                  value={manualPayload}
                  onChange={(event) => setManualPayload(event.target.value)}
                  rows={isCameraActive ? 3 : 4}
                  placeholder={t('scanner.manualPlaceholder')}
                  className="rail-scrollbar w-full resize-none border border-white/10 bg-[#050705] p-3 font-mono text-xs text-white outline-none placeholder:text-zinc-700 transition-all focus:border-brand focus:ring-2 focus:ring-brand/15"
                />
                <button
                  type="submit"
                  disabled={!manualPayload.trim()}
                  className="mt-3 min-h-11 w-full border border-white/10 bg-white/4 px-4 py-3 text-sm font-semibold text-zinc-200 transition-all hover:border-brand/30 hover:text-brand disabled:opacity-50"
                >
                  {t('scanner.submitManualBtn')}
                </button>
              </form>
            </details>
          </div>
          </div>

          {scanResult && !scanResult.parsedData.isValid && (
            <div className="border-t border-red-500/20 bg-red-500/10 px-5 py-4">
              <div className="mb-1 text-xs font-semibold text-red-300">
                {t('scanner.errorReady')}
              </div>
              <p className="text-xs leading-6 text-red-200">
                {scanResult.parsedData.errors.join(' ')}
              </p>
            </div>
          )}

          <div className="flex justify-center border-t border-white/10 bg-[#080b08] p-4 transition-colors">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand animate-pulse"></span>
              <span className="text-xs font-semibold text-zinc-500 transition-colors">{t('scanner.footer')}</span>
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
}
