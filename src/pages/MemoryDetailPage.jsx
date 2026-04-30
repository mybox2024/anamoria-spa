// MemoryDetailPage.jsx — /spaces/:spaceId/memories/:memId
// v2.5 — Defensive {name} substitution in PromptBanner prop (April 27, 2026)
//
// Changes from v2.4:
//   - Defensive .replace('{name}', space.name) on memory.promptText before
//     passing to PromptBanner. Handles any stored prompt_text rows that
//     contain the raw {name} placeholder (migration 019 backfill edge case).
//     Data was also fixed server-side (UPDATE 87 rows). This is a safety net.
//   - One-line change only. Zero other modifications.
//   - SC-x banner polish: "Updated" → "Your changes are saved"
//
// Previous changes (v2.4):
//   - I-5 fix: Removed the entire view-mode render block. Component always
//     renders in edit mode. If mounted without editing:true in location.state,
//     auto-sets editing = true. No intermediate view page ever appears.
//     Back arrow uses navigate(-1) (browser history pop) instead of
//     setEditing(false).
//
//   - I-4 fix: Replaced plain "Edit Memory" header with shared <LovedOneBar>
//     component showing space avatar + name + contextual subtitle
//     ("Edit text memory" / "Edit photo memory").
//
//   - I-7 fix: Added <PromptBanner> after LovedOneBar showing the memory's
//     denormalized promptText (populated by migration 019 + Lambda v2.5).
//     Memories without promptText simply don't show the banner.
//
//   - I-6: Added LeaveConfirmModal. Back arrow checks for unsaved changes
//     (comparing current form state to original memory values). If dirty,
//     shows modal; if clean, navigates back directly.
//
//   - Removed: handleBack (view-mode), handleFavorite, setEditing(true/false)
//     calls, formatDate helper, spaceInitial derived value — all view-mode
//     only code.
//
//   - Kept unchanged: handleSaveEdit, handleCancelEdit, PATCH payload,
//     field diffing, memory state update on success, savedToast/banner,
//     setTimeout cleanup, voice redirect, photo signed URL fetch, loading,
//     error states. All byte-identical to v2.3.
//
// Previous changes (v2.3 — Under-header "Updated" banner, April 17, 2026)
// v2.2 — Save shows "Updated" toast then navigates to feed (April 17, 2026)
// v2.1 — Edit mode displays photo above caption field (April 16, 2026)
// v2.0 — Voice edit removed; voice memories route to RecordPage (April 3, 2026)
//
// APIs: PATCH /memories/:id, GET /media/playback/:key

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import { useResolvedPhotoUrl } from '../hooks/useResolvedPhotoUrl';
import LovedOneBar from '../components/LovedOneBar';
import PromptBanner from '../components/PromptBanner';
import LeaveConfirmModal from '../components/LeaveConfirmModal';
import DictateButton from '../components/DictateButton';
import styles from './MemoryDetailPage.module.css';

// v2.3: Toast duration before auto-navigate to feed after successful save.
// Bumped from 1500 → 3000 (Red Hat / Material Design 3 guidance).
const SAVED_TOAST_MS = 3000;

