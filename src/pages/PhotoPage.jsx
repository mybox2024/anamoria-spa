// pages/PhotoPage.jsx — /spaces/:spaceId/photo
// v2.3 — Session 1A.5 (April 18, 2026)
//
// Changes from v2.2:
//   - Removed the `sessionStorage.getItem('ana_reminderPromptSeen') === '1'`
//     read inside `handleViewAllMemories`. The session-scoped flag has been
//     retired in favor of DB-owned `space.reminderPromptedAt` (ADR-038 /
//     Session 1A.5 Steps 1–4).
//   - Dropped the `hasSeenReminderPrompt` argument from the
//     `checkPostSaveGating()` call. The helper's v1.1 signature no longer
//     accepts it; the DB-backed rule reads `space.reminderPromptedAt`
//     directly.
//   - No other changes. Form screen, success-screen layout, all other
//     handlers (handleSave, handleAddAnotherPhoto, handleSuccessFileChange,
//     handleFileSelect, handleChangePhoto, handleRemovePhoto, handleCancel,
//     validateAndSetFile), preview derivation effect, blob-URL lifecycle,
//     redirect-on-no-file guard, SuccessScreen props, state shape, imports —
//     all byte-identical to v2.2.
//
// Contract change (caller-side):
//   v2.2 call shape (retired):
//     checkPostSaveGating({
//       spaceId, space, memoryType: 'photo',
//       hasSeenReminderPrompt,   ← dropped
//       getApi: () => createApiClient(getAccessTokenSilently),
//     })
//   v2.3 call shape (current):
//     checkPostSaveGating({
//       spaceId, space, memoryType: 'photo',
//       getApi: () => createApiClient(getAccessTokenSilently),
//     })
//
// No editMode guard here: PhotoPage does NOT support edit via this route.
// Photo edits flow through MemoryDetailPage (see File Review Findings §6 /
// D1). The `handleViewAllMemories` handler therefore never fires on an edit
// path.
//
// Regression expectations (Session 1A.5):
//   - RG-3 Photo save flow: tertiaryCta routes through DB-backed gating.
//   - RG-6 Photo edit from feed (MemoryDetailPage path): unaffected.
//   - RG-11 (sign-out re-prompt suppression): passes via DB persistence.
//   - RG-14 Tab-close re-prompt suppression: passes via DB persistence.
//
// Previous changes (v2.2 — Session 1A):
//   - Imported `checkPostSaveGating` from `../utils/postSaveGating` v1.0.
//   - Replaced the one-line `tertiaryCta.onClick` on SuccessScreen with an
//     async handler that called the gating helper and routed via
//     /spaces/:id/reminder or /spaces/:id. Session-scoped gating flag read
//     from sessionStorage (now removed in v2.3).
//
// Previous changes (v2.1):
//   - Fixed broken image display on form + success screen + edit flows.
//   - Adopted canonical React pattern for URL.createObjectURL per MDN
//     (https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static)
//     and React community consensus (CoreUI, reactuse.com, use-object-url).
//
// What was broken in v2.0:
//   - URL.createObjectURL was called inside the useState initializer. In
//     React 18 StrictMode, useState initializers are invoked TWICE; only the
//     second result is kept in state. This leaked the first blob URL and,
//     depending on render ordering, could race against cleanup.
//   - Two revoke paths existed (manual revoke in setPreview callback and the
//     [preview]-dep cleanup effect). Harmless but redundant and obscured the
//     real lifecycle.
//
// Canonical pattern (applied in v2.1):
//   1. Store the File in state (set from location.state.file).
//   2. DERIVE the preview via useEffect keyed on [file].
//   3. Create the URL inside the effect. Close over it in the cleanup
//      return so we revoke exactly the URL we created.
//   4. The effect re-runs when `file` changes — React calls the previous
//      cleanup BEFORE the new effect setup, so the old URL is released
//      just before a new one is created. On unmount, the last cleanup
//      releases the last URL. Zero leaks, zero races.
//
//   Reference shape (from CoreUI + reactuse.com):
//     useEffect(() => {
//       if (!file) { setPreview(null); return; }
//       const url = URL.createObjectURL(file);
//       setPreview(url);
//       return () => URL.revokeObjectURL(url);
//     }, [file]);
//
// Previous changes (v2.0):
//   - Removed setTimeout-based auto-open of file picker (Safari user-gesture
//     chain fix). Reads location.state.file on mount; redirects to feed if
//     missing (refresh/deep-link).
//   - Added saved state flag and SuccessScreen integration.
//   - Added handleAddAnotherPhoto using hidden file input on success screen.
//
// Route: /spaces/:spaceId/photo (protected)

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import SuccessScreen from '../components/SuccessScreen';
import { PhotoIcon } from '../components/BrandIcons';
// v2.3: Session 1A.5 post-save gating helper (DB-backed reminder branch;
// feedback branch stubbed for Session 2). Signature dropped
// `hasSeenReminderPrompt` — caller must not pass it.
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

  const handleRemovePhoto = useCallback(() => {
    // Removing the photo drops the user back to the feed (form cannot be
    // submitted without a photo). Cleanup effect will revoke the blob URL
    // when the component unmounts.
    navigate(`/spaces/${spaceId}`, { replace: true });
  }, [navigate, spaceId]);

  const handleCancel = useCallback(() => {
    navigate(`/spaces/${spaceId}`);
  }, [navigate, spaceId]);

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

      // 3. Create photo memory
      await api.post(`/spaces/${spaceId}/memories`, {
        type: 'photo',
        s3Key: uploadData.s3Key,
        title: title.trim() || null,
        note: caption.trim() || null,
        isPrivate,
      });

      // 4. Show success screen (file state is preserved, so preview blob
      //    URL is still alive and renders in the success card).
      setSaving(false);
      setSaved(true);
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
  }, [validateAndSetFile]);

  // v2.3: "View all memories" — post-save gating handler (DB-backed).
  // Called from SuccessScreen.tertiaryCta.onClick. No editMode guard needed —
  // photo edits flow through MemoryDetailPage, not this file (File Review
  // Findings §6 / D1). Fallthrough on any error routes to the feed so the
  // user is never stuck on SuccessScreen.
  //
  // `getApi` is passed as a function per Q5 approval. PhotoPage does not
  // memoize createApiClient (each handler creates it ad-hoc), so we preserve
  // that page-level pattern by inlining the factory here (D3).
  const handleViewAllMemories = useCallback(async () => {
    try {
      const gate = await checkPostSaveGating({
        spaceId,
        space,
        memoryType: 'photo',
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

  // ─── Derived ───
  const spaceInitial = space?.name ? space.name.charAt(0).toUpperCase() : '?';

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
  //  v2.3: tertiaryCta.onClick routes through DB-backed post-save gating.
  // ═══════════════════════════════════════════════════════════

  if (saved) {
    const subtitle = title.trim()
      ? `${title.trim()} · Memory saved`
      : 'Memory saved';

    return (
      <>
        <SuccessScreen
          spaceName={space.name}
          spacePhotoUrl={space.photoUrl}
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
            <span className={styles.barSub}>Add a photo</span>
          </div>
        </div>
      </div>

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
    </div>
  );
}
