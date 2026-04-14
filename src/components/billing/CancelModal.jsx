// components/billing/CancelModal.jsx — Anamoria SPA
// v1.0 — B6 Cancel Subscription modal (April 14, 2026)
//
// Two-step flow per Billing Flow v1.1 §3.2:
//   Step 1: Offer pause alternatives (quick-select 1/2/3 months)
//   Step 2: Cancel confirmation with period end date
//
// Props:
//   isOpen      — boolean
//   onClose     — function
//   billing     — billing object (needs currentPeriodEnd)
//   getApi      — function returning API client
//   onSuccess   — function called after cancel completes (triggers refetch)
//   onOpenPause — function(months) to open PauseModal with preselected duration

import { useState, useEffect, useCallback } from 'react';
import styles from './CancelModal.module.css';

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

export default function CancelModal({ isOpen, onClose, billing, getApi, onSuccess, onOpenPause }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  // Close on Escape (unless submitting)
  useEffect(() => {
    if (!isOpen || submitting) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  const handleBackdropClick = useCallback((e) => {
    if (submitting) return;
    if (e.target === e.currentTarget) onClose();
  }, [submitting, onClose]);

  // Step 1: User chooses a pause option → open PauseModal
  function handlePauseSelect(months) {
    onClose();
    onOpenPause(months);
  }

  // Step 2: User confirms cancellation
  async function handleCancel() {
    setSubmitting(true);
    setError(null);
    try {
      const api = getApi();
      await api.delete('/billing/subscription');
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err.message || err.error || 'Could not cancel subscription. Please try again.';
      setError(msg);
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Cancel subscription">

        {step === 1 && (
          <>
            {/* Step 1 — Pause offered first */}
            <h2 className={styles.heading}>Taking a break?</h2>

            <p className={styles.body}>
              Your memories will be here when you come back. If you just need some time away, you can pause your billing instead of cancelling.
            </p>

            {/* Pause quick-select buttons */}
            <div className={styles.pauseOptions}>
              <button className={styles.pauseBtn} onClick={() => handlePauseSelect(1)}>
                Pause for 1 month
              </button>
              <button className={styles.pauseBtn} onClick={() => handlePauseSelect(2)}>
                Pause for 2 months
              </button>
              <button className={styles.pauseBtn} onClick={() => handlePauseSelect(3)}>
                Pause for 3 months
              </button>
            </div>

            {/* Cancel instead link */}
            <button
              className={styles.cancelInsteadLink}
              onClick={() => setStep(2)}
            >
              Or if you'd prefer to cancel instead →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            {/* Step 2 — Cancellation confirmation */}
            <h2 className={styles.heading}>Cancel your Premium subscription</h2>

            <p className={styles.body}>
              Your Premium access will continue until {formatDate(billing?.currentPeriodEnd)}.
              After that, your account returns to the free plan. Your memories are never deleted
              — you'll always be able to access everything you've already saved.
            </p>

            <p className={styles.refundNote}>
              Charged in the last 7 days? Contact support for a prorated refund.
            </p>

            {/* Error */}
            {error && (
              <div className={styles.error}>{error}</div>
            )}

            {/* Actions */}
            <div className={styles.actions}>
              <button
                className={styles.keepBtn}
                onClick={onClose}
                disabled={submitting}
              >
                Keep my plan
              </button>
              <button
                className={styles.confirmCancelBtn}
                onClick={handleCancel}
                disabled={submitting}
              >
                {submitting ? 'Cancelling…' : 'Cancel at end of period'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
