// pages/SettingsPage.jsx — Anamoria SPA
// v2.8 — Phase D: AccountPanel pending list + cancel + view all (April 21, 2026)
// Changes from v2.7:
//   - AccountPanel Requests section expanded with inline pending list
//   - Per-row Cancel with inline confirmation (not modal)
//   - "View all requests →" link to /settings/my-requests
//   - Fetches GET /account-requests/me on AccountPanel mount
//   - TYPE_LABELS_SHORT constant for pending list display
//   - navigate import used for "View all requests" link
//
//   All other panels, icons, resolveInitialSection: UNCHANGED
//
// URL: /settings?from={spaceId}&section={sectionId}&action={action}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import { useAppContext } from '../App';
import { useBillingStatus, getPlanLabel } from '../hooks/useBillingStatus';
import SpaceInfoPanel from '../components/settings/SpaceInfoPanel';
import ContributorsPanel from '../components/settings/ContributorsPanel';
import RemindersPanel from '../components/settings/RemindersPanel';
import NeedHelpPanel from '../components/settings/NeedHelpPanel';
import RequestPanel from '../components/settings/RequestPanel';
import RequestSuccessPanel from '../components/settings/RequestSuccessPanel';
import UpdatePaymentModal from '../components/billing/UpdatePaymentModal';
import CancelModal from '../components/billing/CancelModal';
import PauseModal from '../components/billing/PauseModal';
import SwitchPlanModal from '../components/billing/SwitchPlanModal';
import styles from './SettingsPage.module.css';

/* ─── Icons (unchanged from v2.0) ─── */

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

function BillingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M2 10h20" />
    </svg>
  );
}

function SpaceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ContributorsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ReminderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/* v2.7: Phase C — danger zone warning icon */
function WarningTriangleIcon({ className, ...rest }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round"
         className={className} aria-hidden="true" {...rest}>
      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

/* ═══════════════════════════════════════
   ACCOUNT PANEL — v2.8 (Phase D: +pending list, +cancel, +view all)
   Sign Out in sidebar. Email link in identity card.
   ═══════════════════════════════════════ */

const TYPE_LABELS_SHORT = {
  deletion: 'Account Deletion',
  export: 'Data Export',
  email_change: 'Email Change',
  other: 'Support Request',
};

function getSummaryLine(requestType, metadata) {
  if (!metadata) return '';
  switch (requestType) {
    case 'deletion':
      return metadata.reason ? metadata.reason.substring(0, 60) + (metadata.reason.length > 60 ? '…' : '') : '';
    case 'export':
      return '';
    case 'email_change':
      return metadata.new_email || '';
    case 'other':
      return metadata.subject || '';
    default:
      return '';
  }
}

function AccountPanel({ user, appState, getApi, onOpenRequest }) {
  const { updateProfile } = useAppContext();
  const navigate = useNavigate();  // v2.8: for "View all requests" link

  // ─── Name display values ───
  const userName  = appState?.displayName || user?.name  || 'Your account';
  const userEmail = appState?.email || user?.email || '';

  // ─── Name edit state ───
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const [justSaved, setJustSaved] = useState(false);

  const editBtnRef = useRef(null);
  const inputRef = useRef(null);
  const savedTimerRef = useRef(null);

  // v2.8: Pending requests state
  const [pendingRequests, setPendingRequests] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelError, setCancelError] = useState(null);

  // Fetch pending requests on mount
  useEffect(() => {
    async function loadRequests() {
      try {
        const api = getApi();
        const data = await api.get('/account-requests/me');
        const pending = (data.requests || []).filter(
          r => r.status === 'pending' || r.status === 'in_progress'
        );
        setPendingRequests(pending);
      } catch (err) {
        console.error('AccountPanel: requests fetch failed:', err);
      } finally {
        setPendingLoading(false);
      }
    }
    loadRequests();
  }, [getApi]);

  // Cancel handler
  async function handleCancelRequest(requestId) {
    setCancellingId(requestId);
    setCancelError(null);
    try {
      const api = getApi();
      await api.patch(`/account-requests/${requestId}`, { status: 'cancelled' });
      setPendingRequests(prev => prev.filter(r => r.requestId !== requestId));
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

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Cleanup saved timer on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  function handleStartEdit() {
    setEditValue(userName === 'Your account' ? '' : userName);
    setEditError(null);
    setJustSaved(false);
    setEditing(true);
  }

  function handleCancelEdit() {
    setEditing(false);
    setEditError(null);
    requestAnimationFrame(() => editBtnRef.current?.focus());
  }

  async function handleSaveName() {
    const trimmed = editValue.trim();

    if (trimmed.length === 0) {
      setEditError('Name cannot be empty.');
      return;
    }
    if (trimmed.length > 100) {
      setEditError('Name must be 100 characters or fewer.');
      return;
    }

    setSaving(true);
    setEditError(null);

    try {
      const api = getApi();
      const updated = await api.patch('/pilot/me', { displayName: trimmed });
      updateProfile({ displayName: updated.displayName });
      setEditing(false);
      setJustSaved(true);
      savedTimerRef.current = setTimeout(() => setJustSaved(false), 2000);
      requestAnimationFrame(() => editBtnRef.current?.focus());
    } catch (err) {
      const errorMessages = {
        DISPLAY_NAME_EMPTY: 'Name cannot be empty.',
        DISPLAY_NAME_TOO_LONG: 'Name must be 100 characters or fewer.',
        UNSUPPORTED_FIELD: 'Could not save — unsupported field.',
        USER_NOT_FOUND: 'Account not found. Please refresh and try again.',
      };
      setEditError(errorMessages[err?.error] || 'Could not save. Please try again.');

      if (!err?.status || err.status >= 500) {
        try {
          const api = getApi();
          await api.postPublic('/errors', {
            error: 'PROFILE_UPDATE_FAILED',
            detail: err?.message || err?.error || 'unknown',
            timestamp: new Date().toISOString(),
          });
        } catch (_) { /* telemetry best-effort */ }
      }
    } finally {
      setSaving(false);
    }
  }

  function handleEditKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); handleSaveName(); }
    if (e.key === 'Escape') { e.preventDefault(); handleCancelEdit(); }
  }

  // ─── Consent display ───
  const consentDate = appState?.consentDate;
  const consentPolicyVersion = appState?.consentPolicyVersion;

  function formatConsentDate(isoString) {
    if (!isoString) return null;
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  }

  return (
    <div className={styles.panel}>
      {/* ── Section 1: Heading ── */}
      <h2 className={styles.panelTitle}>Account</h2>

      {/* ── Section 2: Identity card (name + email + links) ── */}
      <div className={styles.accountCard}>
        <div className={styles.accountAvatar}>
          {(appState?.displayName || userName).charAt(0).toUpperCase()}
        </div>
        <div className={styles.accountInfo}>
          {!editing ? (
            <>
              <span className={styles.accountName}>
                {userName}
                {justSaved && (
                  <span className={styles.savedMark} aria-live="polite"> Saved ✓</span>
                )}
              </span>
              <span className={styles.accountEmail}>{userEmail}</span>
              <div className={styles.identityLinks}>
                <button
                  ref={editBtnRef}
                  className={styles.editNameLink}
                  onClick={handleStartEdit}
                >
                  Edit name
                </button>
                <span className={styles.identityLinkSep}>·</span>
                <button
                  className={styles.editNameLink}
                  onClick={() => onOpenRequest('email_change')}
                >
                  Change my email
                </button>
              </div>
            </>
          ) : (
            <>
              <span className={styles.accountEmail}>{userEmail}</span>
              <div className={styles.editNameRow}>
                <input
                  ref={inputRef}
                  className={styles.editNameInput}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  maxLength={100}
                  aria-label="Display name"
                  aria-invalid={editError ? 'true' : 'false'}
                  aria-describedby={editError ? 'name-edit-error' : undefined}
                  disabled={saving}
                />
                <div className={styles.editNameActions}>
                  <button className={styles.editNameSave} onClick={handleSaveName} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button className={styles.editNameCancel} onClick={handleCancelEdit} disabled={saving}>
                    Cancel
                  </button>
                </div>
              </div>
              {editError && (
                <p id="name-edit-error" className={styles.editNameError} role="alert">
                  {editError}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Section 3: Consent ── */}
      <div className={styles.accountSection}>
        <span className={styles.accountSectionTitle}>Your consent</span>
        <span className={styles.accountSectionValue}>
          {consentDate
            ? `Consented on ${formatConsentDate(consentDate)} · Policy v${consentPolicyVersion}`
            : 'No consent record on file.'
          }
        </span>
        <span className={styles.accountSectionHint}>
          A record of what you agreed to when you joined.
          To withdraw your consent, request account deletion below.
        </span>
      </div>

      {/* ── Section 4: Requests (v2.8: +pending list, +cancel, +view all) ── */}
      <div className={styles.accountSection}>
        <span className={styles.accountSectionTitle}>Requests</span>
        <button
          className={styles.contactSupportLink}
          onClick={() => onOpenRequest('other')}
        >
          Submit a request
        </button>

        {/* Pending requests inline list */}
        {!pendingLoading && pendingRequests.length > 0 && (
          <div className={styles.pendingRequestsList}>
            {pendingRequests.map(r => {
              const summary = getSummaryLine(r.requestType, r.metadata);
              return (
                <div key={r.requestId} className={styles.pendingRequestRow}>
                  <div className={styles.pendingRequestInfo}>
                    <span className={styles.requestTypeLabel}>
                      {TYPE_LABELS_SHORT[r.requestType] || r.requestType}
                    </span>
                    {summary && (
                      <span className={styles.pendingRequestSummary}>{summary}</span>
                    )}
                  </div>
                  <span className={`${styles.requestStatusBadge} ${
                    r.status === 'pending' ? styles.badgePending : styles.badgeInProgress
                  }`}>
                    {r.status === 'in_progress' ? 'In progress' : 'Pending'}
                  </span>

                  {/* Cancel or confirmation */}
                  {confirmingId !== r.requestId ? (
                    <button className={styles.pendingCancelBtn}
                      onClick={() => { setConfirmingId(r.requestId); setCancelError(null); }}>
                      Cancel
                    </button>
                  ) : (
                    <div className={styles.pendingCancelConfirm}>
                      <button className={styles.pendingCancelConfirmYes}
                        onClick={() => handleCancelRequest(r.requestId)}
                        disabled={cancellingId === r.requestId}>
                        {cancellingId === r.requestId ? '…' : 'Cancel request'}
                      </button>
                      <button className={styles.pendingCancelConfirmNo}
                        onClick={() => setConfirmingId(null)}>
                        Never mind
                      </button>
                    </div>
                  )}

                  {cancelError && confirmingId === r.requestId && (
                    <span className={styles.pendingCancelError}>{cancelError}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!pendingLoading && pendingRequests.length === 0 && (
          <span className={styles.pendingRequestsEmpty}>
            You have no pending requests.
          </span>
        )}

        <button
          className={styles.viewAllRequestsLink}
          onClick={() => {
            const fromParam = new URLSearchParams(window.location.search).get('from');
            navigate(fromParam ? `/settings/my-requests?from=${fromParam}` : '/settings/my-requests');
          }}
        >
          View all requests →
        </button>
      </div>

      {/* ── Section 5: Delete account danger zone ── */}
      <div className={styles.dangerZone}>
        <div className={styles.dangerZoneHeading}>
          <WarningTriangleIcon className={styles.dangerZoneIcon} />
          <h3 className={styles.dangerZoneTitle}>Delete account</h3>
        </div>
        <p className={styles.dangerZoneBody}>
          Request permanent deletion of your account and all your memories.
          This action is irreversible.
        </p>
        <button
          className={styles.dangerBtn}
          onClick={() => onOpenRequest('deletion')}
        >
          Request Account Deletion
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   BILLING PANEL — v2.4 (auto-open CancelModal from URL param)
   ═══════════════════════════════════════ */

function BillingPanel({ spaceId, navigate, getApi, initialAction }) {
  const { billing, loading, error, refetch } = useBillingStatus(getApi);
  const [invoices, setInvoices]   = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // v2.2: Modal visibility state
  const [showUpdatePayment, setShowUpdatePayment] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const [showSwitchPlan, setShowSwitchPlan] = useState(false);
  const [pausePreselectedMonths, setPausePreselectedMonths] = useState(null);

  // v2.2: Reactivate / Resume loading states
  const [reactivating, setReactivating] = useState(false);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (initialAction === 'cancel' && billing && !loading) {
      if (billing.tier === 'premium' && !billing.cancelAtPeriodEnd) {
        setShowCancel(true);
      }
    }
  }, [initialAction, billing, loading]);

  useEffect(() => {
    if (!billing || billing.tier === 'free') return;
    async function loadInvoices() {
      setInvoicesLoading(true);
      try {
        const api = getApi();
        const data = await api.get('/billing/invoices');
        setInvoices(data.invoices || []);
      } catch (err) {
        console.error('BillingPanel: invoices fetch failed:', err);
      } finally {
        setInvoicesLoading(false);
      }
    }
    loadInvoices();
  }, [billing, getApi]);

  function goUpgrade() {
    const billingUrl = spaceId
      ? `/settings?from=${spaceId}&section=billing`
      : '/settings?section=billing';
    window.history.replaceState(null, '', billingUrl);
    const q = spaceId ? `?from=${spaceId}` : '';
    navigate(`/settings/upgrade${q}`);
  }

  function formatDate(isoString) {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  }

  function formatAmount(cents) {
    if (cents == null) return '—';
    return `$${(cents / 100).toFixed(2)}`;
  }

  function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  async function handleReactivate() {
    setReactivating(true);
    try {
      const api = getApi();
      await api.post('/billing/subscription/reactivate');
      refetch();
    } catch (err) {
      console.error('Reactivate error:', err);
    } finally {
      setReactivating(false);
    }
  }

  async function handleResumeEarly() {
    setResuming(true);
    try {
      const api = getApi();
      await api.delete('/billing/subscription/pause');
      refetch();
    } catch (err) {
      console.error('Resume early error:', err);
    } finally {
      setResuming(false);
    }
  }

  function handleOpenPauseFromCancel(months) {
    setPausePreselectedMonths(months);
    setShowPause(true);
  }

  if (loading) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Plan &amp; Billing</h2>
        <p className={styles.panelLoading}>Loading billing info…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Plan &amp; Billing</h2>
        <div className={styles.billingError}>
          <p>Couldn't load billing information.</p>
          <button className={styles.retryBtn} onClick={refetch}>Try again</button>
        </div>
      </div>
    );
  }

  const tier = billing?.tier || 'free';
  const planLabel = getPlanLabel(billing);

  if (tier === 'free') {
    return (
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Plan &amp; Billing</h2>
        <div className={styles.planCard}>
          <div className={styles.planCardLeft}>
            <span className={styles.planName}>{planLabel}</span>
            <span className={styles.planLimits}>Up to 15 memories · 1 space</span>
          </div>
          <button className={styles.upgradeBtn} onClick={goUpgrade}>Upgrade</button>
        </div>
        <p className={styles.panelHint}>Your memories are always kept, whatever plan you're on.</p>
      </div>
    );
  }

  if (tier === 'forever') {
    return (
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Plan &amp; Billing</h2>
        <div className={styles.planCard}>
          <div className={styles.planCardLeft}>
            <span className={styles.planName}>Lifetime Member ♾</span>
            <span className={styles.planLimits}>Member since {formatDate(billing.foreverPurchasedAt)}</span>
          </div>
        </div>
        {invoices.length > 0 && (
          <div className={styles.billingSection}>
            <h3 className={styles.billingSectionTitle}>Your invoice</h3>
            <div className={styles.invoiceList}>
              {invoices.slice(0, 1).map((inv) => (
                <div key={inv.id} className={styles.invoiceRow}>
                  <span className={styles.invoiceDate}>{formatDate(inv.date)}</span>
                  <span className={styles.invoiceAmount}>{formatAmount(inv.amount)}</span>
                  {inv.pdfUrl && (
                    <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className={styles.invoiceLink}>
                      <DownloadIcon /> PDF
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <p className={styles.panelHint}>You have lifetime access to Anamoria. No recurring charges.</p>
      </div>
    );
  }

  // Premium tier
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Plan &amp; Billing</h2>

      {billing.paymentFailed && (
        <div className={`${styles.warningBanner} ${billing.paymentFailedUrgent ? styles.warningBannerUrgent : ''}`}>
          <p className={styles.warningText}>There's a problem with your payment — update your card to keep your access.</p>
          <button className={styles.warningAction} onClick={() => setShowUpdatePayment(true)}>Update card</button>
        </div>
      )}

      {billing.cancelAtPeriodEnd && (
        <div className={styles.cancelNotice}>
          <p className={styles.cancelNoticeText}>
            Your plan cancels on {formatDate(billing.currentPeriodEnd)}. You'll move to the Free plan after that date.
          </p>
          <button className={styles.cancelNoticeAction} onClick={handleReactivate} disabled={reactivating}>
            {reactivating ? 'Reactivating…' : 'Reactivate'}
          </button>
        </div>
      )}

      {billing.pauseCollectionUntil && (
        <div className={styles.pauseNotice}>
          <p className={styles.pauseNoticeText}>
            Billing paused until {formatDate(billing.pauseCollectionUntil)}. Your memories stay accessible.
          </p>
          <button className={styles.pauseNoticeAction} onClick={handleResumeEarly} disabled={resuming}>
            {resuming ? 'Resuming…' : 'Resume early'}
          </button>
        </div>
      )}

      <div className={styles.planCard}>
        <div className={styles.planCardLeft}>
          <span className={styles.planName}>{planLabel}</span>
          <span className={styles.planLimits}>
            {billing.cancelAtPeriodEnd
              ? `Access until ${formatDate(billing.currentPeriodEnd)}`
              : `Renews ${formatDate(billing.currentPeriodEnd)}`}
          </span>
        </div>
        <button className={styles.changePlanLink} onClick={goUpgrade}>Change plan</button>
      </div>

      {billing.cardBrand && billing.cardLast4 && (
        <div className={styles.billingSection}>
          <h3 className={styles.billingSectionTitle}>Payment method</h3>
          <div className={styles.cardInfo}>
            <span className={styles.cardBrand}>{capitalizeFirst(billing.cardBrand)}</span>
            <span className={styles.cardLast4}>ending in {billing.cardLast4}</span>
            <button className={styles.cardUpdateLink} onClick={() => setShowUpdatePayment(true)}>Update</button>
          </div>
        </div>
      )}

      <div className={styles.billingSection}>
        <h3 className={styles.billingSectionTitle}>Manage subscription</h3>
        <div className={styles.managementLinks}>
          <button className={styles.managementLink} onClick={() => setShowSwitchPlan(true)}>
            Switch to {billing.billingPeriod === 'monthly' ? 'Annual' : 'Monthly'}
          </button>
          {!billing.pauseCollectionUntil && !billing.cancelAtPeriodEnd && (
            <button className={styles.managementLink} onClick={() => { setPausePreselectedMonths(null); setShowPause(true); }}>
              Pause subscription
            </button>
          )}
          {!billing.cancelAtPeriodEnd && (
            <button className={styles.managementLink} onClick={() => setShowCancel(true)}>
              Cancel subscription
            </button>
          )}
        </div>
      </div>

      {invoicesLoading ? (
        <div className={styles.billingSection}>
          <h3 className={styles.billingSectionTitle}>Your invoices</h3>
          <p className={styles.panelLoading}>Loading invoices…</p>
        </div>
      ) : invoices.length > 0 ? (
        <div className={styles.billingSection}>
          <h3 className={styles.billingSectionTitle}>Your invoices</h3>
          <div className={styles.invoiceList}>
            {invoices.map((inv) => (
              <div key={inv.id} className={styles.invoiceRow}>
                <span className={styles.invoiceDate}>{formatDate(inv.date)}</span>
                <span className={styles.invoiceAmount}>{formatAmount(inv.amount)}</span>
                <span className={styles.invoiceStatus}>{inv.status}</span>
                {inv.pdfUrl && (
                  <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className={styles.invoiceLink}>
                    <DownloadIcon /> PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className={styles.panelHint}>Your memories are always kept, whatever plan you're on.</p>

      {showUpdatePayment && (
        <UpdatePaymentModal isOpen onClose={() => setShowUpdatePayment(false)} getApi={getApi} onSuccess={refetch} />
      )}
      {showCancel && (
        <CancelModal isOpen onClose={() => setShowCancel(false)} billing={billing} getApi={getApi}
          onSuccess={refetch} onOpenPause={handleOpenPauseFromCancel} />
      )}
      {showPause && (
        <PauseModal isOpen onClose={() => { setShowPause(false); setPausePreselectedMonths(null); }}
          getApi={getApi} onSuccess={refetch} preselectedMonths={pausePreselectedMonths} />
      )}
      {showSwitchPlan && (
        <SwitchPlanModal isOpen onClose={() => setShowSwitchPlan(false)} billing={billing}
          getApi={getApi} onSuccess={refetch} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   SECTION PARAM MAPPING (backward compat — unchanged)
   ═══════════════════════════════════════ */

function resolveInitialSection(sectionParam, hasSpaceId) {
  if (sectionParam === 'space') return 'space-info';
  if (sectionParam) return sectionParam;
  return hasSpaceId ? 'space-info' : 'account';
}

/* ═══════════════════════════════════════
   SETTINGS PAGE
   ═══════════════════════════════════════ */

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const spaceId = searchParams.get('from');
  const { getAccessTokenSilently, user, logout } = useAuth0();
  const appState = useAppContext();

  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  /* ─── Active nav section ─── */
  const [activeSection, setActiveSection] = useState(
    resolveInitialSection(searchParams.get('section'), !!spaceId)
  );

  /* ─── Request form state (sub-panel of settings) ─── */
  const [requestType, setRequestType] = useState(null);
  const [requestResult, setRequestResult] = useState(null);
  const [requestSpaceName, setRequestSpaceName] = useState(null);

  function openRequestPanel(type, spaceName) {
    setRequestType(type || 'other');
    setRequestSpaceName(spaceName || null);
    setRequestResult(null);
    setActiveSection('request');
  }

  function handleRequestSuccess(result) {
    setRequestResult(result);
    setActiveSection('request-success');
  }

  function handleRequestCancel() {
    setActiveSection('account');
    setRequestType(null);
  }

  function handleRequestSuccessBack() {
    setActiveSection('account');
    setRequestType(null);
    setRequestResult(null);
  }

  // v2.4 (Fix 1): Read ?action= param
  const [initialAction] = useState(() => {
    const action = searchParams.get('action');
    if (action) {
      const cleanParams = new URLSearchParams(searchParams);
      cleanParams.delete('action');
      const cleanUrl = cleanParams.toString()
        ? `${window.location.pathname}?${cleanParams.toString()}`
        : window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }
    return action;
  });

  /* ─── Space data ─── */
  const [space, setSpace]               = useState(null);
  const [loadingSpace, setLoadingSpace] = useState(false);

  useEffect(() => {
    if (!spaceId) return;
    async function loadSpace() {
      setLoadingSpace(true);
      try {
        const api = getApi();
        const data = await api.get(`/spaces/${spaceId}`);
        setSpace(data);
      } catch (err) {
        console.error('SettingsPage: failed to load space:', err);
      } finally {
        setLoadingSpace(false);
      }
    }
    loadSpace();
  }, [spaceId, getApi]);

  const handlePanelSave = useCallback((updatedSpace) => {
    setSpace((prev) => ({ ...prev, ...updatedSpace }));
  }, []);

  /* ─── Sign Out (now at SettingsPage level for sidebar) ─── */
  function handleSignOut() {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('ana_')) keysToRemove.push(key);
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    logout({ logoutParams: { returnTo: window.location.origin } });
  }

  /* ─── Navigation ─── */
  function goBack() {
    if (spaceId) navigate(`/spaces/${spaceId}`);
    else navigate('/spaces');
  }

  function goToSpace() {
    if (spaceId) navigate(`/spaces/${spaceId}`);
  }

  /* ─── Nav items ─── */
  const spaceNavItems = spaceId ? [
    { id: 'space-info',    label: 'Space',        icon: <SpaceIcon /> },
    { id: 'contributors',  label: 'Contributors', icon: <ContributorsIcon /> },
    { id: 'reminders',     label: 'Reminders',    icon: <ReminderIcon /> },
    { id: 'need-help',     label: 'Need Help',    icon: <HelpIcon /> },
  ] : [];

  const navItems = [
    { id: 'account', label: 'Account', icon: <AccountIcon /> },
    { id: 'billing', label: 'Plan & Billing', icon: <BillingIcon /> },
    ...spaceNavItems,
  ];

  /* ─── Right panel content ─── */
  function renderPanel() {
    const isSpacePanel = ['space-info', 'contributors', 'reminders', 'need-help'].includes(activeSection);

    if (isSpacePanel) {
      if (loadingSpace) {
        return <div className={styles.panel}><p className={styles.panelLoading}>Loading…</p></div>;
      }
      if (!space) {
        return <div className={styles.panel}><p className={styles.panelLoading}>Could not load space.</p></div>;
      }
    }

    switch (activeSection) {
      case 'account':
        return <AccountPanel user={user} appState={appState} getApi={getApi}
          onOpenRequest={(type) => openRequestPanel(type)} />;

      case 'request':
        return <RequestPanel initialType={requestType} spaceName={requestSpaceName}
          getApi={getApi} appState={appState}
          onSuccess={handleRequestSuccess} onCancel={handleRequestCancel} />;

      case 'request-success':
        return requestResult
          ? <RequestSuccessPanel result={requestResult} onBack={handleRequestSuccessBack} />
          : <AccountPanel user={user} appState={appState} getApi={getApi}
              onOpenRequest={(type) => openRequestPanel(type)} />;

      case 'space-info':
        return (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Space</h2>
            <SpaceInfoPanel space={space} getApi={getApi} onSave={handlePanelSave} />
          </div>
        );

      case 'contributors':
        return (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Contributors</h2>
            <ContributorsPanel space={space} getApi={getApi} onSave={handlePanelSave} />
          </div>
        );

      case 'reminders':
        return (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Reminders</h2>
            <RemindersPanel space={space} getApi={getApi} onSave={handlePanelSave} />
          </div>
        );

      case 'need-help':
        return (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Need Help</h2>
            <NeedHelpPanel space={space} onRequestHelp={(spaceName) => openRequestPanel('other', spaceName)} />
          </div>
        );

      case 'billing':
        return <BillingPanel spaceId={spaceId} navigate={navigate} getApi={getApi} initialAction={initialAction} />;

      default:
        return null;
    }
  }

  /* ─── Render ─── */
  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <button className={styles.backBtn} onClick={goBack} aria-label="Go back">
          <BackIcon />
        </button>
        <h1 className={styles.title}>Settings</h1>
        <div className={styles.headerSpacer} aria-hidden="true" />
      </header>

      <div className={styles.body}>

        <nav className={styles.leftNav} aria-label="Settings sections">

          {spaceId && space && (
            <button className={styles.spaceBackLink} onClick={goToSpace}>
              <span className={styles.spaceBackArrow}>←</span>
              <span className={styles.spaceBackName}>{space.name}</span>
            </button>
          )}

          {navItems.map((item) => {
            const isFirstSpaceItem = item.id === 'space-info';
            return (
              <div key={item.id}>
                {isFirstSpaceItem && (
                  <div className={styles.navSectionLabel}>SPACE</div>
                )}
                <button
                  className={`${styles.navItem} ${activeSection === item.id ? styles.navItemActive : ''}`}
                  onClick={() => setActiveSection(item.id)}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span className={styles.navLabel}>{item.label}</span>
                  <span className={styles.navChevron}><ChevronIcon /></span>
                </button>
              </div>
            );
          })}

          {/* Sign Out — always last in sidebar */}
          <div className={styles.signOutNavWrapper}>
            <button className={styles.signOutNavItem} onClick={handleSignOut}>
              <span className={styles.navIcon}><SignOutIcon /></span>
              <span className={styles.navLabel}>Sign out</span>
            </button>
          </div>
        </nav>

        <div className={styles.rightPanel}>
          {renderPanel()}
        </div>

      </div>
    </div>
  );
}
