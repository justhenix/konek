const MAINNET_WALLET_WARNING = 'This demo payment uses Solana Devnet. Switch Phantom to Devnet before approving.';

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
      className={`${isNonDevnetHint ? 'kp-devnet-banner p-3 sm:p-4' : 'kp-devnet-subtle px-3 py-2.5'} border ${className}`}
      role={isNonDevnetHint ? 'alert' : 'status'}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={`${isNonDevnetHint ? 'mt-1.5 h-2.5 w-2.5' : 'mt-1.5 h-2 w-2'} shrink-0 rounded-full`} style={{ backgroundColor: isNonDevnetHint ? 'var(--kp-amber)' : 'var(--kp-brand)' }}></span>
        <div className="min-w-0">
          <p className={isNonDevnetHint ? 'text-sm font-bold' : 'text-xs font-semibold'} style={{ color: isNonDevnetHint ? 'var(--kp-amber)' : 'var(--kp-text-muted)' }}>
            {title}
          </p>
          <p className={isNonDevnetHint ? 'mt-1 text-xs leading-5 sm:text-sm sm:leading-6' : 'mt-0.5 text-xs leading-5'} style={{ color: isNonDevnetHint ? 'var(--kp-amber-text)' : 'var(--kp-text-soft)' }}>
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
