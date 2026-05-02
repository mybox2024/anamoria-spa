// components/settings/RequestPanel.jsx — Anamoria SPA
// v1.2 — Remove subject pre-fill (May 2, 2026)
//
// Changes from v1.1:
//   - Subject useState initializer simplified to '' (empty string).
//     Previous: conditional `Question about ${spaceName}` when type='other'
//     and spaceName was provided. Pre-fill removed entirely per product
//     direction. The `spaceName` prop is retained in the signature so
//     existing callers do not break — it is simply no longer consumed.
//   - No other changes.
//
// v1.1 — UI polish: remove context box, update hint text (April 29, 2026)
//
// Changes from v1.0:
//   - Removed "SUBMITTING AS" context box — redundant, user is already
//     logged in and this is their space.
//   - Changed hint text from "We'll send you a receipt and respond within
//     30 days." to "We will send an email to confirm we have your request"
//   - No other changes.
//
// v1.0 — Phase C: Account request form panel (April 21, 2026)
//
// Renders inside SettingsPage right panel (not a standalone route).
// Form with picklist, per-type conditional fields, submission to
// POST /account-requests, callbacks for success and cancel.
//
// Props:
//   initialType   — pre-selected request type (from AccountPanel/NeedHelpPanel)
//   spaceName     — space context (retained for caller compatibility; no longer consumed)
//   getApi        — API client factory
//   appState      — user context for display
//   onSuccess     — callback with { requestId, requestType, requestedAt }
//   onCancel      — callback to return to previous panel

import { useState } from 'react';
import styles from './RequestPanel.module.css';

