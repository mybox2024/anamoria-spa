// components/settings/RequestSuccessPanel.jsx — Anamoria SPA
// v1.1 — Copy update: response window 30 days → 7 days (May 2, 2026)
//
// Changes from v1.0:
//   - Message text "...will get back to you within 30 days." changed to
//     "...will get back to you within 7 days." per product direction.
//   - No other changes.
//
// v1.0 — Phase C: Request submission success panel (April 21, 2026)
//
// Renders inside SettingsPage right panel after successful form submission.
// Shows receipt with request ID, type, timestamp. "Back to Account" callback.
//
// Props:
//   result — { requestId, requestType, requestedAt }
//   onBack — callback to return to Account panel

import styles from './RequestSuccessPanel.module.css';

const TYPE_LABELS = {
  deletion: 'Account Deletion',
  export: 'Data Export',
  email_change: 'Email Change',
  other: 'Support Request',
};

function formatTimestamp(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function RequestSuccessPanel({ result, onBack }) {
  const shortId = result.requestId ? result.requestId.substring(0, 8) + '…' : '';
  const typeLabel = TYPE_LABELS[result.requestType] || result.requestType;

  return (
    <div className={styles.wrapper}>
      {/* Sage tick */}
      <svg className={styles.tickIcon} width="48" height="48" viewBox="0 0 48 48"
        fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="23" stroke="#5b7a65" strokeWidth="2" />
        <path d="M14 24l7 7 13-13" stroke="#5b7a65" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <h2 className={styles.heading}>Request received</h2>

      <p className={styles.message}>
        We've received your <strong>{typeLabel}</strong> request
        and will get back to you within 7 days. A confirmation has been sent to your email.
      </p>

      <div className={styles.receipt}>
        <div className={styles.receiptRow}>
          <span className={styles.receiptLabel}>Request ID</span>
          <span className={styles.receiptValue}>{shortId}</span>
        </div>
        <div className={styles.receiptRow}>
          <span className={styles.receiptLabel}>Type</span>
          <span className={styles.receiptValue}>{typeLabel}</span>
        </div>
        <div className={styles.receiptRow}>
          <span className={styles.receiptLabel}>Submitted</span>
          <span className={styles.receiptValue}>{formatTimestamp(result.requestedAt)}</span>
        </div>
      </div>

      <button className={styles.backBtn} onClick={onBack}>
        Back to Account
      </button>
    </div>
  );
}
