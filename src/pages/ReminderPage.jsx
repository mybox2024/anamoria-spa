// pages/ReminderPage.jsx — Anamoria SPA
// v1.1 — Session 1A (April 18, 2026)
//
// Changes from v1.0:
//   - Subtitle memory count now fetched from GET /spaces/:id/memories/count
//     in parallel with GET /spaces/:id (pattern copied from SpacePage v2.14,
//     lines 180-191). v1.0 read `space.memories`/`space.memoryCount` which do
//     not exist on the response shape. Discovered during Session 1A file
//     review — see Anamoria_Session_1A_Session_Log (when produced).
//   - No other behavior changes. All v1.0 comments retained.
//
// Route: /spaces/:spaceId/reminder (protected — JWT required)
// Purpose: Reminder opt-in screen shown after a user's first saved memory when
//          their space has reminderEnabled=false AND they haven't dismissed the
//          prompt in this session. Porting the LWC canonical screen from
//          axr_MemoryVaultV2.html (STEP 12 REMINDER SCREEN) to the SPA.
//
// Behavior contract (locked in Reminder/Feedback/ContributorFeed Master Plan v1.0):
//   - "Yes, remind me" → PATCH /spaces/:id with reminderEnabled=true,
//     reminderDay='Sunday', reminderTime='09:00', reminderTimezone=<browser IANA TZ>
//     Then sessionStorage.setItem('ana_reminderPromptSeen','1') and navigate to feed.
//   - "Not now" → no PATCH, sessionStorage flag set, navigate to feed.
//   - LovedOneBar back button → sessionStorage flag set, navigate(-1) (back to
//     SuccessScreen; user can still click any CTA).
//   - PATCH failure (Q4 approved: inline error + retry) → display inline error,
//     re-enable the Yes button, allow retry or "Not now". Never auto-navigate on
//     failure because the user's explicit intent was "Yes, remind me".
//
// Memory count for LovedOneBar subtitle:
//   - Fetched from GET /spaces/:id/memories/count which returns { count: N }.
//     This is OWNER-ONLY count (same endpoint SpacePage uses for B7 soft gate).
//     On this reminder screen the owner is the only user who will see it, so
//     owner-only count is the correct figure.
//   - Failure to fetch count falls back silently to "Your space" — the reminder
//     prompt must still render even if the count endpoint is slow or down.
//
// File Review Findings (v1.0, D2 approved):
//   - LovedOneBar renders spaceName inside a <span>, not an <h1>. ReminderPage
//     owns the page-level <h1> ("Would you like a reminder?").
//
// Accessibility:
//   - <h1> page heading, <p> subtext, aria-live="polite" error region.
//   - Q3 approved: "Yes, remind me" auto-focused on mount so Enter submits.
//   - All buttons have text labels (no icon-only).
//
// Session scope:
//   - Frontend only. This file consumes the existing PATCH /spaces/:id endpoint
//     via the existing api.patch() helper (client.js v1.1). No backend changes.
//   - Email delivery is Session 1B (EventBridge + SES). That work is NOT started
//     until Session 1A is verified and its session log is complete.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import LovedOneBar from '../components/LovedOneBar';
import styles from './ReminderPage.module.css';

// SessionStorage key shared with RecordPage/WritePage/PhotoPage gating logic.
// Changing this string requires updating postSaveGating.js and the 3 creation
// pages in the same change set.
const SEEN_FLAG_KEY = 'ana_reminderPromptSeen';

