import { useEffect, useRef, useState, useCallback } from 'react';
import { animate } from 'animejs';

const STEP_COUNT = 5;

const ProtocolFlow = ({ t }) => {
  const [activeStep, setActiveStep] = useState(-1);
  const sectionRef = useRef(null);
  const railRef = useRef(null);
  const markerRef = useRef(null);
  const cardRefs = useRef([]);
  const markerAnimRef = useRef(null);
  const lastMarkerStep = useRef(-1);
  const prefersReduced = useRef(false);

  const setCardRef = useCallback((el, index) => {
    cardRefs.current[index] = el;
  }, []);

  useEffect(() => {
    prefersReduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const cards = cardRefs.current;
    if (!cards.length) return;

    // Determine the effective reading center, accounting for mobile bottom nav
    const getReadingCenter = () => {
      const vh = window.innerHeight;
      // On mobile (<=767px), bottom nav covers ~64px + safe-area
      const isMobile = window.innerWidth <= 767;
      const bottomNavOffset = isMobile ? 64 : 0;
      // Use ~40% of the usable viewport height as the reading zone anchor
      // This biases slightly upward which matches natural reading position
      const usableHeight = vh - bottomNavOffset;
      return usableHeight * 0.4;
    };

    // Find which card center is closest to reading zone
    const findActiveStep = () => {
      const readingCenter = getReadingCenter();
      let closest = -1;
      let closestDist = Infinity;

      for (let i = 0; i < STEP_COUNT; i++) {
        const card = cards[i];
        if (!card) continue;
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.top + rect.height / 2;
        const dist = Math.abs(cardCenter - readingCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }

      // Only activate if at least partially visible
      if (closest >= 0) {
        const rect = cards[closest].getBoundingClientRect();
        const inView = rect.bottom > 0 && rect.top < window.innerHeight;
        if (!inView) closest = -1;
      }

      return closest;
    };

    let rafId = null;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const step = findActiveStep();
        setActiveStep(step);

        // Animate marker
        if (markerRef.current && railRef.current && step >= 0 && step !== lastMarkerStep.current) {
          lastMarkerStep.current = step;
          const railRect = railRef.current.getBoundingClientRect();
          const cardEl = cards[step];
          if (!cardEl) return;
          const cardRect = cardEl.getBoundingClientRect();
          const cardCenterY = cardRect.top + cardRect.height / 2 - railRect.top;
          const targetTop = Math.max(0, Math.min(railRect.height - 12, cardCenterY - 6));

          markerAnimRef.current?.cancel();
          if (prefersReduced.current) {
            markerRef.current.style.top = `${targetTop}px`;
          } else {
            markerAnimRef.current = animate(markerRef.current, {
              top: `${targetTop}px`,
              duration: 380,
              ease: 'out(3)',
            });
          }
        }
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    // Initial calc
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
      markerAnimRef.current?.cancel();
    };
  }, []);

  return (
    <div className="sf-section" ref={sectionRef}>
      <div className="sf-header-container">
        <p className="sf-eyebrow">{t('flow.ariaLabel')}</p>
        <h2 className="sf-heading">{t('howItWorks.heading')}</h2>
      </div>

      <div className="sf-timeline">
        {/* Center rail */}
        <div className="sf-rail" ref={railRef} aria-hidden="true">
          <div className="sf-rail-line" />
          <div className="sf-rail-marker" ref={markerRef} />
        </div>

        {/* Cards in normal flow */}
        <div className="sf-steps" role="list">
          {Array.from({ length: STEP_COUNT }, (_, i) => {
            const isActive = i === activeStep;
            const side = i % 2 === 0 ? 'sf-step--right' : 'sf-step--left';
            const num = String(i + 1).padStart(2, '0');

            return (
              <div key={i} className="sf-step-row">
                <div
                  className={`sf-step ${side} ${isActive ? 'sf-step--active' : ''}`}
                  ref={(el) => setCardRef(el, i)}
                  role="listitem"
                  aria-current={isActive ? 'step' : undefined}
                >
                  <div className="sf-step-card">
                    <div className="sf-step-header">
                      <span className={`sf-step-num ${isActive ? 'sf-step-num--active' : ''}`}>
                        {num}
                      </span>
                    </div>
                    <h3 className="sf-step-title">{t(`flow.step${i + 1}Title`)}</h3>
                    <p className="sf-step-desc">{t(`flow.step${i + 1}Helper`)}</p>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ProtocolFlow;
