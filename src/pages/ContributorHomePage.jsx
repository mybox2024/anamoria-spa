// pages/ContributorHomePage.jsx — Anamoria SPA
// v1.0 — Session 3 (April 19, 2026)
//
// Contributor landing page. Reached after claim flow (sessionStorage has
// ana_sessionToken) or directly via /contribute/:spaceId. Ported from LWC
// axr_MemoryVaultV2.html contributor-landing-screen block (v2.9 "with View
// Memories") and axr_MemoryVaultV2.css contributor-landing-screen styles.
//
// Route: /contribute/:spaceId
//
// Visual structure:
//   [cream background, centered]
//     Avatar (110px circle, space initial or photo)
//     "You've been invited to contribute"
//     "Share your memories of {spaceName}"
//     [Record a voice note] — primary sage pill
//     [Write a memory]       — secondary outline
//     or
//     View shared memories →  (link)
//     "Your memories will be shared with the space owner"
//
// Actions:
//   Record → /contribute/:spaceId/record (Step 9 ContributorRecordPage)
//   Write → /contribute/:spaceId/write (Step 7 ContributorWritePage)
//   View shared memories → /contribute/:spaceId/memories (Screen 2 — ContributorFeedPage)
//
// Auth:
//   Requires ana_sessionToken in sessionStorage. If missing → redirect to
//   /invite-expired or similar fallback (Session 3 scope: display error).
//
// Session 3 Plan alignment:
//   - Plan v1.1 specified a single ContributorFeedPage v2.0. The LWC reference
//     design (per uploaded screenshots and axr_MemoryVaultV2) actually has
//     TWO screens: landing (this file) + feed. This file is a scope expansion
//     documented in the upcoming Session 3 Part 2 session log.

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createContributorApiClient, getSessionToken } from '../api/contributorApi';
import styles from './ContributorHomePage.module.css';

/* ─── Inline SVG icons (matched to LWC axr_MemoryVaultV2.html btn-icon markup) ─── */

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path
        className={styles.svgFill}
        d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"
      />
      <path d="M18 10.5v.5a6 6 0 0 1-12 0v-.5" strokeWidth="1.5" stroke="currentColor" />
      <path d="M12 17v4" strokeWidth="1.5" stroke="currentColor" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7l-3-3-12.5 12.5L3 21l4.5-1.5L20 7z" strokeWidth="1.5" stroke="currentColor" />
      <path d="M15 6l3 3" strokeWidth="1.5" stroke="currentColor" />
      <circle className={styles.svgFill} cx="18.5" cy="5.5" r="1" />
    </svg>
  );
}

/* ═══════════════════════════════════════
   CONTRIBUTOR HOME PAGE
   ═══════════════════════════════════════ */

export default function ContributorHomePage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();

  const [space, setSpace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* ─── Validate session + fetch space ─── */
  useEffect(() => {
    // Guard: no session token means the contributor hasn't claimed or session was cleared.
    const token = getSessionToken();
    if (!token) {
      setError('Your session has expired. Please use your invite link again.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const api = createContributorApiClient();
        const data = await api.get(`/contribute/${spaceId}`);
        if (cancelled) return;
        setSpace(data);
      } catch (err) {
        if (cancelled) return;
        if (err.error === 'INVALID_SESSION' || err.error === 'NO_SESSION_TOKEN') {
          setError('Your session has expired. Please use your invite link again.');
        } else {
          setError('Could not load this space.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId]);

  /* ─── Action handlers ─── */

  function handleRecord() {
    navigate(`/contribute/${spaceId}/record`);
  }

  function handleWrite() {
    navigate(`/contribute/${spaceId}/write`);
  }

  function handleViewFeed() {
    navigate(`/contribute/${spaceId}/memories`);
  }

  /* ─── Render states ─── */

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingDot} />
        <span>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorScreen}>
        <div className={styles.content}>
          <p className={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  const spaceName = space?.spaceName || 'this space';
  const initial = (spaceName || '?').charAt(0).toUpperCase();

  return (
    <div className={styles.screen}>
      <div className={styles.content}>

        {/* Avatar */}
        <div className={styles.avatarWrap}>
          {space?.photoUrl ? (
            <img
              src={space.photoUrl}
              alt={spaceName}
              className={styles.avatarImg}
            />
          ) : (
            <div className={styles.avatarPlaceholder}>{initial}</div>
          )}
        </div>

        {/* Title */}
        <h1 className={styles.title}>You've been invited to contribute</h1>

        {/* Subtitle */}
        <p className={styles.subtitle}>
          Share your memories of <strong>{spaceName}</strong>
        </p>

        {/* Primary + secondary action buttons */}
        <div className={styles.actions}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleRecord}
            aria-label={`Record a voice note for ${spaceName}`}
          >
            <span className={styles.btnIcon}><MicIcon /></span>
            Record a voice note
          </button>

          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={handleWrite}
            aria-label={`Write a memory for ${spaceName}`}
          >
            <span className={styles.btnIcon}><PenIcon /></span>
            Write a memory
          </button>
        </div>

        {/* View memories section */}
        <div className={styles.viewMemoriesSection}>
          <p className={styles.viewMemoriesDivider}>or</p>
          <button
            type="button"
            className={styles.viewMemoriesLink}
            onClick={handleViewFeed}
          >
            View shared memories →
          </button>
        </div>

        {/* Footer note */}
        <p className={styles.note}>
          Your memories will be shared with the space owner
        </p>
      </div>
    </div>
  );
}
