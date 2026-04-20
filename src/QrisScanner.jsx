import { Fragment, useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// Tambahan properti "onResult" untuk ngirim data ke App.jsx
export default function QrisScanner({ onClose, onResult }) {
  const [permission, setPermission] = useState('prompt'); 
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

  // ============================================================
  // 🚨 AREA BACKEND DEV: LOGIKA TANGKAP QRIS 🚨
  // ============================================================
  // Ini fungsi saat kamera sukses baca QR.
  // decodedText adalah string mentah dari QRIS (biasanya format EMVCo).
  
  const processPayment = useCallback((decodedText) => {
    console.log("QR Captured (Memulai Proses Backend):", decodedText);
    
    // SECURITY: Validasi DINI format QRIS murni
    const isValidQris = decodedText.startsWith("000201") && decodedText.includes("6304");
    if (!isValidQris) {
      alert("Invalid QR Code (Not QRIS)");
      return;
    }
    
    // Tapi kalau aman, lempar datanya ke App.jsx biar dia buka Halaman Pembayaran.
    if (onResult) {
      onResult(decodedText); 
    }
  }, [onResult]);
  // ============================================================

  const triggerScanner = () => {
    setPermission('starting');
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
              // Panggil fungsi proses di atas saat QR ketangkap
              processPayment(decodedText);
              stopCamera(); 
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
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-brand/30 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl relative flex flex-col transition-colors duration-500">
          
          <div className="flex justify-between items-center p-6 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900">
            <div>
              <h3 className="text-xl font-black text-zinc-900 dark:text-white tracking-widest transition-colors">SCAN <span className="text-brand">QRIS</span></h3>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold tracking-widest uppercase mt-1">
                {permission === 'granted' ? 'Point camera at QR Code' : 'Camera Authorization'}
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
              <h4 className="text-xl font-black text-zinc-900 dark:text-white mb-2">Camera Access</h4>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8">Ready to pay? Grant camera access to scan the QRIS code.</p>
              <button onClick={triggerScanner} className="w-full bg-brand text-black font-black tracking-widest uppercase py-4 rounded-2xl shadow-lg hover:scale-105 transition-all">Enable Camera</button>
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
              <h4 className="text-xl font-black text-zinc-900 dark:text-white mb-2 transition-colors">Access Denied</h4>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8 transition-colors">
                Please enable camera access in your browser settings to continue.
              </p>
              <button onClick={triggerScanner} className="w-full bg-zinc-800 text-white border border-zinc-700 font-bold tracking-widest uppercase px-6 py-4 rounded-xl hover:bg-zinc-700 transition-all">
                Try Again
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

          <div className="p-6 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-white/5 flex justify-center transition-colors">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand animate-pulse"></span>
              <span className="text-[10px] text-zinc-500 dark:text-brand font-black tracking-[0.2em] uppercase transition-colors">KonekPay Secure Engine</span>
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
}
