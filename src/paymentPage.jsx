import { Fragment, useState, useEffect } from 'react';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

export default function PaymentPage({ qrisData, onConfirm, onCancel }) {
  // State untuk ngatur efek loading pas lagi proses transaksi di Blockchain
  const [isProcessing, setIsProcessing] = useState(false);

  // ============================================================
  // BACKEND INTEGRATION: SERVER-SIDE QUOTE
  // ============================================================
  // All price computation is done server-side via POST /api/v1/payment/quote.
  // Server extracts fiatAmount from QRIS Tag 54. Client sends ONLY the payload.

  const merchantName = "WARUNG SOLANA JAYA"; // TODO: Parse from QRIS EMVCo TLV (Tag 59)

  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchQuote = async () => {
      setQuoteLoading(true);
      setQuoteError(null);

      try {
        const res = await fetch('/api/v1/payment/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qrisPayload: qrisData,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || `Server error ${res.status}`);
        }

        if (!cancelled) {
          setQuote(data);
        }
      } catch (err) {
        if (!cancelled) {
          setQuoteError(err.message || 'Failed to fetch quote');
        }
      } finally {
        if (!cancelled) {
          setQuoteLoading(false);
        }
      }
    };

    fetchQuote();
    return () => { cancelled = true; };
  }, [qrisData]);
  // ============================================================


  // Fungsi saat tombol Confirm diklik
  const handleConfirm = async () => {
    // Reject if quote expired
    if (quote && new Date(quote.expiresAt) < new Date()) {
      setQuoteError('Quote expired. Please go back and try again.');
      return;
    }

    setIsProcessing(true);
    
    try {
      // ============================================================
      // 🚨 AREA BACKEND DEV: EKSEKUSI SMART CONTRACT 🚨
      // ============================================================
      if (!quote) {
        throw new Error('Quote is not available.');
      }

      const provider = window?.solana;

      if (!provider?.isPhantom) {
        throw new Error('Phantom Wallet is not installed.');
      }

      if (!provider.publicKey) {
        await provider.connect();
      }

      const payerPublicKey = provider.publicKey;
      const targetWalletAddress =
        quote.targetWalletAddress ||
        quote.merchantWalletAddress ||
        quote.destinationWalletAddress ||
        import.meta.env.VITE_MERCHANT_WALLET_ADDRESS;

      if (!targetWalletAddress) {
        throw new Error('Merchant wallet address is not configured.');
      }

      const recipientPublicKey = new PublicKey(targetWalletAddress);
      const lamports = Math.round(Number(quote.solAmount) * LAMPORTS_PER_SOL);

      if (!Number.isSafeInteger(lamports) || lamports <= 0) {
        throw new Error('Invalid SOL amount.');
      }

      const connection = new Connection(clusterApiUrl('devnet'));
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payerPublicKey,
          toPubkey: recipientPublicKey,
          lamports,
        })
      );
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payerPublicKey;

      const { signature } = await provider.signAndSendTransaction(transaction);

      await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      );

      await onConfirm({ ...quote, signature });
      // ============================================================

    } catch (error) {
      console.error("User reject transaksi atau ada error:", error);
      setQuoteError(error.message || 'Transaction failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Fragment>
      <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/90 backdrop-blur-lg p-4 transition-all animate-fade-in">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-brand/30 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl flex flex-col transition-colors duration-500">
          
          {/* HEADER */}
          <div className="p-8 text-center border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900 transition-colors">
            <div className="text-brand text-[10px] font-black tracking-[0.4em] uppercase mb-2">Payment Review</div>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter transition-colors">Confirm Payment</h3>
          </div>
          
          {/* DETAIL TRANSAKSI */}
          <div className="p-8 space-y-6">

            {/* Loading State */}
            {quoteLoading && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <div className="w-8 h-8 border-3 border-brand/20 border-t-brand rounded-full animate-spin"></div>
                <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Fetching secure quote...</span>
              </div>
            )}

            {/* Error State */}
            {quoteError && !quoteLoading && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
                <div className="text-red-400 text-xs font-bold uppercase tracking-widest mb-2">Quote Error</div>
                <p className="text-red-300 text-sm">{quoteError}</p>
                <button
                  onClick={onCancel}
                  className="mt-4 px-6 py-2 bg-zinc-800 text-white text-xs font-bold uppercase rounded-xl hover:bg-zinc-700 transition-colors"
                >
                  Go Back
                </button>
              </div>
            )}

            {/* Quote Data */}
            {quote && !quoteLoading && !quoteError && (
              <>
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
                      <div className="text-2xl font-black text-brand">~ {quote.solAmount} SOL</div>
                      <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Rp {quote.fiatAmount.toLocaleString('id-ID')}</div>
                    </div>
                  </div>
                </div>

                {/* Quote Metadata */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px] text-zinc-500 dark:text-zinc-600 font-bold uppercase tracking-widest">
                    <span>Rate</span>
                    <span>1 SOL = Rp {Number(quote.exchangeRate).toLocaleString('id-ID')}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-zinc-500 dark:text-zinc-600 font-bold uppercase tracking-widest">
                    <span>Quote ID</span>
                    <span className="font-mono text-brand/60">{quote.quoteId.slice(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-zinc-500 dark:text-zinc-600 font-bold uppercase tracking-widest">
                    <span>Expires</span>
                    <span>{new Date(quote.expiresAt).toLocaleTimeString('id-ID')}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ACTION BUTTONS */}
          {quote && !quoteLoading && !quoteError && (
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
                className="py-4 rounded-2xl bg-brand text-black font-black uppercase text-xs shadow-[0_0_20px_rgba(4,250,58,0.3)] hover:shadow-[0_0_30px_rgba(4,250,58,0.5)] hover:scale-105 disabled:opacity-70 disabled:hover:scale-100 transition-all flex justify-center items-center gap-2"
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
          )}

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

