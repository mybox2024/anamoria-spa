// pages/ReminderPage.jsx — Anamoria SPA
// v1.2 — Session 1A.5 (April 18, 2026)
//
// Changes from v1.1:
//   - Removed the SEEN_FLAG_KEY constant and the markSeen() helper. All
//     sessionStorage reads and writes are gone from this file.
//   - "Yes, remind me" PATCH payload now includes `reminderPromptedAt:
//     new Date().toISOString()`. This records the timestamp in the DB column
//     `spaces.reminder_prompted_at` (migration 015) alongside the four
//     existing reminder fields.
//   - "Not now" converted from a synchronous sessionStorage write to an
//     async PATCH that writes `reminderPromptedAt` only (no change to
//     reminderEnabled — the user has not opted in, they've only been asked).
//     Inline error + retry on failure, same pattern as "Yes".
//   - LovedOneBar back handler receives the same async PATCH treatment as
//     "Not now". Back now commits the user to "prompted" state.
//   - Shared `submitting` flag across Yes / Not now / Back — when any one is
//     in flight, all three are disabled. Handler guards (`if (submitting)
//     return`) provide idempotent double-click / cross-click protection.
//   - Added `aria-busy={submitting}` to the outer page div so assistive tech
//     correctly announces the in-flight state during any of the three PATCHes
//     (LovedOneBar itself does not expose a disabled prop — see File Review
//     Findings v1.1 D9.i).
//
// Why "Not now" and Back now PATCH:
//   The Session 1A design scoped the "seen prompt" flag to sessionStorage,
//   which meant sign-out / tab-close / browser-refresh could re-prompt a user
//   who had already dismissed the question. Session 1A.5 (ADR-038) moves
//   the single source of truth to the DB. That means every path that
//   dismisses this screen — Yes, Not now, or back — must persist the prompt
//   event. Otherwise a user could see the screen, hit back, hit "View all
//   memories" from the next save, and see the same screen again.
//
// Failure-mode posture (per Plan §6.3 + File Review D8b option i):
//   On any PATCH failure, we show an inline error and re-enable the buttons.
//   The user is NOT automatically redirected to the feed on failure — they
//   have expressed intent (Yes, No, or Back) and we owe them a recorded
//   outcome. If the user can't succeed (e.g., airplane mode), they remain on
//   the reminder screen until connectivity returns. This is rare and
//   acceptable.
//
// Route: /spaces/:spaceId/reminder (protected — JWT required)
// Purpose: Reminder opt-in screen shown after a user's first saved memory on
//          a space whose reminder_prompted_at is NULL. Porting the LWC
//          canonical screen from axr_MemoryVaultV2.html (STEP 12 REMINDER
//          SCREEN) to the SPA.
//
// Behavior contract (post-1A.5):
//   - "Yes, remind me" → PATCH /spaces/:id with reminderEnabled=true,
//     reminderDay='Sunday', reminderTime='09:00', reminderTimezone=<browser IANA TZ>,
//     reminderPromptedAt=<now ISO>. On success, navigate to feed. On failure,
//     inline error, re-enable buttons.
//   - "Not now" → PATCH /spaces/:id with reminderPromptedAt=<now ISO> only.
//     On success, navigate to feed. On failure, inline error, re-enable.
//   - LovedOneBar back → same PATCH as "Not now". On success, navigate(-1).
//     On failure, inline error, re-enable.
//
// Memory count for LovedOneBar subtitle (unchanged from v1.1):
//   - Fetched from GET /spaces/:id/memories/count which returns { count: N }.
//     Owner-only count; the reminder screen is always rendered for owners.
//   - Failure falls back silently to "Your space".
//
// Accessibility (unchanged from v1.1 plus aria-busy):
//   - <h1> page heading, <p> subtext, aria-live="polite" error region.
//   - Q3 approved: "Yes, remind me" auto-focused on mount so Enter submits.
//   - aria-busy={submitting} on the outer page div.
//   - All buttons have text labels.
//
// Session scope:
//   - Frontend only. PATCH hits the existing /spaces/:id endpoint. Backend
//     (Session 1A.5 Steps 1–4) already accepts `reminderPromptedAt` in the
//     PATCH whitelist and surfaces it on GET responses.
//   - Email delivery is Session 1B (EventBridge + SES).

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import LovedOneBar from '../components/LovedOneBar';
import styles from './ReminderPage.module.css';

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
  // v1.2: single shared flag across Yes / Not now / Back. When one PATCH
  // is in flight, all three buttons are disabled. Handler guards prevent
  // duplicate invocations from cross-button clicks.
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
  const goToFeed = useCallback(() => {
    navigate(`/spaces/${spaceId}`, { replace: true });
  }, [navigate, spaceId]);

  // ─── "Yes, remind me" handler ──────────────────────────────────────
  const handleYes = useCallback(async () => {
    if (submitting) return; // guard against double-click or cross-button click
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
        // v1.2: record the prompt event in the DB alongside the opt-in fields.
        reminderPromptedAt: new Date().toISOString(),
      });
      goToFeed();
    } catch (err) {
      console.error('Reminder "Yes" PATCH failed:', err);
      // Q4 approved: inline error + retry. Do NOT auto-navigate — the user
      // explicitly said "yes" and a silent dismissal would be misleading.
      setError(
        'Could not save reminder preference. You can try again or enable it later in Settings.'
      );
      setSubmitting(false);
    }
  }, [submitting, getApi, spaceId, goToFeed]);

  // ─── "Not now" handler ─────────────────────────────────────────────
  // v1.2: converted from sync sessionStorage write to async DB PATCH.
  // Writes only reminderPromptedAt — leaves reminderEnabled untouched
  // (the user has not opted in, they've only been asked).
  const handleNotNow = useCallback(async () => {
    if (submitting) return; // guard
    setSubmitting(true);
    setError(null);

    try {
      const api = getApi();
      await api.patch(`/spaces/${spaceId}`, {
        reminderPromptedAt: new Date().toISOString(),
      });
      goToFeed();
    } catch (err) {
      console.error('Reminder "Not now" PATCH failed:', err);
      // Plan §6.3 + File Review D8b option i: inline error + retry.
      // No fallthrough to feed — if the user wants to be recorded as
      // dismissed, the DB must actually record it.
      setError('Could not save. Please try again.');
      setSubmitting(false);
    }
  }, [submitting, getApi, spaceId, goToFeed]);

  // ─── LovedOneBar back handler ──────────────────────────────────────
  // v1.2: back also PATCHes reminderPromptedAt. A user who navigates back
  // from this screen is dismissing the question — we commit that decision
  // to the DB so they aren't re-prompted on the next save.
  const handleBack = useCallback(async () => {
    if (submitting) return; // guard
    setSubmitting(true);
    setError(null);

    try {
      const api = getApi();
      await api.patch(`/spaces/${spaceId}`, {
        reminderPromptedAt: new Date().toISOString(),
      });
      navigate(-1);
    } catch (err) {
      console.error('Reminder back-button PATCH failed:', err);
      setError('Could not save. Please try again.');
      setSubmitting(false);
    }
  }, [submitting, getApi, spaceId, navigate]);

  // ─── Render: loading ───────────────────────────────────────────────
  // Matches SpacePage convention: render nothing while data loads so the
  // previous screen (SuccessScreen) remains visible during the brief fetch.
  if (!space && !loadError) {
    return null;
  }

  // ─── Render: load error ────────────────────────────────────────────
  // Rare path — GET /spaces/:id failure. Give the user a way out without
  // blocking them. Note: the load-error branch does NOT attempt a back-PATCH
  // (we don't have space data to know the space is real / writable). User
  // can navigate back or "Continue to feed" via the ghost button.
  if (loadError) {
    return (
      <div className={styles.page}>
        <LovedOneBar
          spaceName={'Space'}
          spacePhotoUrl={null}
          subtitle=""
          onBack={() => navigate(-1)}
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
  // v1.2: aria-busy={submitting} on the outer page div. Assistive tech
  // announces the busy state during any of the three PATCHes. Sighted
  // users see the primary and secondary buttons already disabled.
  return (
    <div className={styles.page} aria-busy={submitting}>
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
