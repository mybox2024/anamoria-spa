// components/billing/SoftGateModal.jsx — Anamoria SPA
// v1.0 — B7 Soft Gate / Upgrade CTA modal (April 14, 2026)
//
// Shown on SpacePage when a free user hits a plan limit:
//   - Memory limit (15 owner memories per space)
//   - Space limit (1 space)
// Two copy variants driven by `previouslySubscribed` from billing API.
//
// Props:
//   isOpen           — boolean, controls visibility
//   onClose          — function, close modal
//   resource         — 'memories' | 'spaces', which limit was hit
//   billing          — billing object from useBillingStatus (needs limits + previouslySubscribed)
//   spaceId          — current space ID (for ?from= param on upgrade link)

import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './SoftGateModal.module.css';

export default function SoftGateModal({ isOpen, onClose, resource, billing, spaceId }) {
  const navigate = useNavigate();

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleUpgrade = useCallback(() => {
    const fromParam = spaceId ? `?from=${spaceId}` : '';
    navigate(`/settings/upgrade${fromParam}`);
    onClose();
  }, [navigate, spaceId, onClose]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const returning = billing?.previouslySubscribed === true;
  const limitLabel = resource === 'memories' ? 'memories' : 'spaces';
  const limitValue = resource === 'memories'
    ? billing?.limits?.memoriesPerSpace
    : billing?.limits?.spaces;

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Upgrade your plan">

        {/* Icon */}
        <div className={styles.iconWrap}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {resource === 'memories' ? (
              <>
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </>
            ) : (
              <>
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </>
            )}
          </svg>
        </div>

        {/* Heading */}
        <h2 className={styles.heading}>
          {returning
            ? `You've reached your ${limitLabel} limit`
            : `You've used your ${limitValue} free ${limitLabel}`
          }
        </h2>

        {/* Body — copy variant */}
        <p className={styles.body}>
          {returning
            ? `Your existing memories are always here — they're never removed. To add more, upgrade to Premium.`
            : resource === 'memories'
              ? `Your free plan includes ${limitValue} memories per space. Upgrade to Premium for unlimited memories.`
              : `Your free plan includes ${limitValue} space. Upgrade to Premium to create more spaces for the people you love.`
          }
        </p>

        {/* Upgrade CTA */}
        <button className={styles.upgradeBtn} onClick={handleUpgrade}>
          Upgrade to Premium
        </button>

        {/* Dismiss */}
        <button className={styles.dismissBtn} onClick={onClose}>
          Not right now
        </button>

      </div>
    </div>
  );
}
