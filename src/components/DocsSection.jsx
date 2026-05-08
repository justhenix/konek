const FLOW_STEPS = [
  'scanQris',
  'parseData',
  'getQuote',
  'payPhantom',
  'backendVerify',
  'receiptHistory',
  'settlementSim',
];

const REAL_ITEMS = [
  'qrisParsing',
  'solIdrQuote',
  'phantomPayment',
  'solanaDevnetTx',
  'backendVerification',
  'receiptGeneration',
  'walletHistory',
];

const SIMULATED_ITEMS = [
  'idrSettlement',
  'qrisProvider',
  'offRamp',
  'compliance',
];

const ARCH_NODES = [
  { key: 'frontend', accent: 'green' },
  { key: 'qrisParser', accent: 'green' },
  { key: 'quoteApi', accent: 'green' },
  { key: 'phantom', accent: 'purple' },
  { key: 'solanaDevnet', accent: 'purple' },
  { key: 'verifyApi', accent: 'green' },
  { key: 'supabase', accent: 'green' },
  { key: 'receiptUi', accent: 'green' },
];

const PRODUCTION_ITEMS = [
  'licensedPartner',
  'settlementPartner',
  'reconciliation',
  'compliance',
  'monitoring',
];

const CheckIcon = () => (
  <svg className="kp-docs-icon kp-docs-icon--green" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SimIcon = () => (
  <svg className="kp-docs-icon kp-docs-icon--amber" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2.5" />
  </svg>
);

const StepNumber = ({ n }) => (
  <span className="kp-docs-step-num">{n}</span>
);

const DocsSection = ({ t, onBackToHome }) => (
  <main id="docs" className="kp-page-content pt-24 pb-12 md:pt-28 lg:pb-16" style={{ backgroundColor: 'var(--kp-bg-soft)' }}>
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      
      {/* Back button */}
      <button
        onClick={onBackToHome}
        className="mb-8 inline-flex items-center gap-2 text-sm transition-colors hover:text-white"
        style={{ color: 'var(--kp-text-muted)' }}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {t('docs.backToHome')}
      </button>

      {/* Header */}
      <div className="mb-12 max-w-3xl">
        <p className="mb-3 text-[11px] uppercase tracking-[0.2em]" style={{ color: 'var(--kp-brand)' }}>
          {t('docs.eyebrow')}
        </p>
        <h2 className="text-3xl leading-[1.08] sm:text-4xl lg:text-5xl" style={{ color: 'var(--kp-text)' }}>
          {t('docs.heading')}
        </h2>
        <p className="mt-5 text-base leading-8 md:text-lg" style={{ color: 'var(--kp-text-muted)' }}>
          {t('docs.intro')}
        </p>
      </div>

      {/* Section 1: What is KonekPay */}
      <div className="kp-docs-card mb-6">
        <h3 className="kp-docs-card-title">{t('docs.whatTitle')}</h3>
        <p className="kp-docs-card-body">{t('docs.whatBody1')}</p>
        <p className="kp-docs-card-body mt-3">{t('docs.whatBody2')}</p>
        <div className="kp-docs-callout kp-docs-callout--amber mt-4">
          <p>{t('docs.whatDisclaimer')}</p>
        </div>
      </div>

      {/* Section 2: How it works */}
      <div className="kp-docs-card mb-6">
        <h3 className="kp-docs-card-title">{t('docs.howTitle')}</h3>
        <p className="kp-docs-card-body mb-5">{t('docs.howIntro')}</p>
        <ol className="kp-docs-flow-list">
          {FLOW_STEPS.map((key, i) => (
            <li key={key} className="kp-docs-flow-item">
              <StepNumber n={i + 1} />
              <span className="kp-docs-flow-text">{t(`docs.flow_${key}`)}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Section 3: Static vs Dynamic */}
      <div className="kp-docs-card mb-6">
        <h3 className="kp-docs-card-title">{t('docs.qrisTitle')}</h3>
        <div className="kp-docs-grid-2 mt-4">
          <div className="kp-docs-sub-card">
            <p className="kp-docs-sub-label">{t('docs.staticLabel')}</p>
            <p className="kp-docs-card-body">{t('docs.staticBody')}</p>
          </div>
          <div className="kp-docs-sub-card">
            <p className="kp-docs-sub-label">{t('docs.dynamicLabel')}</p>
            <p className="kp-docs-card-body">{t('docs.dynamicBody')}</p>
          </div>
        </div>
        <div className="kp-docs-callout kp-docs-callout--green mt-4">
          <p>{t('docs.qrisBothSupported')}</p>
        </div>
      </div>

      {/* Section 4 + 5: Real vs Simulated - side by side on desktop */}
      <div className="kp-docs-grid-2 mb-6">
        <div className="kp-docs-card">
          <h3 className="kp-docs-card-title">{t('docs.realTitle')}</h3>
          <ul className="kp-docs-check-list mt-3">
            {REAL_ITEMS.map((key) => (
              <li key={key} className="kp-docs-check-item">
                <CheckIcon />
                <span>{t(`docs.real_${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="kp-docs-card">
          <h3 className="kp-docs-card-title">{t('docs.simTitle')}</h3>
          <ul className="kp-docs-check-list mt-3">
            {SIMULATED_ITEMS.map((key) => (
              <li key={key} className="kp-docs-check-item">
                <SimIcon />
                <span>{t(`docs.sim_${key}`)}</span>
              </li>
            ))}
          </ul>
          <div className="kp-docs-callout kp-docs-callout--amber mt-4">
            <p>{t('docs.simNote')}</p>
          </div>
        </div>
      </div>

      {/* Section 6: Architecture */}
      <div className="kp-docs-card mb-6">
        <h3 className="kp-docs-card-title">{t('docs.archTitle')}</h3>
        <p className="kp-docs-card-body mb-5">{t('docs.archIntro')}</p>
        <div className="kp-docs-arch-grid">
          {ARCH_NODES.map((node, i) => (
            <div
              key={node.key}
              className={`kp-docs-arch-node kp-docs-arch-node--${node.accent}`}
            >
              <span className="kp-docs-arch-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="kp-docs-arch-label">{t(`docs.arch_${node.key}`)}</span>
              <span className="kp-docs-arch-desc">{t(`docs.archDesc_${node.key}`)}</span>
            </div>
          ))}
        </div>
        {/* Flow direction hint */}
        <p className="mt-4 text-center text-xs" style={{ color: 'var(--kp-text-faint)' }}>
          {t('docs.archFlowHint')}
        </p>
      </div>

      {/* Section 7: Security / Verification */}
      <div className="kp-docs-card mb-6">
        <h3 className="kp-docs-card-title">{t('docs.securityTitle')}</h3>
        <ul className="kp-docs-bullet-list mt-3">
          <li>{t('docs.security1')}</li>
          <li>{t('docs.security2')}</li>
          <li>{t('docs.security3')}</li>
          <li>{t('docs.security4')}</li>
        </ul>
      </div>

      {/* Section 8: Production Requirements */}
      <div className="kp-docs-card">
        <h3 className="kp-docs-card-title">{t('docs.prodTitle')}</h3>
        <p className="kp-docs-card-body mb-4">{t('docs.prodIntro')}</p>
        <ul className="kp-docs-check-list">
          {PRODUCTION_ITEMS.map((key) => (
            <li key={key} className="kp-docs-check-item">
              <SimIcon />
              <span>{t(`docs.prod_${key}`)}</span>
            </li>
          ))}
        </ul>
        <div className="kp-docs-callout kp-docs-callout--amber mt-4">
          <p>{t('docs.prodNote')}</p>
        </div>
      </div>

    </div>
  </main>
);

export default DocsSection;
