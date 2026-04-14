// components/billing/SwitchPlanModal.jsx — Anamoria SPA
// v1.0 — Switch Plan modal with proration preview (April 14, 2026)
//
// Flow:
//   1. Modal opens → GET /billing/subscription/preview?newPriceId={target}
//   2. Display proration amount + new billing period
//   3. User confirms → PUT /billing/subscription with { newPriceId }
//   4. On success: close modal, refetch billing
//
// Props:
//   isOpen    — boolean
//   onClose   — function
//   billing   — billing object (needs billingPeriod)
//   getApi    — function returning API client
//   onSuccess — function called after switch completes (triggers refetch)

import { useState, useEffect, useCallback } from 'react';
import config from '../../config';
import styles from './SwitchPlanModal.module.css';

function formatAmount(cents) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

export default function SwitchPlanModal({ isOpen, onClose, billing, getApi, onSuccess }) {
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Determine target price based on current billing period
  const currentPeriod = billing?.billingPeriod;
  const targetPeriod = currentPeriod === 'monthly' ? 'annual' : 'monthly';
  const targetPriceId = targetPeriod === 'annual'
    ? config.stripePriceAnnual
    : config.stripePriceMonthly;
  const targetLabel = targetPeriod === 'annual' ? 'Premium Annual' : 'Premium Monthly';

  // Load proration preview when modal opens
  useEffect(() => {
    if (!isOpen || !targetPriceId) return;
    setLoadingPreview(true);
    setError(null);
    setPreview(null);

    async function loadPreview() {
      try {
        const api = getApi();
        const data = await api.get(`/billing/subscription/preview?newPriceId=${targetPriceId}`);
        setPreview(data);
      } catch (err) {
        const msg = err.message || err.error || 'Could not load plan preview.';
        setError(msg);
      } finally {
        setLoadingPreview(false);
      }
    }
    loadPreview();
  }, [isOpen, targetPriceId, getApi]);

  // Reset on close
  useEffect(() => {
    if (isOpen) {
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  // Close on Escape
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

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const api = getApi();
      await api.put('/billing/subscription', { newPriceId: targetPriceId });
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err.message || err.error || 'Could not switch plan. Please try again.';
      setError(msg);
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Switch plan">

        <h2 className={styles.heading}>Switch to {targetLabel}</h2>

        {/* Loading state */}
        {loadingPreview && (
          <p className={styles.loading}>Loading plan details…</p>
        )}

        {/* Preview loaded */}
        {preview && !loadingPreview && (
          <>
            <div className={styles.previewCard}>
              {preview.immediateCharge != null && preview.immediateCharge > 0 && (
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Charged today</span>
                  <span className={styles.previewValue}>{formatAmount(preview.immediateCharge)}</span>
                </div>
              )}
              {preview.creditApplied != null && preview.creditApplied > 0 && (
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Credit from current plan</span>
                  <span className={styles.previewValue}>−{formatAmount(preview.creditApplied)}</span>
                </div>
              )}
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>New billing period</span>
                <span className={styles.previewValue}>
                  {targetPeriod === 'annual' ? 'Annual' : 'Monthly'}
                </span>
              </div>
              {preview.nextRenewalDate && (
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Next renewal</span>
                  <span className={styles.previewValue}>{formatDate(preview.nextRenewalDate)}</span>
                </div>
              )}
            </div>

            {targetPeriod === 'annual' && (
              <p className={styles.savingsNote}>
                Annual billing saves you ~23% compared to monthly.
              </p>
            )}
          </>
        )}

        {/* Error */}
        {error && (
          <div className={styles.error}>{error}</div>
        )}

        {/* Actions */}
        <button
          className={styles.confirmBtn}
          onClick={handleConfirm}
          disabled={submitting || loadingPreview || !preview}
        >
          {submitting ? 'Switching…' : 'Confirm switch'}
        </button>

        <button
          className={styles.cancelLink}
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </button>

      </div>
    </div>
  );
}
