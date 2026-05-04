import { Fragment, useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { parseEmvcoQris } from './utils/parseEmvcoQris';

const DEMO_QRIS_PAYLOAD = '00020101021226430019ID.CO.KONEKPAY.DEMO0116SANDBOX-QRIS-0015204000053033605405250005802ID5922KONEKPAY DEMO MERCHANT6007JAKARTA63047F45';

// Tambahan properti "onResult" untuk ngirim data ke App.jsx
export default function QrisScanner({ onClose, onResult, t }) {
  const [permission, setPermission] = useState('prompt'); 
  const [scanResult, setScanResult] = useState(null);
  const [manualPayload, setManualPayload] = useState('');
  const scannerRef = useRef(null);
  const scannerId = "reader"; 

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
    setManualPayload(DEMO_QRIS_PAYLOAD);
    await stopCamera();
    processPayment(DEMO_QRIS_PAYLOAD);
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

      <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 transition-all">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-brand/30 rounded-[2.5rem] w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto shadow-2xl relative flex flex-col transition-colors duration-500">
          
          <div className="flex justify-between items-center p-6 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900">
            <div>
              <h3 className="text-xl font-black text-zinc-900 dark:text-white tracking-widest transition-colors">{t('scanner.title').split(' ')[0]} <span className="text-brand">{t('scanner.title').split(' ').slice(1).join(' ') || 'QRIS'}</span></h3>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold tracking-widest uppercase mt-1">
                {permission === 'granted' ? t('scanner.cameraReady') : t('scanner.cameraAuth')}
              </p>
            </div>
            <button onClick={handleClose} className="p-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-red-500 rounded-full transition-all">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          {/* SCREEN: PROMPT */}
          {permission === 'prompt' && (
            <div className="p-10 flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-brand/10 rounded-3xl flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              </div>
              <h4 className="text-xl font-black text-zinc-900 dark:text-white mb-2">{t('scanner.promptTitle')}</h4>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8">{t('scanner.promptDesc')}</p>
              <button onClick={triggerScanner} className="w-full bg-brand text-black font-black tracking-widest uppercase py-4 rounded-2xl shadow-lg hover:scale-105 transition-all">{t('scanner.enableBtn')}</button>
            </div>
          )}

          {/* SCREEN: DENIED */}
          {permission === 'denied' && (
            <div className="p-10 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mb-6 border border-red-500/30">
                <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
              </div>
              <h4 className="text-xl font-black text-zinc-900 dark:text-white mb-2 transition-colors">{t('scanner.deniedTitle')}</h4>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8 transition-colors">
                {t('scanner.deniedDesc')}
              </p>
              <button onClick={triggerScanner} className="w-full bg-zinc-800 text-white border border-zinc-700 font-bold tracking-widest uppercase px-6 py-4 rounded-xl hover:bg-zinc-700 transition-all">
                {t('scanner.tryAgainBtn')}
              </button>
            </div>
          )}

          {/* SCREEN: SCANNING */}
          {(permission === 'granted' || permission === 'starting') && (
            <div className="relative w-full aspect-square bg-black overflow-hidden">
              <div id={scannerId} className="absolute inset-0 w-full h-full [&_video]:object-cover! [&_video]:w-full! [&_video]:h-full!"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-64 h-64 border-2 border-dashed border-brand/50 rounded-3xl pointer-events-none">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand rounded-tl-xl"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand rounded-tr-xl"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand rounded-bl-xl"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand rounded-br-xl"></div>
                <div className="absolute left-0 right-0 h-0.5 bg-brand shadow-[0_0_15px_brand] z-10" style={{ animation: 'scan-laser 2.5s ease-in-out infinite' }}></div>
              </div>
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="p-6 border-t border-zinc-100 dark:border-white/5 bg-white dark:bg-zinc-900 transition-colors">
            <div className="mb-4">
              <div className="text-[10px] text-brand font-black tracking-[0.25em] uppercase mb-2">
                {t('scanner.demoLabel')}
              </div>
              <p className="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed">
                {t('scanner.demoDesc')}
              </p>
            </div>
            <label htmlFor="manual-qris-payload" className="block text-[10px] text-zinc-500 dark:text-zinc-500 font-black tracking-[0.2em] uppercase mb-2">
              {t('scanner.manualLabel')}
            </label>
            <textarea
              id="manual-qris-payload"
              value={manualPayload}
              onChange={(event) => setManualPayload(event.target.value)}
              rows={4}
              placeholder={t('scanner.manualPlaceholder')}
              className="w-full resize-none rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950 p-4 text-xs font-mono text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-700 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <button
                type="submit"
                disabled={!manualPayload.trim()}
                className="min-h-12 rounded-2xl bg-zinc-900 dark:bg-zinc-800 text-white font-black uppercase text-xs tracking-widest hover:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-50 transition-all"
              >
                {t('scanner.submitManualBtn')}
              </button>
              <button
                type="button"
                onClick={handleUseDemoQris}
                className="min-h-12 rounded-2xl bg-brand text-black font-black uppercase text-xs tracking-widest shadow-lg hover:scale-105 transition-all"
              >
                {t('scanner.demoBtn')}
              </button>
            </div>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-600 leading-relaxed mt-4">
              {t('scanner.demoDisclaimer')}
            </p>
          </form>

          {scanResult && !scanResult.parsedData.isValid && (
            <div className="px-6 py-4 bg-red-500/10 border-t border-red-500/20">
              <div className="text-red-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">
                {t('scanner.errorReady')}
              </div>
              <p className="text-red-300 text-xs leading-relaxed">
                {scanResult.parsedData.errors.join(' ')}
              </p>
            </div>
          )}

          <div className="p-6 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-white/5 flex justify-center transition-colors">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand animate-pulse"></span>
              <span className="text-[10px] text-zinc-500 dark:text-brand font-black tracking-[0.2em] uppercase transition-colors">{t('scanner.footer')}</span>
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
}