export default function ReminderPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();

  // Memoized API client — mirrors RecordPage + SpacePage pattern.
  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  // ─── Space data + memory count ─────────────────────────────────────
  const [space, setSpace] = useState(null);
  const [memoryCount, setMemoryCount] = useState(null); // null = unknown (fallback to "Your space")
  const [loadError, setLoadError] = useState(null);

  // ─── Submit state ──────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // ─── Focus target for Q3 (auto-focus primary button on mount) ──────
  const primaryBtnRef = useRef(null);

  // ─── Load space + memory count in parallel (mirrors SpacePage v2.14) ─
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const api = getApi();
        // Parallel fetch — same pattern as SpacePage v2.14 lines 180-187.
        // The count endpoint is tolerated with a .catch fallback so a count
        // failure never blocks the reminder screen from rendering.
        const [spaceData, countData] = await Promise.all([
          api.get(`/spaces/${spaceId}`),
          api.get(`/spaces/${spaceId}/memories/count`).catch(() => ({ count: null })),
        ]);
        if (!cancelled) {
          setSpace(spaceData);
          // Count endpoint returns { count: N }. If the request failed (caught
          // above), countData.count is null → subtitle falls back to "Your space".
          setMemoryCount(
            typeof countData?.count === 'number' ? countData.count : null
          );
        }
      } catch (err) {
        console.error('ReminderPage space load error:', err);
        if (!cancelled) {
          setLoadError(
            'Could not load this space. You can go back or try again.'
          );
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [spaceId, getApi]);

  // ─── Auto-focus primary button once space has loaded (Q3 approved) ─
  // Focus after space load rather than on initial mount because the page
  // returns null while space is loading — there's no button to focus yet.
  useEffect(() => {
    if (space && primaryBtnRef.current) {
      primaryBtnRef.current.focus();
    }
  }, [space]);

  // ─── Helpers ───────────────────────────────────────────────────────
  const markSeen = useCallback(() => {
    try {
      sessionStorage.setItem(SEEN_FLAG_KEY, '1');
    } catch (err) {
      // sessionStorage can fail in edge cases (private modes, quota). Safe
      // to swallow — worst case the user sees the prompt once more, no data
      // loss. Logging for diagnostics.
      console.warn('[ReminderPage] sessionStorage.setItem failed:', err);
    }
  }, []);

  const goToFeed = useCallback(() => {
    navigate(`/spaces/${spaceId}`, { replace: true });
  }, [navigate, spaceId]);

  // ─── "Yes, remind me" handler ──────────────────────────────────────
  const handleYes = useCallback(async () => {
    if (submitting) return; // guard against double-click
    setSubmitting(true);
    setError(null);

    // Browser IANA timezone, with a safe fallback. Intl.DateTimeFormat is
    // supported in every target browser for this pilot (Chrome, Safari,
    // Firefox, Edge). Fallback preserves a valid PATCH shape if the API
    // happens to return an undefined timeZone on some exotic setup.
    const tz =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

    try {
      const api = getApi();
      await api.patch(`/spaces/${spaceId}`, {
        reminderEnabled: true,
        reminderDay: 'Sunday',
        reminderTime: '09:00',
        reminderTimezone: tz,
      });
      markSeen();
      goToFeed();
    } catch (err) {
      console.error('Reminder PATCH failed:', err);
      // Q4 approved: inline error + retry. Do NOT auto-navigate — the user
      // explicitly said "yes" and a silent dismissal would be misleading.
      setError(
        'Could not save reminder preference. You can try again or enable it later in Settings.'
      );
      setSubmitting(false);
    }
  }, [submitting, getApi, spaceId, markSeen, goToFeed]);

  // ─── "Not now" handler ─────────────────────────────────────────────
  const handleNotNow = useCallback(() => {
    markSeen();
    goToFeed();
  }, [markSeen, goToFeed]);

  // ─── LovedOneBar back handler ──────────────────────────────────────
  // Back still marks as seen so the user isn't re-prompted if they navigate
  // forward again in the same session without saving a new memory.
  const handleBack = useCallback(() => {
    markSeen();
    navigate(-1);
  }, [markSeen, navigate]);

  // ─── Render: loading ───────────────────────────────────────────────
  // Matches SpacePage convention: render nothing while data loads so the
  // previous screen (SuccessScreen) remains visible during the brief fetch.
  if (!space && !loadError) {
    return null;
  }

  // ─── Render: load error ────────────────────────────────────────────
  // Rare path — GET /spaces/:id failure. Give the user a way out without
  // blocking them.
  if (loadError) {
    return (
      <div className={styles.page}>
        <LovedOneBar
          spaceName={'Space'}
          spacePhotoUrl={null}
          subtitle=""
          onBack={handleBack}
          backLabel="Back"
        />
        <div className={styles.content}>
          <p className={styles.error} role="alert">{loadError}</p>
          <div className={styles.ctas}>
            <button className={styles.btnGhost} onClick={goToFeed}>
              Continue to feed
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Derived values ────────────────────────────────────────────────
  // Q2 approved: subtitle shows memory count for LovedOneBar consistency.
  // memoryCount is owner-only (GET /spaces/:id/memories/count). On this screen
  // the viewer is always the owner, so owner-only is the correct figure. If the
  // count endpoint failed (countData.count === null), fall back to "Your space".
  let subtitle;
  if (typeof memoryCount === 'number') {
    subtitle = memoryCount === 1 ? '1 memory' : `${memoryCount} memories`;
  } else {
    subtitle = 'Your space';
  }

  // ─── Render: main screen ───────────────────────────────────────────
  return (
    <div className={styles.page}>
      <LovedOneBar
        spaceName={space.name}
        spacePhotoUrl={space.photoUrl}
        subtitle={subtitle}
        onBack={handleBack}
        backLabel="Back"
      />

      <div className={styles.content}>
        <div className={styles.iconWrap}>
          <div className={styles.iconCircle} aria-hidden="true">
            {/* Bell icon — sage-colored via CSS var `color: var(--color-sage-dark)`
                applied to .iconCircle; stroke="currentColor" inherits that. */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
        </div>

        <h1 className={styles.heading}>Would you like a reminder?</h1>
        <p className={styles.subtext}>
          We'll send you a weekly prompt to help you remember.
        </p>

        {/* aria-live polite region for PATCH failure messaging */}
        {error && (
          <p className={styles.error} role="alert" aria-live="polite">
            {error}
          </p>
        )}

        <div className={styles.ctas}>
          <button
            ref={primaryBtnRef}
            className={styles.btnPrimary}
            onClick={handleYes}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Yes, remind me'}
          </button>
          <button
            className={styles.btnGhost}
            onClick={handleNotNow}
            disabled={submitting}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
