// WritePage.jsx — /spaces/:id/write
// v1.3 — Session 1A.5 (April 18, 2026)
//
// Changes from v1.2:
//   - Removed the `sessionStorage.getItem('ana_reminderPromptSeen') === '1'`
//     read inside `handleViewAllMemories`. The session-scoped flag has been
//     retired in favor of DB-owned `space.reminderPromptedAt` (ADR-038 /
//     Session 1A.5 Steps 1–4).
//   - Dropped the `hasSeenReminderPrompt` argument from the
//     `checkPostSaveGating()` call. The helper's v1.1 signature no longer
//     accepts it; the DB-backed rule reads `space.reminderPromptedAt`
//     directly.
//   - No other changes. Compose screen, review screen, success-screen layout,
//     all other handlers (handleSave, handleWriteAnother, handleReview,
//     handleBackToCompose, handleCancel, handleSkipPrompt, handleTextChange,
//     handleTitleChange, handleDictation), SuccessScreen props, state shape,
//     imports — all byte-identical to v1.2.
//
// Contract change (caller-side):
//   v1.2 call shape (retired):
//     checkPostSaveGating({
//       spaceId, space, memoryType: 'text',
//       hasSeenReminderPrompt,   ← dropped
//       getApi: () => createApiClient(getAccessTokenSilently),
//     })
//   v1.3 call shape (current):
//     checkPostSaveGating({
//       spaceId, space, memoryType: 'text',
//       getApi: () => createApiClient(getAccessTokenSilently),
//     })
//
// No editMode guard here: WritePage does NOT support edit via this route.
// Text memory edits flow through MemoryDetailPage (see File Review Findings
// §5 / D1). The `handleViewAllMemories` handler therefore never fires on an
// edit path.
//
// Regression expectations (Session 1A.5):
//   - RG-2 Text save flow: tertiaryCta routes through DB-backed gating.
//   - RG-5 Text edit from feed (MemoryDetailPage path): unaffected.
//   - RG-11 (sign-out re-prompt suppression): passes via DB persistence.
//   - RG-14 Tab-close re-prompt suppression: passes via DB persistence.
//
// Previous changes (v1.2 — Session 1A):
//   - Imported `checkPostSaveGating` from `../utils/postSaveGating` v1.0.
//   - Replaced the one-line `tertiaryCta.onClick` on SuccessScreen with an
//     async handler that called the gating helper and routed via
//     /spaces/:id/reminder or /spaces/:id. Session-scoped gating flag read
//     from sessionStorage (now removed in v1.3).
//
// Previous changes (v1.1):
//   - Imports: SuccessScreen, WriteIcon.
//   - State: added `saved` flag + `savedSnapshot` (captures title/note/isPrivate
//     at save-time so the success card shows the saved memory, not a mutating
//     form state — same approach as PhotoPage).
//   - handleSave: on POST success, set saved=true instead of navigate().
//   - handleWriteAnother: resets form state + returns to compose step
//     (mirror of RecordPage.handleRecordAnother / PhotoPage.handleAddAnotherPhoto).
//   - New render branch (top-priority): when `saved`, render <SuccessScreen>
//     with `WRITTEN` label + title + note excerpt body.
//
// Intentionally UNTOUCHED from v1.2:
//   - Compose screen layout, textarea, DictateButton, prompt banner, footer
//   - Review screen layout, preview card, privacy toggle
//   - All existing handlers (handleReview, handleBackToCompose, handleCancel,
//     handleSkipPrompt, handleTextChange, handleTitleChange, handleDictation)
//   - POST payload to /spaces/:id/memories
//   - Prompt-respond side effect
//   - Error banner rendering
//   - Loading / error-screen branches
//
// Two sub-screens: compose → review → save → success

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import DictateButton from '../components/DictateButton';
import SuccessScreen from '../components/SuccessScreen';
import { WriteIcon } from '../components/BrandIcons';
// v1.3: Session 1A.5 post-save gating helper (DB-backed reminder branch;
// feedback branch stubbed for Session 2). Signature dropped
// `hasSeenReminderPrompt` — caller must not pass it.
import { checkPostSaveGating } from '../utils/postSaveGating';
import styles from './WritePage.module.css';

const MAX_CHARS = 10000;

// v1.1: Max chars shown in success screen note excerpt before truncation.
const EXCERPT_MAX = 200;

