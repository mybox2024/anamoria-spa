// pages/ContributorFeedPage.jsx — Anamoria SPA
// v2.0 — Session 3 (April 19, 2026)
//
// Contributor feed screen. Reached via "View shared memories →" link from
// ContributorHomePage (Screen 1). Back chevron returns to ContributorHomePage.
//
// Route: /contribute/:spaceId/memories
//
// Ported from LWC axr_MemoryVaultV2.html contributor-feed-screen (v2.9) +
// axr_MemoryVaultV2.css contributor-space-header, contributor-banner,
// contributor-feed-screen blocks.
//
// Changes from v1.0 (current deployed):
//   - Route changed from /contribute/:spaceId to /contribute/:spaceId/memories
//     (root /contribute/:spaceId is now ContributorHomePage).
//   - Removed inline sessionFetch helper — uses createContributorApiClient() from
//     api/contributorApi.js instead.
//   - Removed custom inline card rendering — delegates to ContributorMemoryFeed
//     component (Step 4 deliverable, uses MemoryFeed.module.css via B2 reuse).
//   - Removed inline CTA buttons — capture actions now in ContributorBottomNav
//     (Step 3 deliverable).
//   - New header structure: back chevron + avatar + space name + "Shared Memories"
//     subtitle (replaces old "ANAMORIA" logo + space name + "Welcome, {name}").
//   - New contribution banner below header: "You're contributing to {spaceName}'s
//     memory space" (sage gradient, full-width).
//   - Uses camelCase response fields from Lambda v1.2 (spaceName, contributorName,
//     photoUrl) per B1 response shape changes.
//
// Auth: Requires ana_sessionToken in sessionStorage. Redirects to error state
// if missing. See createContributorApiClient for token handling.
//
// Layout:
//   [screen]
//     [contributor-space-header: ←  [avatar] Space name / "Shared Memories"]
//     [contribution-banner: 👥 "You're contributing to X's memory space"]
//     [ContributorMemoryFeed — masonry, handles empty state]
//   [ContributorBottomNav — Record / Write / Photo]

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createContributorApiClient, getSessionToken } from '../api/contributorApi';
import ContributorMemoryFeed from '../components/ContributorMemoryFeed';
import ContributorBottomNav from '../components/ContributorBottomNav';
import styles from './ContributorFeedPage.module.css';

/* ─── Inline SVG icons ─── */

function BackArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ContributorsIcon() {
  // People icon matching the LWC banner decoration — two overlapping user shapes.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/* ═══════════════════════════════════════
   CONTRIBUTOR FEED PAGE
   ═══════════════════════════════════════ */

export default function ContributorFeedPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();

  const [space, setSpace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Stable getApi for ContributorMemoryFeed — factory pattern mirrors owner SpacePage
  // which calls createApiClient(getAccessTokenSilently) inside useCallback.
  const getApi = useCallback(() => createContributorApiClient(), []);

  /* ─── Validate session + fetch space metadata ─── */
  useEffect(() => {
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

  /* ─── Back to ContributorHomePage (Screen 1) ─── */
  const handleBack = useCallback(() => {
    navigate(`/contribute/${spaceId}`);
  }, [navigate, spaceId]);

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
        <p className={styles.errorText}>{error}</p>
      </div>
    );
  }

  const spaceName = space?.spaceName || 'this space';
  const initial = (spaceName || '?').charAt(0).toUpperCase();

  return (
    <div className={styles.screen}>

      {/* ─── Space header: back + avatar + name + "Shared Memories" ─── */}
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={handleBack}
          aria-label="Back"
        >
          <BackArrowIcon />
        </button>

        <div className={styles.avatar}>
          {space?.photoUrl ? (
            <img
              src={space.photoUrl}
              alt={spaceName}
              className={styles.avatarImg}
            />
          ) : (
            <span className={styles.avatarPlaceholder}>{initial}</span>
          )}
        </div>

        <div className={styles.spaceInfo}>
          <h1 className={styles.spaceName}>{spaceName}</h1>
          <p className={styles.spaceSubtitle}>Shared Memories</p>
        </div>
      </header>

      {/* ─── Contribution banner ─── */}
      <div className={styles.banner}>
        <span className={styles.bannerIcon}><ContributorsIcon /></span>
        <span className={styles.bannerText}>
          You're contributing to {spaceName}'s memory space
        </span>
      </div>

      {/* ─── Masonry feed (empty state handled inside component) ─── */}
      <main className={styles.main}>
        <ContributorMemoryFeed
          spaceId={spaceId}
          getApi={getApi}
        />
      </main>

      {/* ─── Bottom nav: Record / Write / Photo ─── */}
      <ContributorBottomNav spaceId={spaceId} />

    </div>
  );
}
