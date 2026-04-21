// pages/ContributorPhotoPage.jsx — Anamoria SPA
// v1.0 — Session 3 (April 19, 2026)
//
// Contributor photo capture page. Parallel to owner PhotoPage.jsx v2.4 but
// adapted for contributor context.
//
// Route: /contribute/:spaceId/photo
//
// CSS: Reuses PhotoPage.module.css per Session 3 Plan v1.1 decision B2
// (new component, shared CSS module). Zero CSS duplication.
//
// File arrival pattern (Safari user-gesture preservation):
//   User taps Photo in ContributorBottomNav → file picker opens in same
//   click handler → user selects file → BottomNav calls
//   navigate('/contribute/:spaceId/photo', { state: { file } }). This page
//   reads location.state.file on mount. If no file present (refresh, direct
//   URL), redirects to /contribute/:spaceId/memories.
//
// Differences from owner PhotoPage v2.4:
//   - Auth: createContributorApiClient (session token) instead of Auth0 JWT
//   - Space fetch: GET /contribute/:spaceId instead of /spaces/:id
//   - Upload URL: POST /contribute/:spaceId/upload-url (new Lambda v1.2 route,
//     verified in Step 1.6 smoke tests B-6 / B-7 / B-8). spaceId is from path;
//     body is {mimeType, mediaType} — owner route took spaceId in body.
//   - Memory create: POST /contribute/:spaceId/memories with
//     {type:'photo', s3Key, title, note} — no isPrivate (Lambda hardcodes
//     FALSE for contributor memories per decision V).
//   - No privacy toggle — contributor memories always shared.
//   - No SuccessScreen — saved pill toast + navigate to feed (S2 decision,
//     Q2-revised, matches ContributorWritePage pattern and RK-4 avoidance).
//   - No "Add another photo" flow — toast + navigate to feed; contributor
//     picks Photo again from bottom nav if they want to add another.
//   - No post-save gating (reminder/feedback) — contributor flow has none.
//   - Redirect-on-no-file → /contribute/:spaceId/memories (feed).
//   - Cancel / Remove photo → /contribute/:spaceId/memories.
//
// Structure preserved:
//   - File-as-source-of-truth + derived preview via URL.createObjectURL
//   - Validation (MIME allowlist, 10MB size limit) — same as owner
//   - Title + caption form (both optional)
//   - Same three-step save: upload-url → S3 PUT → memory POST
//
// MIME + size limits match owner PhotoPage v2.4 exactly. If the allowlist
// changes in the Lambda (ALLOWED_MIME_TYPES.photo), update both PhotoPage
// files to keep frontend in sync with backend validation.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { createContributorApiClient, getSessionToken } from '../api/contributorApi';
import styles from './PhotoPage.module.css';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — matches owner PhotoPage + Lambda validation
const TOAST_DURATION_MS = 2500;         // matches ContributorWritePage toast timing

/* ═══════════════════════════════════════
   CONTRIBUTOR PHOTO PAGE
   ═══════════════════════════════════════ */

