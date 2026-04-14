// components/billing/PauseModal.jsx — Anamoria SPA
// v1.0 — B11 Pause Subscription modal (April 14, 2026)
//
// Entry points:
//   - "Pause subscription" link in B4 management section
//   - Quick-select buttons in B6 CancelModal (via preselectedMonths prop)
//
// Flow: select duration → confirm → POST /billing/subscription/pause → refetch
//
// Props:
//   isOpen            — boolean
//   onClose           — function
//   getApi            — function returning API client
//   onSuccess         — function called after successful pause (triggers refetch)
//   preselectedMonths — number (1, 2, or 3) if opened from CancelModal quick-select

import { useState, useEffect, useCallback } from 'react';
import styles from './PauseModal.module.css';

const MONTH_OPTIONS = [
  { months: 1, label: '1 month' },
  { months: 2, label: '2 months' },
  { months: 3, label: '3 months' },
];

function formatResumeDate(months) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function PauseModal({ isOpen, onClose, getApi, onSuccess, preselectedMonths }) {
  const [selectedMonths, setSelectedMonths] = useState(preselectedMonths || 1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedMonths(preselectedMonths || 1);
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen, preselectedMonths]);

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

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const api = getApi();
      await api.post('/billing/subscription/pause', { months: selectedMonths });
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err.message || err.error || 'Could not pause subscription. Please try again.';
      setError(msg);
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Pause subscription">

        {/* Heading */}
        <h2 className={styles.heading}>
          Take a break — your memories aren't going anywhere.
        </h2>

        {/* Body */}
        <p className={styles.body}>
          Pause your billing for a set time. You'll keep full access while paused, and billing resumes automatically when your pause ends.
        </p>

        {/* Duration selector */}
        <div className={styles.options}>
          {MONTH_OPTIONS.map((opt) => (
            <button
              key={opt.months}
              className={`${styles.option} ${selectedMonths === opt.months ? styles.optionActive : ''}`}
              onClick={() => setSelectedMonths(opt.months)}
              disabled={submitting}
            >
              <span className={styles.optionLabel}>{opt.label}</span>
              <span className={styles.optionDate}>Resumes {formatResumeDate(opt.months)}</span>
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className={styles.error}>{error}</div>
        )}

        {/* Confirm */}
        <button
          className={styles.confirmBtn}
          onClick={handleConfirm}
          disabled={submitting}
        >
          {submitting ? 'Pausing…' : 'Pause my subscription'}
        </button>

        {/* Go back */}
        <button
          className={styles.cancelLink}
          onClick={onClose}
          disabled={submitting}
        >
          Go back
        </button>

      </div>
    </div>
  );
}
