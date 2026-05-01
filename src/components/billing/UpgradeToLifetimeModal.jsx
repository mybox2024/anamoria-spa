// components/billing/UpgradeToLifetimeModal.jsx — Anamoria SPA
// v1.0 — Upgrade to Lifetime confirmation modal (April 30, 2026)
//
// Flow:
//   1. Modal opens → GET /billing/subscription/preview?newPriceId={foreverPriceId}
//   2. Display proration breakdown (Lifetime price, credit, amount due)
//   3. Show existing card on file (brand + last4)
//   4. User confirms → POST /billing/forever-upgrade (uses existing card)
//   5. On success: close modal, trigger refetch
//   6. If 3DS: stripe.confirmCardPayment(clientSecret) → on success, close + refetch
//
// v1.0 limitation: Uses existing card only. "Use a different card" is a follow-up.
//
// Props:
//   isOpen    — boolean
//   onClose   — function
//   billing   — billing object (needs cardBrand, cardLast4, billingPeriod)
//   getApi    — function returning API client
//   onSuccess — function called after upgrade completes (triggers refetch)

import { useState, useEffect, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import config from '../../config';
import styles from './UpgradeToLifetimeModal.module.css';

function formatAmount(cents) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function UpgradeToLifetimeModal({ isOpen, onClose, billing, getApi, onSuccess }) {
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const foreverPriceId = config.stripePriceForever;

  // Load proration preview when modal opens
  useEffect(() => {
    if (!isOpen || !foreverPriceId) return;
    setLoadingPreview(true);
    setError(null);
    setPreview(null);

    async function loadPreview() {
      try {
        const api = getApi();
        const data = await api.get(`/billing/subscription/preview?newPriceId=${foreverPriceId}`);
        setPreview(data);
      } catch (err) {
        const msg = err.message || err.error || 'Could not load upgrade preview.';
        setError(msg);
      } finally {
        setLoadingPreview(false);
      }
    }
    loadPreview();
  }, [isOpen, foreverPriceId, getApi]);

  // Reset on open
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
      const result = await api.post('/billing/forever-upgrade');

      if (result.success) {
        // Payment succeeded immediately
        onSuccess();
        onClose();
        return;
      }

      // 3D Secure required — confirm with Stripe
      if (result.clientSecret) {
        const stripe = await loadStripe(config.stripePublishableKey);
        const { error: confirmError } = await stripe.confirmCardPayment(result.clientSecret);

        if (confirmError) {
          setError(confirmError.message);
          setSubmitting(false);
          return;
        }

        // 3DS confirmed — webhook will complete the tier update
        onSuccess();
        onClose();
        return;
      }

      // Unexpected response
      setError('Something went wrong. Please try again.');
      setSubmitting(false);

    } catch (err) {
      const msg = err.message || err.error || 'Upgrade failed. Please try again.';
      setError(msg);
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  const cardDisplay = billing?.cardBrand && billing?.cardLast4
    ? `${capitalizeFirst(billing.cardBrand)} ending in ${billing.cardLast4}`
    : 'Card on file';

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Upgrade to Lifetime">

        <h2 className={styles.heading}>Upgrade to Lifetime</h2>

        {/* Loading state */}
        {loadingPreview && (
          <p className={styles.loading}>Loading upgrade details…</p>
        )}

        {/* Preview loaded */}
        {preview && !loadingPreview && (
          <>
            <div className={styles.previewCard}>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>Lifetime plan</span>
                <span className={styles.previewValue}>{formatAmount(preview.foreverPrice)}</span>
              </div>
              {preview.creditApplied > 0 && (
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>
                    Credit from {billing?.billingPeriod === 'annual' ? 'Annual' : 'Monthly'} plan
                  </span>
                  <span className={styles.previewValueCredit}>−{formatAmount(preview.creditApplied)}</span>
                </div>
              )}
              <div className={`${styles.previewRow} ${styles.previewRowTotal}`}>
                <span className={styles.previewLabelTotal}>Due today</span>
                <span className={styles.previewValueTotal}>{formatAmount(preview.amountDue)}</span>
              </div>
            </div>

            <div className={styles.cardDisplay}>
              <span className={styles.cardLabel}>Paying with</span>
              <span className={styles.cardValue}>{cardDisplay}</span>
            </div>

            <p className={styles.benefitNote}>
              No more recurring charges. Lifetime access to all features.
            </p>
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
          {submitting ? 'Upgrading…' : 'Confirm upgrade'}
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
