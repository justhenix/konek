const PHASES = [
  {
    key: 'phase1',
    status: 'built',
    accent: 'green',
    items: ['qrisScanner', 'demoQrisFlow', 'phantomConnection', 'devnetPayment'],
  },
  {
    key: 'phase2',
    status: 'built',
    accent: 'green',
    items: ['staticQris', 'dynamicQris', 'manualIdrAmount', 'lockedAmount'],
  },
  {
    key: 'phase3',
    status: 'built',
    accent: 'green',
    items: ['solIdrQuote', 'devnetVerification', 'compactReceipt', 'explorerLink', 'receiptShare'],
  },
  {
    key: 'phase4',
    status: 'built',
    accent: 'green',
    items: ['walletHistory', 'supabaseHistory', 'localFallback', 'receiptFromHistory'],
  },
  {
    key: 'phase5',
    status: 'demo',
    accent: 'amber',
    items: ['demoSettlement', 'simulatedPayout', 'noRealIdr', 'licensedPartner'],
  },
  {
    key: 'phase6',
    status: 'planned',
    accent: 'purple',
    items: ['licensedQris', 'realSettlement', 'reconciliation', 'compliance', 'mainnetReview'],
  },
];

const STATUS_ACCENT = {
  built: 'green',
  demo: 'amber',
  planned: 'purple',
};

const StatusBadge = ({ status, label }) => {
  const accent = STATUS_ACCENT[status] || 'green';
  return (
    <span className={`kp-roadmap-badge kp-roadmap-badge--${accent}`}>
      {label}
    </span>
  );
};

const PhaseCard = ({ phase, phaseIndex, t }) => {
  const phaseNumber = phaseIndex + 1;
  const statusLabel = t(`roadmap.status_${phase.status}`);

  return (
    <div className={`kp-roadmap-phase kp-roadmap-phase--${phase.accent}`}>
      {/* Timeline connector */}
      <div className="kp-roadmap-connector" aria-hidden="true">
        <div className={`kp-roadmap-dot kp-roadmap-dot--${phase.accent}`} />
        {phaseIndex < PHASES.length - 1 && <div className="kp-roadmap-line" />}
      </div>

      {/* Card content */}
      <div className="kp-roadmap-card">
        <div className="kp-roadmap-card-header">
          <span className={`kp-roadmap-phase-num kp-roadmap-phase-num--${phase.accent}`}>
            {String(phaseNumber).padStart(2, '0')}
          </span>
          <StatusBadge status={phase.status} label={statusLabel} />
        </div>

        <h3 className="kp-roadmap-card-title">
          {t(`roadmap.${phase.key}Title`)}
        </h3>

        <ul className="kp-roadmap-item-list">
          {phase.items.map((item) => (
            <li key={item} className="kp-roadmap-item">
              <span className={`kp-roadmap-item-dot kp-roadmap-item-dot--${phase.accent}`} aria-hidden="true" />
              <span>{t(`roadmap.${phase.key}_${item}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const RoadmapSection = ({ t, onBackToHome }) => (
  <main
    id="roadmap"
    className="kp-page-content pt-24 pb-12 md:pt-28 lg:pb-16"
    style={{ backgroundColor: 'var(--kp-bg-soft)' }}
  >
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back button */}
      <button
        onClick={onBackToHome}
        className="mb-8 inline-flex w-fit items-center gap-2 border border-white/10 px-4 py-2 text-sm text-zinc-400 transition hover:border-white/20 hover:text-white"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {t('appNav.homeTab')}
      </button>

      {/* Header */}
      <div className="mb-12 max-w-3xl">
        <p
          className="mb-3 text-[11px] uppercase tracking-[0.2em]"
          style={{ color: 'var(--kp-brand)' }}
        >
          {t('roadmap.eyebrow')}
        </p>
        <h2
          className="text-3xl leading-[1.08] sm:text-4xl lg:text-5xl"
          style={{ color: 'var(--kp-text)' }}
        >
          {t('roadmap.heading')}
        </h2>
        <p
          className="mt-5 text-base leading-8 md:text-lg"
          style={{ color: 'var(--kp-text-muted)' }}
        >
          {t('roadmap.intro')}
        </p>
      </div>

      {/* Timeline */}
      <div className="kp-roadmap-timeline">
        {PHASES.map((phase, i) => (
          <PhaseCard key={phase.key} phase={phase} phaseIndex={i} t={t} />
        ))}
      </div>

      {/* Disclaimer */}
      <div className="kp-docs-callout kp-docs-callout--amber mt-8">
        <p>{t('roadmap.disclaimer')}</p>
      </div>
    </div>
  </main>
);

export default RoadmapSection;