export default function ContributorPhotoPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // ─── Space data ───
  const [space, setSpace] = useState(null);

  // ─── File + preview (canonical pattern from owner PhotoPage) ───
  const [file, setFile] = useState(location.state?.file || null);
  const [preview, setPreview] = useState(null);

  // ─── Form state ───
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');

  // ─── UI state ───
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showSavedPill, setShowSavedPill] = useState(false);

  // ─── Refs ───
  const fileInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  /* ─── Derive preview from file (canonical URL.createObjectURL pattern) ─── */
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
        if (!cancelled) setSpace(data);
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

  /* ─── Redirect if no file was passed via location.state ─── */
  // Same guard as owner: protects against refresh (File can't survive reload)
  // and direct URL hits. Runs once after mount.
  useEffect(() => {
    if (!location.state?.file) {
      navigate(`/contribute/${spaceId}/memories`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Cleanup toast timer on unmount ─── */
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  /* ─── File validation (matches owner PhotoPage) ─── */
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
    setFile(selected);
    return true;
  }, []);

  /* ─── "Change photo" handler ─── */
  const handleFileSelect = useCallback((e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    validateAndSetFile(selected);
  }, [validateAndSetFile]);

  const handleChangePhoto = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRemovePhoto = useCallback(() => {
    navigate(`/contribute/${spaceId}/memories`, { replace: true });
  }, [navigate, spaceId]);

  const handleCancel = useCallback(() => {
    navigate(`/contribute/${spaceId}/memories`);
  }, [navigate, spaceId]);

  /* ─── Save ─── */
  const handleSave = useCallback(async () => {
    if (!file || saving) return;
    setSaving(true);
    setError(null);

    try {
      const api = createContributorApiClient();
      const mimeType = file.type.split(';')[0];

      // 1. Get pre-signed upload URL from contributor route (verified B-6/B-7).
      //    Contributor route takes spaceId in path, NOT in body (differs
      //    from owner route 13).
      const uploadData = await api.post(`/contribute/${spaceId}/upload-url`, {
        mimeType,
        mediaType: 'photo',
      });

      // 2. PUT file directly to S3. The pre-signed URL is self-authorizing
      //    via X-Amz-Signature; no auth headers required (same as owner).
      await api.putS3(uploadData.uploadUrl, file, mimeType);

      // 3. Create contributor photo memory.
      //    Response: { id, type: 'photo', spaceId, s3Key, createdAt } per
      //    Lambda v1.2 handleContributorCreateMemory. We don't need the id
      //    for anything in this flow (no gating), so response is discarded.
      await api.post(`/contribute/${spaceId}/memories`, {
        type: 'photo',
        s3Key: uploadData.s3Key,
        title: title.trim() || null,
        note: caption.trim() || null,
        // No isPrivate — Lambda hardcodes FALSE for contributor memories.
      });

      // Show saved pill, then navigate.
      setSaving(false);
      setShowSavedPill(true);
      toastTimerRef.current = setTimeout(() => {
        navigate(`/contribute/${spaceId}/memories`, { replace: true });
      }, TOAST_DURATION_MS);
    } catch (err) {
      console.error('Photo save error:', err);
      if (err.error === 'INVALID_SESSION' || err.error === 'NO_SESSION_TOKEN') {
        setError('Your session has expired. Please use your invite link again.');
      } else if (err.error === 'S3_UPLOAD_FAILED') {
        setError("Upload failed. Please check your connection and try again.");
      } else {
        setError("Something didn't save. Please try again.");
      }
      setSaving(false);
    }
  }, [file, saving, title, caption, spaceId, navigate]);

  /* ─── Derived ─── */
  const spaceName = space?.spaceName || 'this space';
  const spaceInitial = (spaceName || '?').charAt(0).toUpperCase();

  /* ─── Loading state (space fetch) ─── */
  if (!space && !error) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingDot} />
        <span>Loading...</span>
      </div>
    );
  }

  /* ─── Error state (pre-load — e.g., session expired before space fetched) ─── */
  if (error && !space) {
    return (
      <div className={styles.loading}>
        <p style={{ padding: '24px', textAlign: 'center' }}>{error}</p>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     PHOTO-SAVE FORM
     ═══════════════════════════════════════════════════════════ */

  return (
    <div className={styles.screen}>
      {/* Hidden file input — used by "Change photo" button */}
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
            {space?.photoUrl ? (
              <img src={space.photoUrl} alt={spaceName} className={styles.barAvatarImg} />
            ) : (
              <span className={styles.barAvatarInitial}>{spaceInitial}</span>
            )}
          </div>
          <div className={styles.barInfo}>
            <span className={styles.barName}>{spaceName}</span>
            <span className={styles.barSub}>Add a photo</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Photo preview */}
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

        {/* Error */}
        {error && <div className={styles.errorBanner}>{error}</div>}

        {/* Actions */}
        <div className={styles.actions}>
          <button
            className={styles.btnPrimary}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Uploading...' : `Save to ${spaceName}'s space`}
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

      {/* Saved pill toast */}
      {showSavedPill && <SavedPill />}
    </div>
  );
}

/* ═══════════════════════════════════════
   SAVED PILL TOAST
   Inline component — mirrors ContributorWritePage SavedPill exactly so
   contributor capture flows have consistent success feedback. If this
   pattern repeats more, extract to src/components/Toast.jsx (future
   refactor, not Session 3 scope).
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
