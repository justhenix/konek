import { Fragment, useEffect, useState } from 'react';
import { parseEmvcoQris } from './utils/parseEmvcoQris';

const getParsedPayment = (qrisData, initialParsedData) => {
  if (initialParsedData?.rawData === qrisData) {
    return initialParsedData;
  }

  return parseEmvcoQris(qrisData);
};

export default function PaymentPage({
  qrisData,
  initialParsedData,
  onParsedData,
  onConfirm,
  onCancel,
}) {
  const [parsedPayment] = useState(() => (
    getParsedPayment(qrisData, initialParsedData)
  ));

  useEffect(() => {
    onParsedData?.(parsedPayment);
  }, [onParsedData, parsedPayment]);

  const merchantName = parsedPayment.merchantName || 'Unknown Merchant';
  const amountLabel = Number.isFinite(parsedPayment.amount)
    ? `Rp ${parsedPayment.formattedAmount}`
    : 'Not provided';
  const currencyLabel = parsedPayment.currencyCode === '360'
    ? 'IDR'
    : parsedPayment.currencyCode || 'Not provided';

  const handleConfirm = () => {
    if (!parsedPayment.isValid) {
      return;
    }

    onConfirm?.({
      rawData: parsedPayment.rawData,
      merchantName: parsedPayment.merchantName,
      amount: parsedPayment.amount,
      amountText: parsedPayment.amountText,
      currencyCode: parsedPayment.currencyCode,
      tags: parsedPayment.tags,
    });
  };

  return (
    <Fragment>
      <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/90 backdrop-blur-lg p-4 transition-all animate-fade-in">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-brand/30 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl flex flex-col transition-colors duration-500">
          
          <div className="p-8 text-center border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900 transition-colors">
            <div className="text-brand text-[10px] font-black tracking-[0.4em] uppercase mb-2">QRIS Parsed Data</div>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter transition-colors">Review Payment</h3>
          </div>
          
          <div className="p-8 space-y-6">
            {!parsedPayment.isValid && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5">
                <div className="text-red-400 text-xs font-bold uppercase tracking-widest mb-2">Parser Error</div>
                <div className="space-y-1">
                  {parsedPayment.errors.map((error) => (
                    <p key={error} className="text-red-300 text-sm">{error}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex justify-between items-start gap-4">
                <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest transition-colors">Merchant</span>
                <span className="text-zinc-900 dark:text-white font-black text-right max-w-[62%] wrap-break-word transition-colors" title={merchantName}>
                  {merchantName}
                </span>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-3xl p-6 border border-zinc-100 dark:border-white/5 transition-colors">
                <div className="flex justify-between items-center gap-4">
                  <span className="text-zinc-900 dark:text-white font-black uppercase text-xs tracking-widest transition-colors">Total Pay</span>
                  <div className="text-right">
                    <div className="text-3xl font-black text-brand">{amountLabel}</div>
                    <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">{currencyLabel}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-100 dark:border-white/5 overflow-hidden">
                <div className="flex justify-between items-start gap-4 p-4 bg-white dark:bg-zinc-900 transition-colors">
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-600 font-bold uppercase tracking-widest">Tag 54</span>
                  <span className="text-sm text-zinc-900 dark:text-white font-bold text-right break-all">{parsedPayment.tags['54'] || 'Missing'}</span>
                </div>
                <div className="flex justify-between items-start gap-4 p-4 bg-zinc-50 dark:bg-zinc-950 transition-colors">
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-600 font-bold uppercase tracking-widest">Tag 59</span>
                  <span className="text-sm text-zinc-900 dark:text-white font-bold text-right break-all">{parsedPayment.tags['59'] || 'Missing'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 pt-0 grid grid-cols-2 gap-4">
            <button 
              onClick={onCancel}
              className="py-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold uppercase text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
            >
              Cancel
            </button>
            
            <button 
              onClick={handleConfirm}
              disabled={!parsedPayment.isValid}
              className="py-4 rounded-2xl bg-brand text-black font-black uppercase text-xs shadow-[0_0_20px_rgba(4,250,58,0.3)] hover:shadow-[0_0_30px_rgba(4,250,58,0.5)] hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 transition-all flex justify-center items-center"
            >
              Confirm
            </button>
          </div>

          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 text-center border-t border-zinc-100 dark:border-white/5 transition-colors">
            <div className="text-[9px] text-zinc-400 dark:text-zinc-600 font-bold tracking-[0.2em] uppercase transition-colors">
              Parsed locally from EMVCo QRIS TLV
            </div>
          </div>
          
        </div>
      </div>
    </Fragment>
  );
}
