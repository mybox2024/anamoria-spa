// InvitePage.jsx — /spaces/:spaceId/invite
// v1.2 — UI polish: header consistency with Write page (April 29, 2026)
//
// Changes from v1.1:
//   - Replaced inline header with shared LovedOneBar component
//     (circular avatar with space photo, consistent with Write/Record pages)
//   - Subtitle shows "Invite someone"
//
// v1.1 — Invite UX cleanup. (April 17, 2026)
//
// Changes from v1.0:
//   - REMOVED: Inline "Invited (N)" contributor list JSX + associated
//     `contributors` state + `GET /spaces/:id/contributors` fetch on mount
//     + post-send list refresh. Reason: the list does not scale past a few
//     rows (20, 200 contributors make the page unusable). The canonical
//     contributor management view lives in Settings.
//   - ADDED: "Manage contributors →" text link below Send invite button
//     inside the form card. Deep-links to
//     /settings?from={spaceId}&section=contributors per SettingsPage.jsx
//     URL contract (searchParams `from` + `section`).
//   - CHANGED: Success feedback moved from inline .successBanner to a
//     transient bottom-center toast overlay. Auto-dismisses after 3s
//     (Red Hat / Material Design 3 guidance for transient success toasts).
//     `role="status"` + `aria-live="polite"` so screen readers announce it.
//     Dismiss timer is cleared on unmount and on re-send (prevents
//     setState-after-unmount and stacked timers).
//
// Intentionally UNTOUCHED from v1.0:
//   - POST /spaces/:spaceId/invite request payload and error handling
//     (ALREADY_INVITED → specific message, else generic)
//   - Header + form fields (name, email, personal note) + Send button
//   - Privacy note at the bottom
//   - Loading state
//
// APIs: POST /spaces/:id/invite
// (v1.0 called GET /spaces/:id/contributors — removed in v1.1)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import styles from './InvitePage.module.css';
import LovedOneBar from '../components/LovedOneBar';
import { useResolvedPhotoUrl } from '../hooks/useResolvedPhotoUrl';

// v1.1: Toast auto-dismiss duration — Red Hat / Material Design 3 guidance
// for transient success confirmations.
const TOAST_MS = 3000;

export default function InvitePage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();

  const [space, setSpace] = useState(null);
  // v1.2: Resolve S3 key to signed CloudFront URL for LovedOneBar avatar.
  const resolvedPhotoUrl = useResolvedPhotoUrl(space, getAccessTokenSilently);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null); // v1.1: { text } | null
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // v1.1: Hold the toast auto-dismiss timer so we can cancel it on unmount
  // or when a new toast replaces an existing one.
  const toastTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const api = createApiClient(getAccessTokenSilently);
        // v1.1: Only load the space. Contributor fetch removed — the list
        // is no longer rendered on this page.
        const spaceData = await api.get(`/spaces/${spaceId}`);
        if (cancelled) return;
        setSpace(spaceData);
      } catch (err) {
        console.error('Invite load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId, getAccessTokenSilently]);

  // v1.1: Clear toast timer on unmount.
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  // v1.1: Shared helper — set a toast that auto-dismisses. Cancels any
  // prior pending dismiss so back-to-back sends don't stack timers.
  const showToast = useCallback((text) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ text });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, TOAST_MS);
  }, []);

  const handleSend = useCallback(async () => {
    if (!email.trim() || !name.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const api = createApiClient(getAccessTokenSilently);
      await api.post(`/spaces/${spaceId}/invite`, {
        email: email.trim(),
        contributorName: name.trim(),
        message: message.trim() || null,
      });
      // v1.1: Toast overlay replaces inline success banner.
      showToast(`Invite sent to ${email.trim()}`);
      setEmail('');
      setName('');
      setMessage('');
      // v1.1: No post-send contributor refresh — list removed.
    } catch (err) {
      if (err.error === 'ALREADY_INVITED') {
        setError('This person has already been invited.');
      } else {
        setError("Couldn't send invite. Please try again.");
      }
    } finally {
      setSending(false);
    }
  }, [email, name, message, sending, spaceId, getAccessTokenSilently, showToast]);

  // v1.1: Deep-link to the Contributors panel in Settings. Confirmed URL
  // contract by inspecting SettingsPage.jsx (reads `from` + `section` via
  // useSearchParams and resolveInitialSection).
  const handleManageContributors = useCallback(() => {
    navigate(`/settings?from=${spaceId}&section=contributors`);
  }, [navigate, spaceId]);

  const spaceInitial = space?.name ? space.name.charAt(0).toUpperCase() : '?';

  if (loading) {
    return <div className={styles.loading}><div className={styles.loadingDot} /><span>Loading...</span></div>;
  }

  return (
    <div className={styles.screen}>
      {/* v1.2: Shared LovedOneBar — consistent with Write/Record pages */}
      <LovedOneBar
        spaceName={space?.name}
        spacePhotoUrl={resolvedPhotoUrl}
        subtitle="Invite someone"
        onBack={() => navigate(`/spaces/${spaceId}`)}
      />

      <div className={styles.content}>
        {/* Invite form */}
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>Invite a family member or friend</h3>
          <p className={styles.formDesc}>They'll be able to add their own memories to {space?.name}'s space.</p>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Their name</label>
            <input
              type="text"
              className={styles.fieldInput}
              placeholder="e.g., Aunt Sarah"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Their email</label>
            <input
              type="email"
              className={styles.fieldInput}
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Personal note <span className={styles.optional}>(optional)</span></label>
            <textarea
              className={styles.fieldTextarea}
              placeholder={`e.g., I've been keeping some memories of ${space?.name || 'them'} here...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>

          {/* v1.1: Inline success banner removed. Success surfaces as a
              bottom-center toast overlay (rendered at screen-level below). */}
          {error && <div className={styles.errorBanner}>{error}</div>}

          <button
            className={styles.btnPrimary}
            onClick={handleSend}
            disabled={!email.trim() || !name.trim() || sending}
          >
            {sending ? 'Sending...' : 'Send invite'}
          </button>

          {/* v1.1: Manage contributors link — below Send, inside form card.
              Deep-links to /settings?from=...&section=contributors per
              SettingsPage URL contract. */}
          <button
            type="button"
            className={styles.manageLink}
            onClick={handleManageContributors}
          >
            Manage contributors →
          </button>
        </div>

        {/* Privacy note — unchanged from v1.0 */}
        <div className={styles.privacyNote}>
          <span>🔒</span>
          <span>Contributors only see shared memories. They can never see your private memories.</span>
        </div>
      </div>

      {/* v1.1: Bottom-center success toast — auto-dismisses after TOAST_MS.
          Rendered at screen level so it overlays the content rather than
          displacing form layout. */}
      {toast && (
        <div
          className={styles.toastOverlay}
          role="status"
          aria-live="polite"
        >
          <div className={styles.toast}>
            <span className={styles.toastIcon} aria-hidden="true">✓</span>
            <span>{toast.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
