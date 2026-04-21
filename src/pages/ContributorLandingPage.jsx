// ContributorLandingPage.jsx — /invite/:token
// v1.1 — Session 3 (April 19, 2026)
//
// Changes from v1.0:
//   1. I3.12 — Error code mismatch fix (real bug):
//      Lambda handleValidateToken returns TOKEN_ALREADY_USED on a used invite
//      (see anamoria-contributors/index.mjs handleValidateToken at the 410
//      branch). Client v1.0 checked for TOKEN_ALREADY_CLAIMED which never
//      matched, so every "already used" error fell through to the generic
//      "Something went wrong" copy. v1.1 fixes both error checks (validate
//      + handleClaim) to look for TOKEN_ALREADY_USED.
//
//   2. I3.4 — Privacy copy addition:
//      Added "Anamoria staff cannot view contributions without the owner's
//      permission." to the privacyNote, per GDPR Article 13 (inform data
//      subjects of processing at or before collection). LWC had this
//      language; AWS v1.0 lost it.
//
//   3. I3.9 — WCAG 2.2 AA accessibility:
//      - Added aria-label to primary claim button (dynamic, references
//        space name for context so screen readers announce what the action
//        will do).
//      - Added role="alert" + aria-live="polite" to errorBanner so screen
//        readers announce claim failures when they appear. No visual focus
//        is moved (single-screen flow; shifting sighted focus would be
//        disorienting).
//
// No changes to: publicFetch helper, useEffect structure, handleClaim logic,
//   sessionStorage operations, navigate behavior, loading/success render,
//   or any CSS module class.
//
// Original purpose (unchanged): No auth required. Validates invite token,
// shows space name + contributor name. On claim: receives session token,
// stores in sessionStorage, redirects to /contribute/:spaceId.
// APIs: GET /invite/:token (public via API key),
//       POST /invite/:token/claim (public via API key)

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import config from '../config';
import styles from './ContributorLandingPage.module.css';

// Direct fetch for public routes (no JWT, uses API key)
async function publicFetch(path, options = {}) {
  const url = `${config.apiUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    mode: 'cors',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, ...(options.headers || {}) },
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : {};
  if (!res.ok) throw { error: data.error || 'REQUEST_FAILED', status: res.status };
  return data;
}

export default function ContributorLandingPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState(null);

  // Validate token on mount
  useEffect(() => {
    let cancelled = false;
    async function validate() {
      try {
        const data = await publicFetch(`/invite/${token}`, { method: 'GET' });
        if (!cancelled) setInvite(data);
      } catch (err) {
        if (err.error === 'INVALID_TOKEN') {
          setError('This invite link is not valid.');
        } else if (err.error === 'TOKEN_ALREADY_USED') {
          // v1.1 (I3.12): fixed from TOKEN_ALREADY_CLAIMED to match Lambda response
          setError('This invite has already been used.');
        } else {
          setError('Something went wrong. Please try the link again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    validate();
    return () => { cancelled = true; };
  }, [token]);

  const handleClaim = useCallback(async () => {
    if (claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const data = await publicFetch(`/invite/${token}/claim`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      // Store session token for contributor auth
      sessionStorage.setItem('ana_sessionToken', data.sessionToken);
      sessionStorage.setItem('ana_contributorName', data.contributorName);
      sessionStorage.setItem('ana_spaceId', data.spaceId);
      sessionStorage.setItem('ana_spaceName', data.spaceName);
      // Navigate to contributor home page
      navigate(`/contribute/${data.spaceId}`, { replace: true });
    } catch (err) {
      if (err.error === 'TOKEN_ALREADY_USED') {
        // v1.1 (I3.12): fixed from TOKEN_ALREADY_CLAIMED to match Lambda response
        setError('This invite has already been used.');
      } else {
        setError("Couldn't claim invite. Please try again.");
      }
      setClaiming(false);
    }
  }, [token, claiming, navigate]);

  if (loading) {
    return <div className={styles.loading}><div className={styles.loadingDot} /><span>Loading invite...</span></div>;
  }

  if (error && !invite) {
    return (
      <div className={styles.screen}>
        <div className={styles.card}>
          <span className={styles.logo}>Anamoria</span>
          <div className={styles.errorIcon}>⚠️</div>
          <p className={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <span className={styles.logo}>Anamoria</span>
        <h1 className={styles.title}>You've been invited</h1>
        <p className={styles.subtitle}>
          to add a memory to <strong>{invite?.spaceName}</strong>'s space
        </p>

        <div className={styles.welcomeBox}>
          <p className={styles.welcomeName}>Hi {invite?.contributorName},</p>
          <p className={styles.welcomeText}>
            Someone special wants to hear from you. Share a voice note, write a memory, or add a photo — whatever feels right.
          </p>
        </div>

        {/* v1.1 (I3.9): role="alert" + aria-live="polite" so screen readers
            announce the error when it appears. */}
        {error && (
          <div className={styles.errorBanner} role="alert" aria-live="polite">
            {error}
          </div>
        )}

        <button
          className={styles.btnPrimary}
          onClick={handleClaim}
          disabled={claiming}
          /* v1.1 (I3.9): descriptive aria-label so screen readers announce
             the specific action rather than just the visible button text. */
          aria-label={
            claiming
              ? 'Getting ready, please wait'
              : `Start contributing memories to ${invite?.spaceName || 'this'}'s space`
          }
        >
          {claiming ? 'Getting ready...' : 'Start adding memories'}
        </button>

        {/* v1.1 (I3.4): added "Anamoria staff cannot view contributions..."
            sentence per GDPR Article 13 — data subjects informed of
            processing access at/before collection. */}
        <div className={styles.privacyNote}>
          <span>🔒</span>
          <span>
            This is a private space. Only invited people can see what's shared here. Anamoria staff cannot view contributions without the owner's permission.
          </span>
        </div>
      </div>
    </div>
  );
}
