// pages/MyRequestsPage.jsx — Anamoria SPA
// v1.1 — Phase D polish: detail summary + expand/collapse (April 21, 2026)
//
// Changes from v1.0:
//   - Each row shows a one-line summary of the request details
//   - Click row to expand/collapse full metadata display
//   - getSummary() and getDetails() format metadata per request type
//   - ChevronDown icon indicates expandable state

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import styles from './MyRequestsPage.module.css';

const TYPE_LABELS = {
  deletion: 'Account Deletion',
  export: 'Data Export',
  email_change: 'Email Change',
  other: 'Support Request',
};

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function getSummary(requestType, metadata) {
  if (!metadata) return '';
  switch (requestType) {
    case 'deletion':
      return metadata.reason ? `Reason: ${metadata.reason.substring(0, 80)}${metadata.reason.length > 80 ? '…' : ''}` : 'Account deletion request';
    case 'export':
      return 'Data export request';
    case 'email_change':
      return `New email: ${metadata.new_email || '(not provided)'}`;
    case 'other':
      return metadata.subject || 'General request';
    default:
      return '';
  }
}

function getDetails(requestType, metadata) {
  if (!metadata) return [];
  const details = [];
  switch (requestType) {
    case 'deletion':
      if (metadata.reason) details.push({ label: 'Reason', value: metadata.reason });
      break;
    case 'export':
      break;
    case 'email_change':
      if (metadata.new_email) details.push({ label: 'New email', value: metadata.new_email });
      if (metadata.reason) details.push({ label: 'Reason', value: metadata.reason });
      break;
    case 'other':
      if (metadata.subject) details.push({ label: 'Subject', value: metadata.subject });
      if (metadata.message) details.push({ label: 'Message', value: metadata.message });
      break;
  }
  return details;
}

/* ─── Icons ─── */

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

/* ─── Status badge ─── */

function StatusBadge({ status }) {
  const badgeClass = {
    pending: styles.badgePending,
    in_progress: styles.badgeInProgress,
    completed: styles.badgeCompleted,
    cancelled: styles.badgeCancelled,
  }[status] || styles.badgePending;

  const label = {
    pending: 'Pending',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }[status] || status;

  return <span className={`${styles.badge} ${badgeClass}`}>{label}</span>;
}

/* ═══════════════════════════════════════
   MY REQUESTS PAGE
   ═══════════════════════════════════════ */

export default function MyRequestsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getAccessTokenSilently } = useAuth0();

  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  // Preserve spaceId when navigating back
  const fromParam = searchParams.get('from');
  const backUrl = fromParam ? `/settings?from=${fromParam}&section=account` : '/settings?section=account';

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [expandedId, setExpandedId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelError, setCancelError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const api = getApi();
        const data = await api.get('/account-requests/me');
        setRequests(data.requests || []);
      } catch (err) {
        console.error('MyRequestsPage: fetch failed:', err);
        setError('Could not load your requests.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [getApi]);

  async function handleCancel(requestId) {
    setCancellingId(requestId);
    setCancelError(null);
    try {
      const api = getApi();
      await api.patch(`/account-requests/${requestId}`, { status: 'cancelled' });
      setRequests(prev => prev.map(r =>
        r.requestId === requestId ? { ...r, status: 'cancelled' } : r
      ));
      setConfirmingId(null);
    } catch (err) {
      const messages = {
        NOT_CANCELLABLE: 'This request can no longer be cancelled.',
        REQUEST_NOT_FOUND: 'Request not found.',
      };
      setCancelError(messages[err?.error] || 'Could not cancel. Please try again.');
    } finally {
      setCancellingId(null);
    }
  }

  function isCancellable(status) {
    return ['pending', 'in_progress'].includes(status);
  }

  function toggleExpand(requestId) {
    setExpandedId(prev => prev === requestId ? null : requestId);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(backUrl)}
          aria-label="Go back">
          <BackIcon />
        </button>
        <h1 className={styles.title}>My Requests</h1>
        <div className={styles.headerSpacer} aria-hidden="true" />
      </header>

      <div className={styles.content}>
        {loading && <p className={styles.loading}>Loading…</p>}

        {error && <p className={styles.error}>{error}</p>}

        {!loading && !error && requests.length === 0 && (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>You haven't submitted any requests yet.</p>
            <button className={styles.emptyLink}
              onClick={() => navigate(backUrl)}>
              Back to Account
            </button>
          </div>
        )}

        {!loading && !error && requests.length > 0 && (
          <div className={styles.list}>
            {requests.map(r => {
              const isExpanded = expandedId === r.requestId;
              const summary = getSummary(r.requestType, r.metadata);
              const details = getDetails(r.requestType, r.metadata);

              return (
                <div key={r.requestId} className={styles.row}>
                  {/* Clickable header */}
                  <button className={styles.rowHeader} onClick={() => toggleExpand(r.requestId)}>
                    <div className={styles.rowMain}>
                      <span className={styles.rowType}>{TYPE_LABELS[r.requestType] || r.requestType}</span>
                      <StatusBadge status={r.status} />
                      <span className={styles.rowDate}>{formatDate(r.requestedAt)}</span>
                    </div>
                    {summary && (
                      <span className={styles.rowSummary}>{summary}</span>
                    )}
                    <svg className={`${styles.expandIcon} ${isExpanded ? styles.expandIconOpen : ''}`}
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && details.length > 0 && (
                    <div className={styles.rowDetails}>
                      {details.map((d, i) => (
                        <div key={i} className={styles.detailItem}>
                          <span className={styles.detailLabel}>{d.label}</span>
                          <span className={styles.detailValue}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Cancel button or confirmation */}
                  {isCancellable(r.status) && confirmingId !== r.requestId && (
                    <button className={styles.cancelBtn}
                      onClick={(e) => { e.stopPropagation(); setConfirmingId(r.requestId); setCancelError(null); }}>
                      Cancel
                    </button>
                  )}

                  {confirmingId === r.requestId && (
                    <div className={styles.cancelConfirm}>
                      <span>Are you sure?</span>
                      <button className={styles.cancelConfirmYes}
                        onClick={(e) => { e.stopPropagation(); handleCancel(r.requestId); }}
                        disabled={cancellingId === r.requestId}>
                        {cancellingId === r.requestId ? 'Cancelling…' : 'Cancel request'}
                      </button>
                      <button className={styles.cancelConfirmNo}
                        onClick={(e) => { e.stopPropagation(); setConfirmingId(null); }}>
                        Never mind
                      </button>
                    </div>
                  )}

                  {cancelError && confirmingId === r.requestId && (
                    <p className={styles.cancelError}>{cancelError}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
