const MAINNET_WALLET_WARNING = "Looks like you've connected a mainnet wallet. KonekPay demo runs on Devnet. Please switch to Devnet to avoid real-money loss or unexpected errors.";

const getRpcClusterHint = (rpcEndpoint) => {
  const endpoint = String(rpcEndpoint || '').toLowerCase();

  if (endpoint.includes('mainnet')) return 'mainnet';
  if (endpoint.includes('testnet')) return 'testnet';
  if (endpoint.includes('devnet')) return 'devnet';

  return 'unknown';
};

export default function DevnetSafetyNotice({ t, rpcEndpoint, className = '' }) {
  const clusterHint = getRpcClusterHint(rpcEndpoint);
  const isMainnetHint = clusterHint === 'mainnet';
  const isNonDevnetHint = isMainnetHint || clusterHint === 'testnet';
  const title = isMainnetHint ? t('devnet.paymentWarningTitle') : t('devnet.paymentSafetyTitle');
  const body = isMainnetHint
    ? (t('devnet.paymentMainnetWarning') || MAINNET_WALLET_WARNING)
    : isNonDevnetHint
      ? t('devnet.paymentNonDevnetWarning')
      : t('devnet.paymentSafetyNotice');

  return (
    <div
      className={`kp-devnet-banner border p-3 sm:p-4 ${className}`}
      role={isNonDevnetHint ? 'alert' : 'status'}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--kp-amber)' }}></span>
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--kp-amber)' }}>
            {title}
          </p>
          <p className="mt-1 text-xs leading-5 sm:text-sm sm:leading-6" style={{ color: 'var(--kp-amber-text)' }}>
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
