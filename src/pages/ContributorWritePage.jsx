// pages/ContributorWritePage.jsx — Anamoria SPA
// v1.0 — Session 3 (April 19, 2026)
//
// Contributor text capture page. Parallel to owner WritePage.jsx v1.4 but
// adapted for contributor context.
//
// Route: /contribute/:spaceId/write
//
// CSS: Reuses WritePage.module.css per Session 3 Plan v1.1 decision B2
// (new component, shared CSS module). Zero CSS duplication.
//
// Differences from owner WritePage.jsx v1.4:
//   - Auth: createContributorApiClient (session token) instead of Auth0 JWT
//   - Space fetch: GET /contribute/:spaceId instead of /spaces/:id
//   - Save: POST /contribute/:spaceId/memories with {type:'text', title, note}
//     (no isPrivate field — Lambda hardcodes FALSE for contributor memories
//     per Session 3 Plan v1.1 decision — contributors always share)
//   - Prompts: hardcoded generic "Share a memory of {spaceName}" per
//     Session 3 decision P2. Backend has no /contribute/:spaceId/prompt
//     route, and adding one is not in scope for Session 3. No
//     prompt/advance or prompt/respond calls.
//   - No "Try a different prompt" skip link — there's no prompt to advance.
//   - No privacy toggle in review screen — contributor memories always shared.
//   - No SuccessScreen after save — shows a saved pill toast per Session 3
//     decision S2+Q2-revised, then navigates to /contribute/:spaceId/memories.
//     Rationale: avoids SuccessScreen bottom-nav ownership issue (RK-4) and
//     matches existing toast pattern from InvitePage v1.1 session log.
//   - No post-save gating (reminder/feedback) — contributor flow has none.
//   - Cancel button navigates to /contribute/:spaceId/memories (feed).
//
// Structure preserved from owner:
//   compose → review → save → navigate (no separate success step)
//   Title input + textarea + DictateButton
//   Character counter (10,000 limit same as owner)
//   Review preview before save
//
// DictateButton: included per Session 3 Plan v1.1 OI-1 default.
// Same component as owner; uses browser SpeechRecognition, no backend call.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createContributorApiClient, getSessionToken } from '../api/contributorApi';
import DictateButton from '../components/DictateButton';
import styles from './WritePage.module.css';

const MAX_CHARS = 10000;

// Toast dismiss duration — matches InvitePage v1.1 toast pattern (~3s).
const TOAST_DURATION_MS = 2500;

/* ═══════════════════════════════════════
   CONTRIBUTOR WRITE PAGE
   ═══════════════════════════════════════ */

