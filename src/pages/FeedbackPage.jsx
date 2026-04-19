// pages/FeedbackPage.jsx — /spaces/:spaceId/feedback
// v1.0 — Session 2 (April 19, 2026)
//
// Purpose:
//   Post-save feedback opt-in screen. Shown after a qualifying memory save per
//   the post-save gating rules in postSaveGating v1.2 (feedback branch).
//
// Flow (triggered by RecordPage / WritePage / PhotoPage when the gating
// helper returns { redirectTo: 'feedback' }):
//   1. Creation page navigates to `/spaces/:id/feedback` with router state:
//        { triggerContext, memoryType, memoryId, userMemoryCount }
//   2. FeedbackPage fetches space, renders heading + three mood cards + CTAs
//   3. User selects mood, presses Submit
//   4. POST /feedback with full payload (space + mood + trigger context +
//      sessionTag + device type)
//   5. On success: show "Thanks for sharing" toast for 3s, navigate to feed
//   6. On error: silent fallthrough (console.error + navigate to feed) per Q4
//
// Session 2 scope:
//   Per Plan v1.2 §8.1 + Master Plan v1.1 Addendum: owner-only. Contributors
//   are out of MVP. No textarea (R2 removed). No contributor gating.
//
// Locked decisions (Plan v1.2):
//   - Heading text: "How did that feel?"
//   - Subtext:      "Your feedback shapes what comes next"
//   - Moods:        😊 "It helped" / 😐 "Okay" / 😞 "Difficult"
//   - Primary CTA:  "Submit" (or "Sending…" during POST)
//   - Skip CTA:     "Not right now"
//   - Toast:        "Thanks for sharing", 3000ms (Option B session decision)
//   - Back:         navigates to feed (same behavior as skip)
//
// Dependencies:
//   - api/client.js v1.1 — createApiClient factory, JSON auto-serialize, normalized errors
//   - components/LovedOneBar.jsx v1.1 — header; FeedbackPage owns h1 (LovedOneBar has none)
//   - components/Toast.jsx v1.0 — controlled Toast; parent owns visibility
//   - pages/FeedbackPage.module.css v1.0 — shared sibling classes + mood-specific classes
//   - App.jsx v1.10 (forthcoming) — provides `sessionTag` via AppContext
//
// IMPORTANT: sessionTag is read defensively. If AppContext lacks it (e.g.
// if App.jsx v1.10 is not yet deployed alongside this file), sessionTag will
// be undefined, the POST will fail Lambda validation, and the catch block
// will route the user to the feed. This is acceptable short-term safety; the
// two files are intended to be deployed as a batch.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import { useAppContext } from '../App';
import LovedOneBar from '../components/LovedOneBar';
import Toast from '../components/Toast';
import styles from './FeedbackPage.module.css';

// ─── Constants ──────────────────────────────────────────────────────

const TOAST_DURATION_MS = 3000;       // Option B session decision
const POST_TOAST_NAV_MS = TOAST_DURATION_MS; // navigate after toast dwells

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Infer device type from user agent. Feeds into `user_feedback.device_type`.
 * Lambda accepts: 'mobile' | 'tablet' | 'desktop' | null.
 *
 * Tablet check comes FIRST because iPad/Android-tablet UA strings usually
 * also contain 'Mobi' — we don't want to misclassify them as phones.
 */
function resolveDeviceType() {
  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
  if (/Tablet|iPad/i.test(ua)) return 'tablet';
  if (/Mobi|Android/i.test(ua)) return 'mobile';
  return 'desktop';
}

// ─── Component ──────────────────────────────────────────────────────

