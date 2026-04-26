// pages/PhotoPage.jsx — /spaces/:spaceId/photo
// v2.6 — Header consistency, leave-without-saving modal, promptText in
//         POST body (April 26, 2026)
//
// Changes from v2.5:
//   - F-1 fix: Replaced inline .lovedOneBar header with shared <LovedOneBar>
//     component. PhotoPage had the same inline header pattern as WritePage
//     (confirmed during file review). Now uses the shared component for
//     consistency across all capture screens.
//
//   - I-6: Added LeaveConfirmModal import + showLeaveConfirm state. Back/cancel
//     actions check for unsaved work (title or caption has content). If dirty,
//     shows the modal; if clean, navigates directly. Per F-Q1 decision: photo
//     selected alone is NOT dirty — the user hasn't invested effort yet.
//
//   - §4 (promptText at creation): handleSave POST body now includes
//     promptText and promptTitle for the denormalized memories table columns
//     (migration 019). PhotoPage doesn't fetch/display prompts, but if a
//     promptId were passed via location.state in a future iteration, the
//     plumbing would be ready. Currently sends null for both.
//
//   - Added imports: LovedOneBar, LeaveConfirmModal.
//
//   - Removed unused spaceInitial derived value (was only used by deleted
//     inline header).
//
//   - No other changes. Save handler logic (except promptText), file
//     validation, preview derivation, success screen, handleViewAllMemories,
//     handleAddAnotherPhoto, postSaveGating integration — all byte-identical
//     to v2.5.
//
// Previous changes (v2.5 — D-4 cache invalidation fix, April 22, 2026):
// Changes from v2.4:
//   - Import invalidateMemoriesCache from MemoryFeed.
//   - Call invalidateMemoriesCache(spaceId) after successful save so the
//     feed shows the new memory on navigation back (D-4 cache fix).
//
// Changes from v2.3:
//   - Session 2 feedback routing. Four narrow additions, no logic removed:
//
//     1. NEW STATE `savedMemoryId`. Captures the id returned by the
//        successful POST to /spaces/:id/memories so the feedback branch
//        of handleViewAllMemories can put it into router.state.memoryId.
//        Per Plan v1.2 Q5 + D1c (Option A — session decision).
//        Null until handleSave succeeds. Mirrors RecordPage v5.4 pattern.
//
//     2. `handleSave` now captures the POST response. v2.3 discarded it;
//        v2.4 stores `created.id` into savedMemoryId before setSaved(true).
//        Response shape (photo) verified against anamoria-memories Lambda
//        v2.0: { id, type: 'photo', spaceId, s3Key, createdAt }
//        This is the only scope extension beyond handler-only changes,
//        per session decision D1c (Option A).
//
//     3. `handleSuccessFileChange` additionally resets savedMemoryId to
//        null so a subsequent save within this mount gets its own id and
//        can't accidentally reuse the previous one. Mirrors the cleanup
//        pattern in RecordPage.handleRecordAnother v5.4.
//
//     4. `handleViewAllMemories` feedback branch now routes to
//        /spaces/:id/feedback with full router.state instead of falling
//        through to the feed. Branch split:
//           gate.redirectTo === 'reminder'  → /spaces/:id/reminder
//           gate.redirectTo === 'feedback'  → /spaces/:id/feedback (NEW)
//           default (feed)                  → /spaces/:id
//        No editMode guard — photo edits flow through MemoryDetailPage.
//
//   - postSaveGating v1.2 call: `userMemoryCount` argument is OMITTED
//     from the caller side. The helper fetches it from
//     GET /spaces/{id}/memories/count internally (parallel with the
//     stats fetch). Per session decision on File 5 review.
//
//   - No other changes. Form screen, success-screen layout, all other
//     handlers (handleSave apart from the id capture, handleAddAnotherPhoto,
//     handleSuccessFileChange apart from the id reset, handleFileSelect,
//     handleChangePhoto, handleRemovePhoto, handleCancel,
//     validateAndSetFile), preview derivation effect, blob-URL lifecycle,
//     redirect-on-no-file guard, SuccessScreen props, state shape apart
//     from savedMemoryId, imports — all byte-identical to v2.3.
//
// No editMode guard here (unchanged from v2.3): PhotoPage does NOT
// support edit via this route. Photo edits flow through MemoryDetailPage
// (see File Review Findings §6 / D1). The `handleViewAllMemories`
// handler therefore never fires on an edit path.
//
// Regression expectations (Session 2 additions):
//   - F-1 through F-3 Photo feedback paths: tertiaryCta routes through
//     feedback when gating matches (First_Memory / First_Photo / Periodic).
//   - R-3 Photo reminder flow: unchanged — reminder branch byte-identical.
//   - M-3 Photo save flow end-to-end: POST still creates row, response
//     id now captured and used for feedback correlation.
//
// Previous changes (v2.3 — Session 1A.5, April 18, 2026):
//   - Removed sessionStorage-based gating flag (hasSeenReminderPrompt).
//   - Gating helper v1.1 signature: drops hasSeenReminderPrompt.
//
// Previous changes (v2.2 — Session 1A): Original gating wiring via
//   sessionStorage (superseded by v2.3 DB-backed design).
//
// Previous changes (v2.1): Canonical URL.createObjectURL/revokeObjectURL
//   pattern per MDN, fixing v2.0 React 18 StrictMode double-invocation bug.
//
// Previous changes (v2.0): Removed setTimeout-based auto-open of file
//   picker; reads location.state.file on mount; redirects to feed if
//   missing.
//
// Route: /spaces/:spaceId/photo (protected)

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import { useResolvedPhotoUrl } from '../hooks/useResolvedPhotoUrl';
import SuccessScreen from '../components/SuccessScreen';
import LovedOneBar from '../components/LovedOneBar';
import LeaveConfirmModal from '../components/LeaveConfirmModal';
import { invalidateMemoriesCache } from '../components/MemoryFeed';
import { PhotoIcon } from '../components/BrandIcons';
// v2.3: Session 1A.5 post-save gating helper (DB-backed reminder branch;
// feedback branch stubbed for Session 2).
// v2.4: postSaveGating is now v1.2 — feedback branch implemented.
import { checkPostSaveGating } from '../utils/postSaveGating';
import styles from './PhotoPage.module.css';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default function PhotoPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessTokenSilently } = useAuth0();

  // ─── Space data ───
  const [space, setSpace] = useState(null);
  // v2.6: Resolve S3 key to signed CloudFront URL for LovedOneBar avatar.
  const resolvedPhotoUrl = useResolvedPhotoUrl(space, getAccessTokenSilently);

  // ─── File + preview (canonical pattern) ─────────────────────
  // File is the source of truth. Preview is DERIVED by a useEffect keyed
  // on [file]. No side effects in useState initializers.
  const [file, setFile] = useState(location.state?.file || null);
  const [preview, setPreview] = useState(null);

  // ─── Form state ───
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);

  // ─── UI state ───
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // v2.4: Session 2 — capture created memory id from successful POST for
  // feedback routing. Null until handleSave succeeds. Reset in
  // handleSuccessFileChange so a second save within this mount gets its
  // own id. Not populated on edit path — PhotoPage has none (edits flow
  // through MemoryDetailPage).
  const [savedMemoryId, setSavedMemoryId] = useState(null);

  // v2.6: Leave-without-saving modal state (I-6).
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // ─── Refs ───
  const fileInputRef = useRef(null);               // in-form "Change photo"
  const successFileInputRef = useRef(null);        // success-screen "Add another photo"

  // ─── Derive preview from file (canonical pattern, MDN + React community) ───
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    // Cleanup closes over `url` — always revokes the exact URL this effect
    // created. Runs when `file` changes (before next effect) or on unmount.
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ─── Fetch space on mount ───
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const api = createApiClient(getAccessTokenSilently);
        const data = await api.get(`/spaces/${spaceId}`);
        if (!cancelled) setSpace(data);
      } catch (err) {
        console.error('PhotoPage load error:', err);
        if (!cancelled) setError('Failed to load. Please go back and try again.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId, getAccessTokenSilently]);

  // ─── If no file was passed via location.state, redirect to feed ───
  // Guards against refresh on /spaces/:id/photo (File cannot survive reload)
  // and direct URL hits. Runs once after mount; safe — if the user landed
  // here with a file, they won't be redirected, and if they later clear the
  // file (which the UI doesn't allow except via "Remove photo" which itself
  // navigates away), the redirect fires appropriately.
  useEffect(() => {
    if (!location.state?.file) {
      navigate(`/spaces/${spaceId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── File validation (shared by in-form and success-screen picker) ───
  const validateAndSetFile = useCallback((selected) => {
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError('Please select a JPEG, PNG, or WebP image.');
      return false;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError('Photo must be under 10 MB.');
      return false;
    }
    setError(null);
    setFile(selected);    // derivation effect handles preview + old-URL cleanup
    return true;
  }, []);

  // ─── In-form "Change photo" handler ───
  const handleFileSelect = useCallback((e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    validateAndSetFile(selected);
  }, [validateAndSetFile]);

  const handleChangePhoto = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // v2.6: X button opens file picker to swap the image instead of navigating
  // away. If the user selects a new file, handleFileSelect → validateAndSetFile
  // handles it. If they cancel the picker, nothing happens — they stay on the
  // page with their current photo.
  const handleRemovePhoto = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  // v2.6: Back/cancel with unsaved-work guard (I-6).
  // Dirty = user has typed title or caption content. Photo selected alone
  // is NOT dirty (per F-Q1 decision — user hasn't invested effort yet).
  const hasUnsavedWork = title.trim().length > 0 || caption.trim().length > 0;

  const handleCancel = useCallback(() => {
    if (hasUnsavedWork) {
      setShowLeaveConfirm(true);
    } else {
      navigate(`/spaces/${spaceId}`);
    }
  }, [hasUnsavedWork, navigate, spaceId]);

  // ─── Save ───
  const handleSave = useCallback(async () => {
    if (!file || saving) return;
    setSaving(true);
    setError(null);

    try {
      const api = createApiClient(getAccessTokenSilently);
      const mimeType = file.type.split(';')[0];

      // 1. Get upload URL
      const uploadData = await api.post('/media/upload-url', {
        spaceId,
        mimeType,
        mediaType: 'photo',
      });

      // 2. Upload to S3
      await api.putS3(uploadData.uploadUrl, file, mimeType);

      // 3. Create photo memory.
      // v2.4: capture the response so savedMemoryId is available to the
      // feedback branch of handleViewAllMemories. Response shape (photo):
      //   { id, type: 'photo', spaceId, s3Key, createdAt }
      // Verified against anamoria-memories Lambda v2.0 source.
      const createdMemory = await api.post(`/spaces/${spaceId}/memories`, {
        type: 'photo',
        s3Key: uploadData.s3Key,
        title: title.trim() || null,
        note: caption.trim() || null,
        isPrivate,
        // v2.6: Send denormalized prompt text for the memories table
        // (prompt_text + prompt_title columns, migration 019).
        // PhotoPage doesn't currently display prompts, so these are null.
        // If a promptId is passed via location.state in a future iteration,
        // this plumbing is ready.
        promptText: null,
        promptTitle: null,
      });
      setSavedMemoryId(createdMemory.id);

      // 4. Show success screen (file state is preserved, so preview blob
      //    URL is still alive and renders in the success card).
      setSaving(false);
      setSaved(true);
      // D-4 fix: Invalidate the MemoryFeed cache so the feed fetches fresh
      // data and shows this newly saved memory on navigation back.
      invalidateMemoriesCache(spaceId);
    } catch (err) {
      console.error('Photo save error:', err);
      setError("Something didn't save. Please try again.");
      setSaving(false);
    }
  }, [file, saving, title, caption, isPrivate, spaceId, getAccessTokenSilently]);

  // ─── "Add another photo" from success screen ───
  const handleAddAnotherPhoto = useCallback(() => {
    if (successFileInputRef.current) {
      successFileInputRef.current.value = '';
      successFileInputRef.current.click();
    }
  }, []);

  const handleSuccessFileChange = useCallback((e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;                 // cancel → stay on success screen
    if (!validateAndSetFile(selected)) return;

    // Reset form state for the new photo. Preview regenerates via the
    // derivation effect when setFile runs above.
    setTitle('');
    setCaption('');
    setIsPrivate(true);
    setError(null);
    setSaved(false);                        // back to form view
    // v2.4: clear captured memory id so the next save gets its own id
    setSavedMemoryId(null);
  }, [validateAndSetFile]);

  // v2.4: "View all memories" — post-save gating handler (DB-backed).
  // Called from SuccessScreen.tertiaryCta.onClick.
  //
  // No editMode guard — photo edits flow through MemoryDetailPage, not
  // this file (File Review Findings §6 / D1). Fallthrough on any error
  // routes to the feed so the user is never stuck on SuccessScreen.
  //
  // `getApi` is passed as an inline arrow per D3 session decision (page
  // does not memoize createApiClient; each handler creates it ad-hoc).
  //
  // v2.4 changes:
  //   - Feedback branch routes to /spaces/:id/feedback with full router
  //     state instead of falling through to feed.
  //   - memoryId read from savedMemoryId state.
  //   - userMemoryCount intentionally omitted from the helper call;
  //     helper fetches it from GET /spaces/:id/memories/count internally.
  const handleViewAllMemories = useCallback(async () => {
    try {
      const gate = await checkPostSaveGating({
        spaceId,
        space,
        memoryType: 'photo',
        getApi: () => createApiClient(getAccessTokenSilently),
        // userMemoryCount intentionally omitted — helper fetches it
        // from GET /spaces/:id/memories/count in parallel with stats.
      });
      if (gate.redirectTo === 'reminder') {
        navigate(`/spaces/${spaceId}/reminder`);
      } else if (gate.redirectTo === 'feedback') {
        // v2.4: route to feedback screen with full router state per Plan
        // v1.2 Q5. FeedbackPage's direct-URL-load guard requires
        // triggerContext at minimum; the other fields correlate the
        // feedback event to the memory that triggered it.
        navigate(`/spaces/${spaceId}/feedback`, {
          state: {
            memoryId: savedMemoryId,
            memoryType: 'photo',
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
  }, [spaceId, space, navigate, getAccessTokenSilently, savedMemoryId]);

  // ─── Derived ───

  // ─── Loading (space fetch) ───
  if (!space) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingDot} />
        <span>Loading...</span>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  SUCCESS SCREEN — after successful save
  //  v2.4: tertiaryCta.onClick routes through DB-backed post-save gating
  //  with feedback branch fully wired. Markup unchanged from v2.3.
  // ═══════════════════════════════════════════════════════════

  if (saved) {
    const subtitle = title.trim()
      ? `${title.trim()} · Memory saved`
      : 'Memory saved';

    return (
      <>
        <SuccessScreen
          spaceName={space.name}
          spacePhotoUrl={resolvedPhotoUrl}
          subtitle={subtitle}
          onBack={() => navigate(`/spaces/${spaceId}`, { replace: true })}
          backLabel="Back to feed"
          badgeLabel="JUST ADDED"
          promptText={null}
          isPrivate={isPrivate}
          primaryCta={{
            icon: <PhotoIcon />,
            label: 'Add another photo',
            onClick: handleAddAnotherPhoto,
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
          activeTab="photo"
        >
          {/* Photo preview body: thumbnail → title → full caption (P3) */}
          <div className={styles.successThumb}>
            {preview && (
              <img
                src={preview}
                alt={title.trim() || 'Saved photo'}
                className={styles.successThumbImg}
              />
            )}
          </div>
          {title.trim() && (
            <p className={styles.successThumbTitle}>{title.trim()}</p>
          )}
          {caption.trim() && (
            <p className={styles.successThumbCaption}>{caption.trim()}</p>
          )}
        </SuccessScreen>

        {/* Hidden file input for "Add another photo" */}
        <input
          ref={successFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className={styles.fileInput}
          onChange={handleSuccessFileChange}
        />
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  PHOTO-SAVE FORM
  // ═══════════════════════════════════════════════════════════

  return (
    <div className={styles.screen}>
      {/* In-form hidden file input — used by "Change photo" button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className={styles.fileInput}
        onChange={handleFileSelect}
      />

      {/* v2.6 F-1 fix: Shared LovedOneBar replaces inline header.
          onBack uses the leave-guard (handleCancel checks hasUnsavedWork). */}
      <LovedOneBar
        spaceName={space.name}
        spacePhotoUrl={resolvedPhotoUrl}
        subtitle="Add a photo"
        onBack={handleCancel}
        backLabel="Back to feed"
      />

      {/* Content */}
      <div className={styles.content}>
        {/* Photo preview — user arrived with a file; preview is derived from file state */}
        {preview && (
          <div className={styles.previewContainer}>
            <img src={preview} alt="Selected photo" className={styles.previewImg} />
            <button
              className={styles.removeBtn}
              onClick={handleRemovePhoto}
              aria-label="Remove photo"
            >
              ✕
            </button>
            <button className={styles.changeHint} onClick={handleChangePhoto}>
              Tap to change
            </button>
          </div>
        )}

        {/* Title */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            Title <span className={styles.optional}>(optional)</span>
          </label>
          <input
            type="text"
            className={styles.fieldInput}
            placeholder="Name this photo"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={75}
          />
        </div>

        {/* Caption */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            Caption <span className={styles.optional}>(optional)</span>
          </label>
          <textarea
            className={styles.fieldTextarea}
            placeholder="What's the story behind this photo?"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={2000}
            rows={3}
          />
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

        {/* Error */}
        {error && <div className={styles.errorBanner}>{error}</div>}

        {/* Actions */}
        <div className={styles.actions}>
          <button
            className={styles.btnPrimary}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Uploading...' : `Save to ${space.name}'s space`}
          </button>
          <button
            className={styles.btnGhost}
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* v2.6 I-6: Leave-without-saving modal */}
      <LeaveConfirmModal
        open={showLeaveConfirm}
        message="Your photo details won't be saved if you leave now."
        icon="photo"
        onKeepEditing={() => setShowLeaveConfirm(false)}
        onLeave={() => {
          setShowLeaveConfirm(false);
          navigate(`/spaces/${spaceId}`);
        }}
      />
    </div>
  );
}