export default function MemoryDetailPage() {
  const { spaceId, memId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessTokenSilently } = useAuth0();

  // Memory data
  const [memory, setMemory] = useState(location.state?.memory || null);
  const [space, setSpace] = useState(null);
  // v2.4: Resolve S3 key to signed CloudFront URL for LovedOneBar avatar.
  const resolvedPhotoUrl = useResolvedPhotoUrl(space, getAccessTokenSilently);
  // v2.4: editing state is always true — view mode removed.
  // Kept as state (not a constant) because the init-edit-fields effect
  // depends on it, and the existing pattern works cleanly.
  const [editing, setEditing] = useState(true);
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editPrivate, setEditPrivate] = useState(true);
  const [saving, setSaving] = useState(false);
  // v2.2: Post-save confirmation state. Drives the under-header banner in v2.3.
  const [savedToast, setSavedToast] = useState(false);
  // Photo
  const [photoUrl, setPhotoUrl] = useState(null);
  // UI
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!location.state?.memory);

  // v2.6: Leave-without-saving modal state (I-6).
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // v2.2: Hold the pending-nav timer so we can clear it on unmount.
  const savedNavTimerRef = useRef(null);

  // ─── Redirect voice memories to RecordPage ───
  useEffect(() => {
    if (memory && (memory.category || '').toLowerCase() === 'voice') {
      navigate(`/spaces/${spaceId}/record`, {
        state: { editMode: true, editMemory: memory },
        replace: true,
      });
    }
  }, [memory, spaceId, navigate]);

  // ─── Load memory + space data ───
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const api = createApiClient(getAccessTokenSilently);
      try {
        const spaceData = await api.get(`/spaces/${spaceId}`);
        if (cancelled) return;
        setSpace(spaceData);

        if (!memory) {
          const feedData = await api.get(`/spaces/${spaceId}/memories?limit=100&offset=0`);
          const found = (feedData.memories || []).find(m => m.id === memId);
          if (found) {
            setMemory(found);
          } else {
            setError('Memory not found.');
          }
        }
      } catch (err) {
        console.error('Detail load error:', err);
        if (!cancelled) setError('Failed to load memory.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId, memId, getAccessTokenSilently]);

  // ─── Fetch photo signed URL ───
  useEffect(() => {
    if (!memory) return;
    const category = (memory.category || '').toLowerCase();
    if (category !== 'photo' || !memory.s3Key) return;

    let cancelled = false;
    async function loadPhoto() {
      try {
        const api = createApiClient(getAccessTokenSilently);
        const data = await api.get(`/media/playback/${encodeURIComponent(memory.s3Key)}`);
        if (!cancelled) setPhotoUrl(data.playbackUrl);
      } catch (err) {
        console.error('Photo load error:', err);
      }
    }
    loadPhoto();
    return () => { cancelled = true; };
  }, [memory, getAccessTokenSilently]);

  // ─── Init edit fields ───
  useEffect(() => {
    if (editing && memory) {
      setEditTitle(memory.title || '');
      setEditNote(memory.note || '');
      setEditPrivate(memory.isPrivate ?? true);
    }
  }, [editing, memory]);

  // v2.2: Clear any pending nav timer on unmount so we don't navigate after
  // the component is gone (React 18 strict-mode safe).
  useEffect(() => {
    return () => {
      if (savedNavTimerRef.current) {
        clearTimeout(savedNavTimerRef.current);
        savedNavTimerRef.current = null;
      }
    };
  }, []);

  // ─── Handlers ───

  // v2.4: Dictation handler for text memory edit — appends transcript to
  // editNote, matching WritePage's handleDictation pattern.
  const handleDictation = useCallback((transcript) => {
    setEditNote((prev) => {
      const separator = prev && !prev.endsWith(' ') ? ' ' : '';
      const next = prev + separator + transcript;
      return next.length <= 5000 ? next : next.substring(0, 5000);
    });
  }, []);

  // v2.4: Dirty detection for leave-without-saving modal (I-6).
  // Compares current form state to original memory values.
  const hasUnsavedChanges = useCallback(() => {
    if (!memory) return false;
    return (
      editTitle !== (memory.title || '') ||
      editNote !== (memory.note || '') ||
      editPrivate !== (memory.isPrivate ?? true)
    );
  }, [editTitle, editNote, editPrivate, memory]);

  // v2.4: Edit-mode back arrow handler (I-5 + I-6).
  // If dirty, show leave-confirm modal. If clean, navigate(-1).
  const handleEditBack = useCallback(() => {
    if (hasUnsavedChanges()) {
      setShowLeaveConfirm(true);
    } else {
      navigate(-1);
    }
  }, [hasUnsavedChanges, navigate]);

  // v2.2: Cancel from feed-originated edit → go back to feed. No view mode.
  const handleCancelEdit = useCallback(() => {
    navigate(`/spaces/${spaceId}`);
  }, [navigate, spaceId]);

  const handleSaveEdit = useCallback(async () => {
    if (saving || savedToast) return;
    setSaving(true);
    setError(null);
    try {
      const api = createApiClient(getAccessTokenSilently);
      const updates = {};
      if (editTitle !== (memory.title || '')) updates.title = editTitle.trim() || null;
      if (editNote !== (memory.note || '')) updates.note = editNote.trim() || null;
      if (editPrivate !== memory.isPrivate) updates.isPrivate = editPrivate;

      if (Object.keys(updates).length > 0) {
        const result = await api.patch(`/memories/${memory.id}`, updates);
        setMemory(prev => ({
          ...prev,
          title: result.title ?? prev.title,
          isPrivate: result.isPrivate ?? prev.isPrivate,
          note: editNote.trim() || prev.note,
        }));
      }

      // v2.2: Show "Updated" confirmation, then navigate to feed after
      // SAVED_TOAST_MS. No intermediate view mode.
      // v2.3: Confirmation now renders as an under-header banner (not inline).
      setSavedToast(true);
      savedNavTimerRef.current = setTimeout(() => {
        navigate(`/spaces/${spaceId}`);
      }, SAVED_TOAST_MS);
    } catch (err) {
      console.error('Save edit error:', err);
      setError("Couldn't save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [saving, savedToast, editTitle, editNote, editPrivate, memory, getAccessTokenSilently, navigate, spaceId]);

  // ─── Derived ───
  const category = (memory?.category || '').toLowerCase();
  const isText = category === 'text';
  const isPhoto = category === 'photo';

  // ─── Loading ───
  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingDot} />
        <span>Loading...</span>
      </div>
    );
  }

  if (!memory) {
    return (
      <div className={styles.errorScreen}>
        <p>{error || 'Memory not found.'}</p>
        <button className={styles.btnPrimary} onClick={() => navigate(`/spaces/${spaceId}`)}>Go back</button>
      </div>
    );
  }

  // Voice memories redirect (safety — should not render)
  if (category === 'voice') return null;

  // ═══════════════════════════════════════
  //  EDIT MODE (always — view mode removed in v2.4)
  // ═══════════════════════════════════════
  return (
    <div className={styles.screen}>
      {/* v2.4 I-4 fix: Shared LovedOneBar replaces plain "Edit Memory" header.
          Back arrow uses dirty-check guard (I-5 + I-6). */}
      <LovedOneBar
        spaceName={space?.name || ''}
        spacePhotoUrl={resolvedPhotoUrl}
        subtitle={`Edit ${isPhoto ? 'photo' : 'text'} memory`}
        onBack={handleEditBack}
        backLabel="Back"
      />

      {/* v2.4 I-7 fix: PromptBanner showing the memory's denormalized
          promptText (populated by migration 019 + Lambda v2.5).
          Memories without promptText simply don't show the banner. */}
      {memory.promptText && (
        <PromptBanner
          prompt={{ text: memory.promptText?.replace('{name}', space?.name || ''), title: memory.promptTitle || 'CONTRIBUTE' }}
          showSkip={false}
          fullWidth
        />
      )}

      {/* v2.3: Under-header "Updated" banner — page-level status chrome.
          Rendered between header and .content so it sits under the sticky
          header and above the form. Auto-dismiss is handled by the
          setTimeout in handleSaveEdit which then navigates to the feed. */}
      {savedToast && (
        <div
          className={styles.updatedBanner}
          role="status"
          aria-live="polite"
        >
          <div className={styles.updatedBannerInner}>
            <span className={styles.updatedBannerIcon} aria-hidden="true">✓</span>
            <span className={styles.updatedBannerText}>Your changes are saved</span>
          </div>
        </div>
      )}

      <div className={styles.content}>
        {/* Title */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Title</label>
          <input
            type="text"
            className={styles.fieldInput}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Give it a title (optional)"
            maxLength={75}
            disabled={savedToast}
          />
        </div>

        {/* Note (text memories) — with dictation support */}
        {isText && (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Memory text</label>
            <div className={styles.textareaWrap}>
              <textarea
                className={styles.fieldTextarea}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Your memory..."
                maxLength={5000}
                rows={8}
                disabled={savedToast}
              />
              {!savedToast && (
                <div className={styles.dictatePosition}>
                  <DictateButton onTranscript={handleDictation} size="medium" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Caption (photo memories) */}
        {isPhoto && (
          <>
            {/* v2.1: Show the photo above the caption field in edit mode. */}
            {photoUrl && (
              <div className={styles.photoContainer}>
                <img
                  src={photoUrl}
                  alt={memory.title || 'Photo'}
                  className={styles.photoImg}
                />
              </div>
            )}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Caption</label>
              <textarea
                className={styles.fieldTextarea}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="What's the story behind this photo?"
                maxLength={2000}
                rows={4}
                disabled={savedToast}
              />
            </div>
          </>
        )}

        {/* Privacy toggle */}
        <div
          className={styles.privacyRow}
          onClick={() => { if (!savedToast) setEditPrivate((p) => !p); }}
        >
          <div className={styles.privacyLabel}>
            <span className={styles.privacyIcon}>{editPrivate ? '🔒' : '👥'}</span>
            <span className={styles.privacyText}>
              {editPrivate ? 'Private — only you' : 'Shared with family'}
            </span>
          </div>
          <div className={`${styles.toggleTrack} ${editPrivate ? styles.togglePrivate : styles.toggleShared}`}>
            <div className={styles.toggleThumb} />
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.actions}>
          <button
            className={styles.btnPrimary}
            onClick={handleSaveEdit}
            disabled={saving || savedToast}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            className={styles.btnGhost}
            onClick={handleCancelEdit}
            disabled={saving || savedToast}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* v2.4 I-6: Leave-without-saving modal */}
      <LeaveConfirmModal
        open={showLeaveConfirm}
        message="Your changes won't be saved if you leave now."
        icon="edit"
        onKeepEditing={() => setShowLeaveConfirm(false)}
        onLeave={() => {
          setShowLeaveConfirm(false);
          navigate(-1);
        }}
      />
    </div>
  );
}