const VALID_REQUEST_TYPES = ['deletion', 'export', 'email_change', 'other'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPE_LABELS = {
  deletion: 'Account Deletion',
  export: 'Data Export',
  email_change: 'Email Change',
  other: 'Other / General',
};

export default function RequestPanel({ initialType, spaceName, getApi, appState, onSuccess, onCancel }) {
  const requestType_ = VALID_REQUEST_TYPES.includes(initialType) ? initialType : 'other';

  const [requestType, setRequestType] = useState(requestType_);
  const [reason, setReason] = useState('');
  const [acknowledgedIrreversible, setAcknowledgedIrreversible] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  function handleTypeChange(e) {
    setRequestType(e.target.value);
    setSubmitError(null);
  }

  function validate() {
    switch (requestType) {
      case 'deletion':
        if (!acknowledgedIrreversible) return 'Please confirm you understand this is irreversible.';
        if (reason && reason.length > 1000) return 'Reason must be 1000 characters or fewer.';
        return null;
      case 'export':
        return null;
      case 'email_change':
        if (!newEmail.trim()) return 'Please enter your new email address.';
        if (!EMAIL_REGEX.test(newEmail.trim())) return 'Please enter a valid email address.';
        if (newEmail.length > 255) return 'Email must be 255 characters or fewer.';
        if (reason && reason.length > 1000) return 'Reason must be 1000 characters or fewer.';
        return null;
      case 'other':
        if (!subject.trim()) return 'Please enter a subject.';
        if (subject.length > 200) return 'Subject must be 200 characters or fewer.';
        if (!message.trim()) return 'Please enter a message.';
        if (message.length > 5000) return 'Message must be 5000 characters or fewer.';
        return null;
      default:
        return 'Please select a request type.';
    }
  }

  function buildMetadata() {
    switch (requestType) {
      case 'deletion': {
        const meta = { acknowledged_irreversible: true };
        if (reason.trim()) meta.reason = reason.trim();
        return meta;
      }
      case 'export': return {};
      case 'email_change': {
        const meta = { new_email: newEmail.trim() };
        if (reason.trim()) meta.reason = reason.trim();
        return meta;
      }
      case 'other': return { subject: subject.trim(), message: message.trim() };
      default: return {};
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setSubmitError(validationError); return; }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const api = getApi();
      const result = await api.post('/account-requests', {
        requestType,
        metadata: buildMetadata(),
      });
      onSuccess({
        requestId: result.requestId,
        requestType: result.requestType,
        requestedAt: result.requestedAt,
      });
    } catch (err) {
      const errorMessages = {
        DUPLICATE_PENDING_REQUEST: 'You already have a pending request of this type. Please wait for it to be processed.',
        RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
        IRREVERSIBLE_ACK_REQUIRED: 'Please confirm you understand this is irreversible.',
        NEW_EMAIL_REQUIRED: 'Please enter your new email address.',
        INVALID_NEW_EMAIL: 'Please enter a valid email address.',
        SUBJECT_REQUIRED: 'Please enter a subject.',
        INVALID_SUBJECT: 'Subject must be 200 characters or fewer.',
        MESSAGE_REQUIRED: 'Please enter a message.',
        INVALID_MESSAGE: 'Message must be 5000 characters or fewer.',
        USER_NOT_FOUND: 'Account not found. Please refresh and try again.',
      };
      setSubmitError(errorMessages[err?.error] || 'Something went wrong. Please try again.');

      if (!err?.status || err.status >= 500) {
        try {
          const api = getApi();
          await api.postPublic('/errors', {
            error: 'REQUEST_SUBMIT_FAILED',
            detail: err?.message || err?.error || 'unknown',
            timestamp: new Date().toISOString(),
          });
        } catch (_) { /* telemetry best-effort */ }
      }
    } finally {
      setSubmitting(false);
    }
  }

  const userName = appState?.displayName || 'Your account';
  const userEmail = appState?.email || '';
  const userId = appState?.userId ? appState.userId.substring(0, 8) + '…' : '';
  const submitLabels = {
    deletion: 'Submit Deletion Request',
    export: 'Submit Export Request',
    email_change: 'Submit Email Change Request',
    other: 'Submit Request',
  };
  const isSubmitDisabled = submitting || (requestType === 'deletion' && !acknowledgedIrreversible);

  return (
    <div>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>

        {/* Type picklist */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="request-type">Request type</label>
          <select id="request-type" className={styles.select} value={requestType}
            onChange={handleTypeChange} disabled={submitting}>
            {VALID_REQUEST_TYPES.map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {/* Per-type content */}
        {requestType === 'deletion' && (
          <>
            <div className={styles.bannerDanger}>
              <strong>This action is permanent and irreversible.</strong> Your account, all spaces,
              memories, voice recordings, and contributor data will be permanently deleted.
              Backups are kept for 30 days.
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="deletion-reason">
                Reason <span className={styles.optional}>(optional)</span>
              </label>
              <textarea id="deletion-reason" className={styles.textarea} value={reason}
                onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3}
                placeholder="Help us understand why you're leaving…" disabled={submitting} />
            </div>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={acknowledgedIrreversible}
                onChange={(e) => setAcknowledgedIrreversible(e.target.checked)}
                disabled={submitting} aria-required="true" />
              <span>I understand this is irreversible and want to proceed.</span>
            </label>
          </>
        )}

        {requestType === 'export' && (
          <div className={styles.bannerInfo}>
            Your memories stay in your account — this sends you a copy.
            We'll prepare your data and email it to you within 30 days.
          </div>
        )}

        {requestType === 'email_change' && (
          <>
            <div className={styles.bannerInfo}>
              For security, email changes are handled manually during pilot.
              Your current email remains active until support confirms.
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="new-email">
                New email address <span className={styles.required}>*</span>
              </label>
              <input id="new-email" className={styles.input} type="email" value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)} maxLength={255}
                placeholder="your-new-email@example.com" aria-required="true" disabled={submitting} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="email-change-reason">
                Reason <span className={styles.optional}>(optional)</span>
              </label>
              <textarea id="email-change-reason" className={styles.textarea} value={reason}
                onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={2} disabled={submitting} />
            </div>
          </>
        )}

        {requestType === 'other' && (
          <>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="other-subject">
                Subject <span className={styles.required}>*</span>
              </label>
              <input id="other-subject" className={styles.input} type="text" value={subject}
                onChange={(e) => setSubject(e.target.value)} maxLength={200}
                aria-required="true" disabled={submitting} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="other-message">
                Message <span className={styles.required}>*</span>
              </label>
              <textarea id="other-message" className={styles.textarea} value={message}
                onChange={(e) => setMessage(e.target.value)} maxLength={5000} rows={5}
                aria-required="true" disabled={submitting} />
            </div>
          </>
        )}

        {submitError && (
          <p className={styles.error} role="alert" aria-live="polite">{submitError}</p>
        )}

        <div className={styles.actions}>
          <button type="submit"
            className={requestType === 'deletion' ? styles.submitDanger : styles.submitBtn}
            disabled={isSubmitDisabled}>
            {submitting ? 'Submitting…' : submitLabels[requestType]}
          </button>
          <button type="button" className={styles.cancelBtn}
            onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        </div>

        <p className={styles.hint}>
          We will send an email to confirm we have your request
        </p>
      </form>
    </div>
  );
}