export default function ContributorWritePage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();

  // Space data
  const [space, setSpace] = useState(null);
  // Form state
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  // UI state
  const [step, setStep] = useState('compose'); // 'compose' | 'review'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Saved pill state (toast, auto-dismiss then navigate)
  const [showSavedPill, setShowSavedPill] = useState(false);

  const textareaRef = useRef(null);
  const toastTimerRef = useRef(null);

  /* ─── Fetch space on mount ─── */
  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      setError('Your session has expired. Please use your invite link again.');
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
          setError('Failed to load. Please go back and try again.');
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId]);

  /* ─── Focus textarea when entering compose ─── */
  useEffect(() => {
    if (step === 'compose' && textareaRef.current) {
      const t = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [step]);

  /* ─── Cleanup toast timer on unmount (prevents setState on unmounted component) ─── */
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  /* ─── Handlers ─── */

  const handleTextChange = useCallback((e) => {
    const val = e.target.value;
    if (val.length <= MAX_CHARS) {
      setText(val);
    }
  }, []);

  const handleTitleChange = useCallback((e) => {
    setTitle(e.target.value);
  }, []);

  const handleDictation = useCallback((transcript) => {
    setText((prev) => {
      const separator = prev && !prev.endsWith(' ') ? ' ' : '';
      const next = prev + separator + transcript;
      return next.length <= MAX_CHARS ? next : next.substring(0, MAX_CHARS);
    });
  }, []);

  const handleCancel = useCallback(() => {
    navigate(`/contribute/${spaceId}/memories`);
  }, [navigate, spaceId]);

  const handleReview = useCallback(() => {
    if (!text.trim()) return;
    setStep('review');
  }, [text]);

  const handleBackToCompose = useCallback(() => {
    setStep('compose');
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const api = createContributorApiClient();
      await api.post(`/contribute/${spaceId}/memories`, {
        type: 'text',
        note: text.trim(),
        title: title.trim() || null,
        // No isPrivate — Lambda hardcodes FALSE for contributor memories.
        // No promptId — contributor prompts are frontend-hardcoded (P2).
      });

      // Show saved pill, then navigate after dismissal.
      setSaving(false);
      setShowSavedPill(true);
      toastTimerRef.current = setTimeout(() => {
        navigate(`/contribute/${spaceId}/memories`, { replace: true });
      }, TOAST_DURATION_MS);
    } catch (err) {
      console.error('Save error:', err);
      if (err.error === 'INVALID_SESSION' || err.error === 'NO_SESSION_TOKEN') {
        setError('Your session has expired. Please use your invite link again.');
      } else {
        setError("Something didn't save. Please try again.");
      }
      setSaving(false);
    }
  }, [saving, text, title, spaceId, navigate]);

  /* ─── Derived values ─── */
  const charCount = text.length;
  const nearLimit = charCount > 9000;
  const canReview = text.trim().length > 0;
  const spaceName = space?.spaceName || 'this space';
  const spaceInitial = (spaceName || '?').charAt(0).toUpperCase();

  /* ─── Loading state ─── */
  if (!space && !error) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingDot} />
        <span>Loading...</span>
      </div>
    );
  }

  /* ─── Error state (pre-load) ─── */
  if (error && !space) {
    return (
      <div className={styles.errorScreen}>
        <p>{error}</p>
        <button
          className={styles.btnPrimary}
          onClick={() => navigate(`/contribute/${spaceId}`)}
        >
          Go back
        </button>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     REVIEW SUB-SCREEN
     ═══════════════════════════════════════════════════ */
  if (step === 'review') {
    return (
      <div className={styles.reviewScreen}>

        {/* LovedOneBar — matches owner structure, different subtitle */}
        <div className={styles.lovedOneBar}>
          <div className={styles.lovedOneBarInner}>
            <div className={styles.barAvatar}>
              {space.photoUrl ? (
                <img src={space.photoUrl} alt={spaceName} className={styles.barAvatarImg} />
              ) : (
                <span className={styles.barAvatarInitial}>{spaceInitial}</span>
              )}
            </div>
            <div className={styles.barInfo}>
              <span className={styles.barName}>{spaceName}</span>
              <span className={styles.barSub}>Review your memory</span>
            </div>
          </div>
        </div>

        {/* Review content */}
        <div className={styles.reviewContent}>
          {/* Preview card */}
          <div className={styles.reviewPreview}>
            {title.trim() && (
              <h3 className={styles.reviewTitle}>{title.trim()}</h3>
            )}
            <p className={styles.reviewText}>{text}</p>
          </div>

          {/* Error message */}
          {error && (
            <div className={styles.errorBanner}>{error}</div>
          )}

          {/* Actions */}
          <div className={styles.reviewActions}>
            <button
              className={styles.btnPrimary}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save memory'}
            </button>
            <button
              className={styles.btnGhost}
              onClick={handleBackToCompose}
              disabled={saving}
            >
              ← Edit
            </button>
          </div>
        </div>

        {/* Saved pill toast — rendered outside other content for fixed positioning */}
        {showSavedPill && <SavedPill />}
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     COMPOSE SUB-SCREEN (default)
     ═══════════════════════════════════════════════════ */
  return (
    <div className={styles.composeScreen}>

      {/* LovedOneBar with back link */}
      <div className={styles.lovedOneBar}>
        <div className={styles.lovedOneBarInner}>
          <button
            className={styles.barBackLink}
            onClick={handleCancel}
            aria-label="Back to feed"
          >
            ←
          </button>
          <div className={styles.barAvatar}>
            {space.photoUrl ? (
              <img src={space.photoUrl} alt={spaceName} className={styles.barAvatarImg} />
            ) : (
              <span className={styles.barAvatarInitial}>{spaceInitial}</span>
            )}
          </div>
          <div className={styles.barInfo}>
            <span className={styles.barName}>{spaceName}</span>
            <span className={styles.barSub}>Write a memory</span>
          </div>
        </div>
      </div>

      {/* Compose content */}
      <div className={styles.composeContent}>

        {/* Hardcoded generic prompt banner — no skip link (P2) */}
        <div className={styles.promptBanner}>
          <span className={styles.promptCategory}>SHARE A MEMORY</span>
          <p className={styles.promptText}>
            Share a memory of {spaceName}.
          </p>
        </div>

        {/* Title input */}
        <input
          type="text"
          className={styles.titleInput}
          placeholder="Give it a title (optional)"
          value={title}
          onChange={handleTitleChange}
          maxLength={75}
        />

        {/* Textarea with dictate button */}
        <div className={styles.textareaWrap}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder="Start writing... say whatever comes to mind."
            value={text}
            onChange={handleTextChange}
            maxLength={MAX_CHARS}
          />
          <div className={styles.dictatePosition}>
            <DictateButton onTranscript={handleDictation} size="medium" />
          </div>
        </div>

        {/* Footer — char count + cancel + review */}
        <div className={styles.footer}>
          <span className={`${styles.charCount} ${nearLimit ? styles.nearLimit : ''}`}>
            {charCount.toLocaleString()} / 10,000
          </span>
          <div className={styles.footerButtons}>
            <button className={styles.btnCancel} onClick={handleCancel}>
              Cancel
            </button>
            <button
              className={styles.btnReview}
              onClick={handleReview}
              disabled={!canReview}
            >
              Review
            </button>
          </div>
        </div>
      </div>

      {/* Saved pill toast */}
      {showSavedPill && <SavedPill />}
    </div>
  );
}

/* ═══════════════════════════════════════
   SAVED PILL TOAST
   Inline component — bottom-center, auto-dismisses via parent timer.
   Matches InvitePage v1.1 toast pattern (Session 1B session log):
     - position: fixed, bottom-center
     - role="status" + aria-live="polite"
     - safe-area-inset-bottom respected
     - prefers-reduced-motion disables slide
   Styles inlined here to avoid modifying WritePage.module.css (owner-owned).
   ═══════════════════════════════════════ */

function SavedPill() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        background: 'var(--color-text-primary, #2d3436)',
        color: '#ffffff',
        padding: '12px 20px',
        borderRadius: '24px',
        fontSize: '14px',
        fontWeight: 500,
        fontFamily: 'var(--font-sans, "DM Sans", -apple-system, sans-serif)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        zIndex: 1000,
        animation: 'none', // Parent controls timing; no slide animation needed.
        pointerEvents: 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: 'var(--color-sage, #7c9885)',
          color: '#ffffff',
          fontSize: '11px',
          lineHeight: 1,
        }}
      >
        ✓
      </span>
      Saved
    </div>
  );
}