export default function FeedbackPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessTokenSilently } = useAuth0();

  // Defensive context read. If App.jsx v1.10 hasn't shipped yet, context may
  // lack `sessionTag` — we don't throw; the POST will fail Lambda validation
  // and the error path routes to feed (acceptable short-term failure mode).
  const { sessionTag } = useAppContext() || {};

  // Memoized API factory. Same pattern as RecordPage v5.3.
  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  // ─── Router state extraction ──────────────────────────────────────
  // Plan v1.2 Q5 locks: memoryId + memoryType + triggerContext + userMemoryCount
  // all arrive via location.state. triggerContext is the only field REQUIRED
  // for a valid Lambda POST. Others may be null/optional.
  const routerState = location.state || {};
  const triggerContext = routerState.triggerContext || null;
  const memoryId = routerState.memoryId || null;
  const memoryType = routerState.memoryType || null;
  const userMemoryCount = typeof routerState.userMemoryCount === 'number'
    ? routerState.userMemoryCount
    : 0;

  // ─── State ───────────────────────────────────────────────────────
  const [space, setSpace] = useState(null);
  const [selectedMood, setSelectedMood] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);

  // Refs for focus and for cleanup of the post-toast navigation timer.
  const firstMoodRef = useRef(null);
  const navTimerRef = useRef(null);

  // ─── Effect 1 — direct-URL-load guard ────────────────────────────
  // Per Handoff §5.1: if the page is loaded without triggerContext in router
  // state (bookmark, refresh, deep-link), redirect to feed immediately.
  // Don't try to be clever — there's no valid POST we could construct.
  useEffect(() => {
    if (!triggerContext) {
      console.warn(
        '[FeedbackPage] loaded without triggerContext in router state; redirecting to feed'
      );
      navigate(`/spaces/${spaceId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Effect 2 — fetch space on mount ─────────────────────────────
  // Same pattern as ReminderPage v1.2 / SpacePage: GET /spaces/:id.
  // If the fetch fails, we surface a recoverable error via .error banner;
  // user can still Skip / Back to feed.
  useEffect(() => {
    // Short-circuit if we're already navigating away (no triggerContext).
    if (!triggerContext) return undefined;

    let cancelled = false;
    async function load() {
      try {
        const api = getApi();
        const data = await api.get(`/spaces/${spaceId}`);
        if (!cancelled) setSpace(data);
      } catch (err) {
        console.error('[FeedbackPage] space load error:', err);
        if (!cancelled) {
          setLoadError('Something went wrong loading this screen. You can skip or go back.');
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId, getApi, triggerContext]);

  // ─── Effect 3 — auto-focus first mood button on space load ───────
  // Plan v1.2 accessibility note. Mirrors ReminderPage v1.2 pattern of
  // focusing the primary action once the screen is ready.
  useEffect(() => {
    if (space && firstMoodRef.current) {
      firstMoodRef.current.focus();
    }
  }, [space]);

  // ─── Effect 4 — nav timer cleanup on unmount ─────────────────────
  // If the user somehow unmounts the component before the post-toast
  // navigation fires (browser back, tab close, etc), clear the timer so
  // we don't attempt a navigate on an unmounted component.
  useEffect(() => {
    return () => {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
        navTimerRef.current = null;
      }
    };
  }, []);

  // ─── Handlers ────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (submitting || !selectedMood) return;
    setSubmitting(true);
    try {
      const api = getApi();
      await api.post('/feedback', {
        spaceId,
        memoryId,
        memoryType,
        triggerContext,
        mood: selectedMood,
        sessionTag,                      // from AppContext (App.jsx v1.10)
        userMemoryCount,
        deviceType: resolveDeviceType(),
      });
      // Show toast; navigate after toast duration.
      setToastVisible(true);
      navTimerRef.current = setTimeout(() => {
        navigate(`/spaces/${spaceId}`, { replace: true });
      }, POST_TOAST_NAV_MS);
    } catch (err) {
      // Q4: silent fallthrough. Log and navigate to feed. User is never stuck.
      console.error('[FeedbackPage] feedback POST failed (silent fallthrough):', err);
      navigate(`/spaces/${spaceId}`, { replace: true });
    }
  }, [
    submitting,
    selectedMood,
    spaceId,
    memoryId,
    memoryType,
    triggerContext,
    sessionTag,
    userMemoryCount,
    getApi,
    navigate,
  ]);

  const handleSkip = useCallback(() => {
    // Q3: no-op; next save re-evaluates gating. Just navigate.
    navigate(`/spaces/${spaceId}`, { replace: true });
  }, [navigate, spaceId]);

  const handleBack = useCallback(() => {
    // Same as skip — user chose not to provide feedback, return to feed.
    navigate(`/spaces/${spaceId}`, { replace: true });
  }, [navigate, spaceId]);

  // ─── Early-return guards ─────────────────────────────────────────

  // If triggerContext missing, effect 1 has already issued the redirect.
  // Return null to avoid rendering anything in the interim frame.
  if (!triggerContext) return null;

  // If space hasn't loaded yet, render null (ReminderPage convention —
  // previous page stays visible; no skeleton). If we hit a load error, we
  // still render the page so the user can Skip / Back.
  if (!space && !loadError) return null;

  // ─── Class helpers ───────────────────────────────────────────────

  function moodClass(value) {
    return `${styles.moodBtn} ${selectedMood === value ? styles.moodSelected : ''}`;
  }

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div aria-busy={submitting} className={styles.page}>
      <LovedOneBar
        spaceName={space?.name || ''}
        spacePhotoUrl={space?.photoUrl}
        subtitle="Share a thought"
        onBack={handleBack}
        backLabel="Back to feed"
      />

      <main className={styles.content}>
        <h1 className={styles.heading}>How did that feel?</h1>
        <p className={styles.subtext}>Your feedback shapes what comes next</p>

        {loadError && (
          <div className={styles.error} role="alert">
            {loadError}
          </div>
        )}

        {/* Mood selection — three cards, click to select, aria-pressed toggle */}
        <div className={styles.moodRow} role="group" aria-label="Feedback mood">
          <button
            ref={firstMoodRef}
            type="button"
            className={moodClass('positive')}
            onClick={() => setSelectedMood('positive')}
            aria-pressed={selectedMood === 'positive'}
            aria-label="It helped"
            disabled={submitting}
          >
            <span className={styles.moodEmoji} aria-hidden="true">😊</span>
            <span className={styles.moodLabel}>It helped</span>
          </button>

          <button
            type="button"
            className={moodClass('neutral')}
            onClick={() => setSelectedMood('neutral')}
            aria-pressed={selectedMood === 'neutral'}
            aria-label="Okay"
            disabled={submitting}
          >
            <span className={styles.moodEmoji} aria-hidden="true">😐</span>
            <span className={styles.moodLabel}>Okay</span>
          </button>

          <button
            type="button"
            className={moodClass('negative')}
            onClick={() => setSelectedMood('negative')}
            aria-pressed={selectedMood === 'negative'}
            aria-label="Difficult"
            disabled={submitting}
          >
            <span className={styles.moodEmoji} aria-hidden="true">😞</span>
            <span className={styles.moodLabel}>Difficult</span>
          </button>
        </div>

        {/* CTAs */}
        <div className={styles.ctas}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleSubmit}
            disabled={!selectedMood || submitting}
          >
            {submitting ? 'Sending…' : 'Submit'}
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={handleSkip}
            disabled={submitting}
          >
            Not right now
          </button>
        </div>
      </main>

      <Toast
        message="Thanks for sharing"
        visible={toastVisible}
        durationMs={TOAST_DURATION_MS}
        onDismiss={() => setToastVisible(false)}
      />
    </div>
  );
}
