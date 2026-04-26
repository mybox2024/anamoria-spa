// WritePage.jsx — /spaces/:id/write
// v1.6 — Prompt placement, header consistency, leave-without-saving modal,
//         promptText in POST body (April 26, 2026)
//
// Changes from v1.5:
//   - I-2 fix (compose screen): Replaced inline .lovedOneBar header with
//     shared <LovedOneBar> component. Replaced inline .promptBanner with
//     shared <PromptBanner fullWidth> moved OUTSIDE .composeContent so it
//     spans full width, matching RecordPage.
//
//   - I-3 fix (review screen): Replaced inline .lovedOneBar header with
//     shared <LovedOneBar>. Added <PromptBanner showSkip={false} fullWidth>
//     between header and review content, matching RecordPage review (5b).
//
//   - I-6: Added LeaveConfirmModal import + showLeaveConfirm state. Compose
//     screen back/cancel actions check for unsaved work (text or title has
//     content). If dirty, shows the modal; if clean, navigates directly.
//     Review screen does not need this — user explicitly navigated there;
//     "← Edit" goes back to compose, not away.
//
//   - §4 (promptText at creation): handleSave POST body now includes
//     promptText and promptTitle for the denormalized memories table columns
//     (migration 019). Depends on anamoria-memories Lambda v2.5.
//
//   - Added imports: LovedOneBar, PromptBanner, LeaveConfirmModal.
//
//   - No other changes. Save handler logic (except promptText), dictation,
//     text/title state, success screen, handleViewAllMemories,
//     handleWriteAnother, postSaveGating integration — all byte-identical
//     to v1.5.
//
// Previous changes (v1.5 — D-4 cache invalidation fix, April 22, 2026):
// Changes from v1.4:
//   - Import invalidateMemoriesCache from MemoryFeed.
//   - Call invalidateMemoriesCache(spaceId) after successful save so the
//     feed shows the new memory on navigation back (D-4 cache fix).
//
// Changes from v1.3:
//   - Session 2 feedback routing. Four narrow additions, no logic removed:
//
//     1. `handleSave` now captures the POST response. v1.3 discarded it;
//        v1.4 stores `created.id` into savedSnapshot.memoryId. Response
//        shape (text) verified against anamoria-memories Lambda v2.0:
//          { id, type: 'text', spaceId, createdAt }
//        This is the only scope extension beyond handler-only changes,
//        per session decision D1c (Option A). Documented in session log.
//
//     2. savedSnapshot now carries a `memoryId` field. Additive: existing
//        success-screen render block reads only the fields it always did
//        (title, text, isPrivate, promptText) — no regression risk.
//        Router state for feedback navigation reads memoryId from the
//        snapshot via `savedSnapshot?.memoryId || null`.
//
//     3. `handleViewAllMemories` feedback branch now routes to
//        /spaces/:id/feedback with full router.state instead of falling
//        through to the feed. Branch split:
//           gate.redirectTo === 'reminder'  → /spaces/:id/reminder
//           gate.redirectTo === 'feedback'  → /spaces/:id/feedback (NEW)
//           default (feed)                  → /spaces/:id
//        No editMode guard — text edits flow through MemoryDetailPage.
//
//     4. postSaveGating v1.2 call: `userMemoryCount` argument is OMITTED
//        from the caller side. The helper fetches it from
//        GET /spaces/{id}/memories/count internally (parallel with the
//        stats fetch). Per session decision on File 5 review.
//
//   - No other changes. Compose screen, review screen, success-screen
//     layout, all other handlers (handleWriteAnother, handleReview,
//     handleBackToCompose, handleCancel, handleSkipPrompt, handleTextChange,
//     handleTitleChange, handleDictation), SuccessScreen props, state shape
//     apart from savedSnapshot.memoryId, imports — all byte-identical
//     to v1.3.
//
// No editMode guard here (unchanged from v1.3): WritePage does NOT
// support edit via this route. Text memory edits flow through
// MemoryDetailPage (see File Review Findings §5 / D1). The
// `handleViewAllMemories` handler therefore never fires on an edit path.
//
// Regression expectations (Session 2 additions):
//   - F-1 through F-3 Text feedback paths: tertiaryCta routes through
//     feedback when gating matches (First_Memory / First_Text / Periodic).
//   - R-1 Text reminder flow: unchanged — reminder branch byte-identical.
//   - M-2 Text save flow end-to-end: POST still creates row, response
//     id now captured and used for feedback correlation.
//
// Previous changes (v1.3 — Session 1A.5, April 18, 2026):
//   - Removed sessionStorage-based gating flag (hasSeenReminderPrompt).
//   - Gating helper v1.1 signature: drops hasSeenReminderPrompt.
//
// Previous changes (v1.2 — Session 1A): Original gating wiring via
//   sessionStorage (superseded by v1.3 DB-backed design).
//
// Previous changes (v1.1): Success screen extraction with savedSnapshot.
//
// Two sub-screens: compose → review → save → success

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import { useResolvedPhotoUrl } from '../hooks/useResolvedPhotoUrl';
import DictateButton from '../components/DictateButton';
import SuccessScreen from '../components/SuccessScreen';
import LovedOneBar from '../components/LovedOneBar';
import PromptBanner from '../components/PromptBanner';
import LeaveConfirmModal from '../components/LeaveConfirmModal';
import { invalidateMemoriesCache } from '../components/MemoryFeed';
import { WriteIcon } from '../components/BrandIcons';
// v1.3: Session 1A.5 post-save gating helper (DB-backed reminder branch;
// feedback branch stubbed for Session 2).
// v1.4: postSaveGating is now v1.2 — feedback branch implemented.
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
  // v1.6: Resolve S3 key to signed CloudFront URL for LovedOneBar avatar.
  const resolvedPhotoUrl = useResolvedPhotoUrl(space, getAccessTokenSilently);
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
  // v1.4: savedSnapshot additionally carries `memoryId` from the POST response
  // for feedback routing. Additive — all v1.1 consumers still work.
  const [saved, setSaved] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(null);

  // v1.6: Leave-without-saving modal state (I-6).
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

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

  // v1.6: Compose screen back/cancel with unsaved-work guard (I-6).
  // Dirty = user has typed any text or title content.
  const hasUnsavedWork = text.trim().length > 0 || title.trim().length > 0;

  const handleCancel = useCallback(() => {
    if (hasUnsavedWork) {
      setShowLeaveConfirm(true);
    } else {
      navigate(`/spaces/${spaceId}`);
    }
  }, [hasUnsavedWork, navigate, spaceId]);

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

      // v1.4: capture the POST response so savedSnapshot.memoryId is
      // available for feedback routing. Response shape (text):
      //   { id, type: 'text', spaceId, createdAt }
      // Verified against anamoria-memories Lambda v2.0 source.
      const createdMemory = await api.post(`/spaces/${spaceId}/memories`, {
        type: 'text',
        note: text.trim(),
        title: title.trim() || null,
        isPrivate,
        promptId: prompt?.promptId || null,
        // v1.6: Send denormalized prompt text for the memories table
        // (prompt_text + prompt_title columns, migration 019).
        ...(prompt?.promptId ? {
          promptText: prompt.text || null,
          promptTitle: prompt.title || prompt.category || null,
        } : {}),
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
      // v1.4: Snapshot now includes memoryId from the POST response for
      // feedback routing. All other fields unchanged from v1.1.
      setSavedSnapshot({
        title: title.trim(),
        text: text.trim(),
        isPrivate,
        promptText: prompt?.text || null,
        memoryId: createdMemory.id,
      });
      setSaved(true);
      // D-4 fix: Invalidate the MemoryFeed cache so the feed fetches fresh
      // data and shows this newly saved memory on navigation back.
      invalidateMemoriesCache(spaceId);
      setSaving(false);
    } catch (err) {
      console.error('Save error:', err);
      setError("Something didn't save. Please try again.");
      setSaving(false);
    }
  }, [saving, text, title, isPrivate, prompt, spaceId, getAccessTokenSilently]);

  // v1.1: "Keep going — write another" — reset form, return to compose.
  // Mirrors RecordPage.handleRecordAnother / PhotoPage.handleAddAnotherPhoto.
  // v1.4: No change needed — setSavedSnapshot(null) already clears everything
  // including the new memoryId field.
  const handleWriteAnother = useCallback(() => {
    setSaved(false);
    setSavedSnapshot(null);
    setTitle('');
    setText('');
    setIsPrivate(true);
    setError(null);
    setStep('compose');
  }, []);

  // v1.4: "View all memories" — post-save gating handler (DB-backed).
  // Called from SuccessScreen.tertiaryCta.onClick.
  //
  // No editMode guard — text edits flow through MemoryDetailPage, not this
  // file (File Review Findings §5 / D1). Fallthrough on any error routes
  // to the feed so the user is never stuck on SuccessScreen.
  //
  // `getApi` is passed as an inline arrow per D3 session decision (page does
  // not memoize createApiClient; each handler creates it ad-hoc).
  //
  // v1.4 changes:
  //   - Feedback branch routes to /spaces/:id/feedback with full router
  //     state instead of falling through to feed.
  //   - memoryId read from savedSnapshot; null-safe access in case the
  //     handler fires in an unusual sequence.
  //   - userMemoryCount intentionally omitted from the helper call;
  //     helper fetches it from GET /spaces/:id/memories/count internally.
  const handleViewAllMemories = useCallback(async () => {
    try {
      const gate = await checkPostSaveGating({
        spaceId,
        space,
        memoryType: 'text',
        getApi: () => createApiClient(getAccessTokenSilently),
        // userMemoryCount intentionally omitted — helper fetches it
        // from GET /spaces/:id/memories/count in parallel with stats.
      });
      if (gate.redirectTo === 'reminder') {
        navigate(`/spaces/${spaceId}/reminder`);
      } else if (gate.redirectTo === 'feedback') {
        // v1.4: route to feedback screen with full router state per Plan
        // v1.2 Q5. FeedbackPage's direct-URL-load guard requires
        // triggerContext at minimum; the other fields correlate the
        // feedback event to the memory that triggered it.
        navigate(`/spaces/${spaceId}/feedback`, {
          state: {
            memoryId: savedSnapshot?.memoryId || null,
            memoryType: 'text',
            triggerContext: gate.triggerContext,
            userMemoryCount: gate.userMemoryCount,
          },
        });
      } else {
        // 'feed' — default path, or helper returned 'feed' on internal error
        navigate(`/spaces/${spaceId}`, { replace: true });
      }
    } catch (err) {
      console.error('Gating check failed:', err);
      navigate(`/spaces/${spaceId}`, { replace: true });
    }
  }, [spaceId, space, navigate, getAccessTokenSilently, savedSnapshot]);

  // ─── Derived values ───
  const charCount = text.length;
  const nearLimit = charCount > 9000;
  const canReview = text.trim().length > 0;

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
  //  v1.4: tertiaryCta.onClick routes through DB-backed post-save gating
  //  with feedback branch fully wired. Markup unchanged from v1.3.
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
        spacePhotoUrl={resolvedPhotoUrl}
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
        {/* v1.6 I-3 fix: Shared LovedOneBar replaces inline header */}
        <LovedOneBar
          spaceName={space.name}
          spacePhotoUrl={resolvedPhotoUrl}
          subtitle="Review your memory"
          onBack={handleBackToCompose}
          backLabel="Back to compose"
        />

        {/* v1.6 I-3 fix: PromptBanner on review screen, matching
            RecordPage review (5b). No skip link on review. */}
        {prompt && prompt.text && (
          <PromptBanner prompt={prompt} showSkip={false} fullWidth />
        )}

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
      {/* v1.6 I-2 fix: Shared LovedOneBar replaces inline header.
          onBack uses the leave-guard (handleCancel checks hasUnsavedWork). */}
      <LovedOneBar
        spaceName={space.name}
        spacePhotoUrl={resolvedPhotoUrl}
        subtitle="Write a memory"
        onBack={handleCancel}
        backLabel="Back to feed"
      />

      {/* v1.6 I-2 fix: Shared PromptBanner replaces inline .promptBanner.
          Moved OUTSIDE .composeContent so it spans full width, matching
          RecordPage. */}
      {prompt && prompt.text && (
        <PromptBanner
          prompt={prompt}
          onSkip={handleSkipPrompt}
          showSkip
          fullWidth
        />
      )}

      {/* Compose content */}
      <div className={styles.composeContent}>
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

      {/* v1.6 I-6: Leave-without-saving modal */}
      <LeaveConfirmModal
        open={showLeaveConfirm}
        message="Your writing won't be saved if you leave now."
        icon="write"
        onKeepEditing={() => setShowLeaveConfirm(false)}
        onLeave={() => {
          setShowLeaveConfirm(false);
          navigate(`/spaces/${spaceId}`);
        }}
      />
    </div>
  );
}
