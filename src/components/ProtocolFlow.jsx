import { useState, useEffect } from 'react';
import {
  RiHome5Line,
  RiWallet3Line,
  RiQrScan2Line,
  RiCheckboxCircleLine,
  RiShieldCheckLine,
} from '@remixicon/react';

const STEP_COUNT = 5;
const CYCLE_INTERVAL_MS = 7000;

const stepIcons = [
  RiHome5Line,
  RiWallet3Line,
  RiQrScan2Line,
  RiCheckboxCircleLine,
  RiShieldCheckLine,
];

/* ---- CSS wireframe illustrations per step ---- */

const IllustrationOpen = () => (
  <div className="pf-illust" aria-hidden="true">
    <div className="pf-illust-window">
      <div className="pf-illust-window-bar">
        <span /><span /><span />
      </div>
      <div className="pf-illust-window-body">
        <div className="pf-illust-line w-3/4" />
        <div className="pf-illust-line w-1/2" />
      </div>
    </div>
  </div>
);

const IllustrationConnect = () => (
  <div className="pf-illust" aria-hidden="true">
    <div className="pf-illust-card">
      <div className="pf-illust-card-chip" />
      <div className="pf-illust-line w-2/3 mt-3" />
      <div className="pf-illust-line w-1/3 mt-1" />
    </div>
  </div>
);

const IllustrationScan = () => (
  <div className="pf-illust" aria-hidden="true">
    <div className="pf-illust-qr">
      <span className="pf-qr-corner tl" />
      <span className="pf-qr-corner tr" />
      <span className="pf-qr-corner bl" />
      <span className="pf-qr-corner br" />
      <div className="pf-qr-inner">
        <div className="pf-qr-block" />
        <div className="pf-qr-block" />
        <div className="pf-qr-block sm" />
        <div className="pf-qr-block" />
        <div className="pf-qr-block sm" />
        <div className="pf-qr-block" />
      </div>
    </div>
  </div>
);

const IllustrationAccept = () => (
  <div className="pf-illust" aria-hidden="true">
    <div className="pf-illust-panel">
      <div className="pf-illust-line w-full" />
      <div className="pf-illust-line w-2/3 mt-2" />
      <div className="pf-illust-btn mt-3" />
    </div>
  </div>
);

const IllustrationProof = () => (
  <div className="pf-illust" aria-hidden="true">
    <div className="pf-illust-receipt">
      <div className="pf-illust-line w-3/4" />
      <div className="pf-illust-line w-1/2 mt-1" />
      <div className="pf-illust-check mt-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    </div>
  </div>
);

const illustrations = [
  IllustrationOpen,
  IllustrationConnect,
  IllustrationScan,
  IllustrationAccept,
  IllustrationProof,
];

const ProtocolFlow = ({ t }) => {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return undefined;

    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEP_COUNT);
    }, CYCLE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="pf-root" role="list" aria-label={t('flow.ariaLabel')}>
      {/* center spine */}
      <div className="pf-spine" aria-hidden="true" />

      {Array.from({ length: STEP_COUNT }, (_, i) => {
        const isActive = i === activeStep;
        const side = i % 2 === 0 ? 'right' : 'left';
        const StepIcon = stepIcons[i];
        const Illust = illustrations[i];
        const num = String(i + 1).padStart(2, '0');

        return (
          <div
            key={i}
            className={`pf-step pf-step--${side}${isActive ? ' pf-step--active' : ''}`}
            role="listitem"
            aria-current={isActive ? 'step' : undefined}
          >
            {/* marker on spine */}
            <div className={`pf-marker${isActive ? ' pf-marker--active' : ''}`} aria-hidden="true" />

            {/* connector elbow from spine to card */}
            <div className="pf-elbow" aria-hidden="true" />

            {/* card */}
            <div className={`pf-card${isActive ? ' pf-card--active' : ''}`}>
              {/* number badge */}
              <div className="pf-num">{num}</div>

              {/* title */}
              <h3 className="pf-title">{t(`flow.step${i + 1}Title`)}</h3>

              {/* helper */}
              <p className="pf-helper">{t(`flow.step${i + 1}Helper`)}</p>

              {/* illustration */}
              <div className="pf-illust-zone">
                <Illust />
              </div>

              {/* bottom mini label */}
              <div className="pf-label-strip">
                <StepIcon className="pf-label-icon" aria-hidden="true" />
                <span className="pf-label-text">{t(`flow.step${i + 1}Label`)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProtocolFlow;