export default function WritePage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();

  // Space data
  const [space, setSpace] = useState(null);
  // Prompt data
  const [prompt, setPrompt] = useState(null);
  // Form state
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  // UI state
  const [step, setStep] = useState('compose'); // 'compose' | 'review'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // v1.1: Success screen state. savedSnapshot captures what was saved so the
  // success card doesn't flicker if the form is reset before render completes.
  const [saved, setSaved] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(null);

  const textareaRef = useRef(null);

  // ─── Fetch space + prompt on mount ───
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const api = createApiClient(getAccessTokenSilently);
        const [spaceData, promptData] = await Promise.all([
          api.get(`/spaces/${spaceId}`),
          api.get(`/spaces/${spaceId}/prompt`),
        ]);
        if (cancelled) return;
        setSpace(spaceData);
        setPrompt(promptData);
      } catch (err) {
        console.error('WritePage load error:', err);
        if (!cancelled) setError('Failed to load. Please go back and try again.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId, getAccessTokenSilently]);

  // ─── Focus textarea when entering compose ───
  useEffect(() => {
    if (step === 'compose' && textareaRef.current) {
      // Small delay to let transition complete
      const t = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [step]);

  // ─── Handlers ───

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
    // Sync textarea value
    if (textareaRef.current) {
      // Need to update via state, not direct DOM — React controls this
    }
  }, []);

  const handleCancel = useCallback(() => {
    navigate(`/spaces/${spaceId}`);
  }, [navigate, spaceId]);

  const handleReview = useCallback(() => {
    if (!text.trim()) return;
    setStep('review');
  }, [text]);

  const handleBackToCompose = useCallback(() => {
    setStep('compose');
  }, []);

  const handleSkipPrompt = useCallback(async () => {
    try {
      const api = createApiClient(getAccessTokenSilently);
      await api.post(`/spaces/${spaceId}/prompt/advance`, {});
      const newPrompt = await api.get(`/spaces/${spaceId}/prompt`);
      setPrompt(newPrompt);
    } catch (err) {
      console.error('Skip prompt error:', err);
    }
  }, [spaceId, getAccessTokenSilently]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const api = createApiClient(getAccessTokenSilently);

      // 1. Create text memory
      await api.post(`/spaces/${spaceId}/memories`, {
        type: 'text',
        note: text.trim(),
        title: title.trim() || null,
        isPrivate,
        promptId: prompt?.promptId || null,
      });

      // 2. Record prompt response (if prompt was active)
      if (prompt?.promptId) {
        try {
          await api.post(`/spaces/${spaceId}/prompt/respond`, {
            promptId: prompt.promptId,
          });
        } catch (_) {
          // Non-critical — don't block save
        }
      }

      // 3. v1.1: Show success screen instead of navigating.
      // Capture a snapshot so the success card reflects exactly what was saved,
      // independent of any later form mutation by handleWriteAnother.
      setSavedSnapshot({
        title: title.trim(),
        text: text.trim(),
        isPrivate,
        promptText: prompt?.text || null,
      });
      setSaved(true);
      setSaving(false);
    } catch (err) {
      console.error('Save error:', err);
      setError("Something didn't save. Please try again.");
      setSaving(false);
    }
  }, [saving, text, title, isPrivate, prompt, spaceId, getAccessTokenSilently]);

  // v1.1: "Keep going — write another" — reset form, return to compose.
  // Mirrors RecordPage.handleRecordAnother / PhotoPage.handleAddAnotherPhoto.
  const handleWriteAnother = useCallback(() => {
    setSaved(false);
    setSavedSnapshot(null);
    setTitle('');
    setText('');
    setIsPrivate(true);
    setError(null);
    setStep('compose');
  }, []);

  // v1.3: "View all memories" — post-save gating handler (DB-backed).
  // Called from SuccessScreen.tertiaryCta.onClick. No editMode guard needed —
  // text edits flow through MemoryDetailPage, not this file (File Review
  // Findings §5 / D1). Fallthrough on any error routes to the feed so the
  // user is never stuck on SuccessScreen.
  //
  // `getApi` is passed as a function per Q5 approval. WritePage does not
  // memoize createApiClient (each handler creates it ad-hoc), so we preserve
  // that page-level pattern by inlining the factory here (D3).
  const handleViewAllMemories = useCallback(async () => {
    try {
      const gate = await checkPostSaveGating({
        spaceId,
        space,
        memoryType: 'text',
        getApi: () => createApiClient(getAccessTokenSilently),
      });
      if (gate.redirectTo === 'reminder') {
        navigate(`/spaces/${spaceId}/reminder`);
      } else {
        // 'feedback' (Session 2 stub) and 'feed' both land on the feed in 1A.5.
        navigate(`/spaces/${spaceId}`, { replace: true });
      }
    } catch (err) {
      console.error('Gating check failed:', err);
      navigate(`/spaces/${spaceId}`, { replace: true });
    }
  }, [spaceId, space, navigate, getAccessTokenSilently]);

  // ─── Derived values ───
  const charCount = text.length;
  const nearLimit = charCount > 9000;
  const canReview = text.trim().length > 0;
  const spaceInitial = space?.name ? space.name.charAt(0).toUpperCase() : '?';

  // ─── Loading state ───
  if (!space) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingDot} />
        <span>Loading...</span>
      </div>
    );
  }

  // ─── Error state ───
  if (error && !space) {
    return (
      <div className={styles.errorScreen}>
        <p>{error}</p>
        <button className={styles.btnPrimary} onClick={() => navigate(`/spaces/${spaceId}`)}>
          Go back
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  //  SUCCESS SCREEN (v1.1) — after save
  //  v1.3: tertiaryCta.onClick routes through DB-backed post-save gating.
  // ═══════════════════════════════════════════════════
  if (saved && savedSnapshot) {
    const subtitle = savedSnapshot.title
      ? `${savedSnapshot.title} · Memory saved`
      : 'Memory saved';

    const excerpt =
      savedSnapshot.text.length > EXCERPT_MAX
        ? `${savedSnapshot.text.substring(0, EXCERPT_MAX).trimEnd()}…`
        : savedSnapshot.text;

    return (
      <SuccessScreen
        spaceName={space.name}
        spacePhotoUrl={space.photoUrl}
        subtitle={subtitle}
        onBack={() => navigate(`/spaces/${spaceId}`, { replace: true })}
        backLabel="Back to feed"
        badgeLabel="JUST ADDED"
        promptText={savedSnapshot.promptText}
        isPrivate={savedSnapshot.isPrivate}
        primaryCta={{
          icon: <WriteIcon />,
          label: 'Keep going — write another',
          onClick: handleWriteAnother,
        }}
        secondaryCta={{
          label: 'Invite family to add memories',
          onClick: () => navigate(`/spaces/${spaceId}/invite`),
        }}
        tertiaryCta={{
          label: 'View all memories',
          onClick: handleViewAllMemories,
        }}
        spaceId={spaceId}
        activeTab="write"
      >
        {/* Text-specific preview body: WRITTEN label · title · note excerpt */}
        <p className={styles.successLabel}>WRITTEN</p>
        {savedSnapshot.title && (
          <h3 className={styles.successTitle}>{savedSnapshot.title}</h3>
        )}
        {excerpt && (
          <p className={styles.successExcerpt}>{excerpt}</p>
        )}
      </SuccessScreen>
    );
  }

  // ═══════════════════════════════════════════════════
  //  REVIEW SUB-SCREEN
  // ═══════════════════════════════════════════════════
  if (step === 'review') {
    return (
      <div className={styles.reviewScreen}>
        {/* LovedOneBar */}
        <div className={styles.lovedOneBar}>
          <div className={styles.lovedOneBarInner}>
            <div className={styles.barAvatar}>
              {space.photoUrl ? (
                <img src={space.photoUrl} alt={space.name} className={styles.barAvatarImg} />
              ) : (
                <span className={styles.barAvatarInitial}>{spaceInitial}</span>
              )}
            </div>
            <div className={styles.barInfo}>
              <span className={styles.barName}>{space.name}</span>
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

          {/* Privacy toggle */}
          <div className={styles.privacySection}>
            <div className={styles.privacyRow} onClick={() => setIsPrivate((p) => !p)}>
              <div className={styles.privacyLabel}>
                <span className={styles.privacyIcon}>{isPrivate ? '🔒' : '👥'}</span>
                <span className={styles.privacyText}>
                  {isPrivate ? 'Private — only you can see this' : 'Shared with family'}
                </span>
              </div>
              <div className={`${styles.toggleTrack} ${isPrivate ? styles.togglePrivate : styles.toggleShared}`}>
                <div className={styles.toggleThumb} />
              </div>
            </div>
            <p className={styles.privacyHint}>You can change this anytime</p>
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
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  //  COMPOSE SUB-SCREEN (default)
  // ═══════════════════════════════════════════════════
  return (
    <div className={styles.composeScreen}>
      {/* LovedOneBar */}
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
              <img src={space.photoUrl} alt={space.name} className={styles.barAvatarImg} />
            ) : (
              <span className={styles.barAvatarInitial}>{spaceInitial}</span>
            )}
          </div>
          <div className={styles.barInfo}>
            <span className={styles.barName}>{space.name}</span>
            <span className={styles.barSub}>Write a memory</span>
          </div>
        </div>
      </div>

      {/* Compose content */}
      <div className={styles.composeContent}>
        {/* Prompt banner */}
        {prompt && prompt.text && (
          <div className={styles.promptBanner}>
            <span className={styles.promptCategory}>
              {prompt.title || "TODAY'S REMEMBRANCE"}
            </span>
            <p className={styles.promptText}>{prompt.text}</p>
            <button className={styles.promptSkip} onClick={handleSkipPrompt}>
              Try a different prompt
            </button>
          </div>
        )}

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

        {/* Footer */}
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
    </div>
  );
}
