import { Fragment, useState } from 'react';

// eslint-disable-next-line no-unused-vars
export default function PaymentPage({ qrisData, solPrice, onConfirm, onCancel }) {
  // State untuk ngatur efek loading pas lagi proses transaksi di Blockchain
  const [isProcessing, setIsProcessing] = useState(false);

  // ============================================================
  // AREA BACKEND DEV: DATA TRANSAKSI 
  // ============================================================
  // 
  // Saat ini variabel di bawah ini masih pakai data DUMMY.
  // 
  // bebas deh wok woekoekwoekwo buat mark tok
  // 1. Parsing isi 'qrisData' (string mentah dari scanner).
  // 2. Ganti nilai 'merchantName' dan 'amountIDR' di bawah ini dengan 
  //    hasil parsing QRIS atau hasil balikan dari API Midtrans/KonekPay kamu.
  
  const merchantName = "WARUNG SOLANA JAYA"; // Ganti pakai nama asli merchant
  const amountIDR = 50000; // Ganti pakai tagihan asli dari QRIS
  
  // Kalkulasi Otomatis (Ini biarin aja, udah otomatis ngitung ke SOL)
  const totalSOL = solPrice ? (amountIDR / solPrice).toFixed(6) : 0;
  // ============================================================


  // Fungsi saat tombol Confirm diklik
  const handleConfirm = async () => {
    setIsProcessing(true);
    
    try {
      // ============================================================
      // 🚨 AREA BACKEND DEV: EKSEKUSI SMART CONTRACT 🚨
      // ============================================================
      // TUGASMU DI SINI:
      // 1. Panggil fungsi buat interaksi sama Phantom Wallet (e.g., window.solana).
      // 2. Bikin Transaction Solana buat ngirim 'totalSOL' ke wallet tujuan.
      // 3. Minta user sign transaction (Sign & Send).
      
      // Catatan: Karena fungsi aslinya ada di App.jsx lewat props 'onConfirm',
      // kamu bisa jalanin fungsi onConfirm() di sini, dan handle logic-nya di App.jsx.
      
      await onConfirm(); 
      // ============================================================

    } catch (error) {
      console.error("User reject transaksi atau ada error:", error);
      // Bisa tambahin toast/alert gagal di sini
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Fragment>
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-lg p-4 transition-all animate-fade-in">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-[#04fa3a]/30 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl flex flex-col transition-colors duration-500">
          
          {/* HEADER */}
          <div className="p-8 text-center border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900 transition-colors">
            <div className="text-[#04fa3a] text-[10px] font-black tracking-[0.4em] uppercase mb-2">Payment Review</div>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter transition-colors">Confirm Payment</h3>
          </div>
          
          {/* DETAIL TRANSAKSI */}
          <div className="p-8 space-y-6">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest transition-colors">To Merchant</span>
              <span className="text-zinc-900 dark:text-white font-black text-right max-w-[60%] truncate transition-colors" title={merchantName}>
                {merchantName}
              </span>
            </div>
            
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-3xl p-6 border border-zinc-100 dark:border-white/5 transition-colors">
              <div className="flex justify-between items-center">
                <span className="text-zinc-900 dark:text-white font-black uppercase text-xs tracking-widest transition-colors">Total Pay</span>
                <div className="text-right">
                  <div className="text-2xl font-black text-[#04fa3a]">~ {totalSOL} SOL</div>
                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Rp {amountIDR.toLocaleString('id-ID')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="p-8 pt-0 grid grid-cols-2 gap-4">
            <button 
              onClick={onCancel} 
              disabled={isProcessing}
              className="py-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold uppercase text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 transition-all"
            >
              Cancel
            </button>
            
            <button 
              onClick={handleConfirm} 
              disabled={isProcessing}
              className="py-4 rounded-2xl bg-[#04fa3a] text-black font-black uppercase text-xs shadow-[0_0_20px_rgba(4,250,58,0.3)] hover:shadow-[0_0_30px_rgba(4,250,58,0.5)] hover:scale-105 disabled:opacity-70 disabled:hover:scale-100 transition-all flex justify-center items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                  <span>Signing...</span>
                </>
              ) : (
                'Confirm'
              )}
            </button>
          </div>

          {/* INFO BACKEND */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 text-center border-t border-zinc-100 dark:border-white/5 transition-colors">
            <div className="text-[9px] text-zinc-400 dark:text-zinc-600 font-bold tracking-[0.2em] uppercase transition-colors">
                Wait for Phantom Wallet Approval
            </div>
          </div>
          
        </div>
      </div>
    </Fragment>
  );
}