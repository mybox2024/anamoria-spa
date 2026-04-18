// MemoryDetailPage.jsx — /spaces/:spaceId/memories/:memId
// v2.3 — Post-save "Updated" confirmation moved from inline form position to
//        a banner under the sticky header. Duration 3s before navigate to feed.
//        (April 17, 2026)
//
// Changes from v2.2:
//   - Removed the inline .successToast block that sat inside .content above the
//     Save button. It displaced form content and looked like form validation.
//   - Added an .updatedBanner element rendered OUTSIDE .content, immediately
//     after the sticky header, so it appears under the header bar. The banner
//     is page-level status chrome, not form content.
//   - SAVED_TOAST_MS bumped from 1500 to 3000 to align with Red Hat /
//     Material Design 3 guidance for transient success confirmations (~3s is
//     the documented range for readable success toasts).
//   - No other behavior changes. PATCH, state, handlers, effects identical to v2.2.
//
// Intentionally UNTOUCHED from v2.2 (regression avoidance):
//   - handleBack (view-mode back arrow) — still navigate(`/spaces/${spaceId}`)
//   - Edit-mode header back arrow (←) — still setEditing(false) — separate concern
//   - handleCancelEdit — still navigate(`/spaces/${spaceId}`) immediately
//   - Voice redirect useEffect
//   - Photo/text load, photo signed URL fetch
//   - PATCH payload, field diffing, `memory` state update on success
//   - All view-mode rendering
//   - setTimeout cleanup on unmount
//   - Save/Cancel/input disable-during-toast-window behavior
//
// v2.2 — Save shows "Updated" toast on edit screen then navigates to feed
//        after 1.5s. Cancel navigates to feed immediately. (April 17, 2026)
// v2.1 — Edit mode displays photo above caption field (April 16, 2026)
// v2.0 — Voice edit removed; voice memories route to RecordPage (April 3, 2026)
//
// APIs: PATCH /memories/:id, POST /memories/:id/favorite, GET /media/playback/:key

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import styles from './MemoryDetailPage.module.css';

// v2.3: Toast duration before auto-navigate to feed after successful save.
// Bumped from 1500 → 3000 (Red Hat / Material Design 3 guidance).
const SAVED_TOAST_MS = 3000;

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

export default function MemoryDetailPage() {
  const { spaceId, memId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getAccessTokenSilently } = useAuth0();

  // Memory data
  const [memory, setMemory] = useState(location.state?.memory || null);
  const [space, setSpace] = useState(null);
  // Edit mode
  const [editing, setEditing] = useState(location.state?.editing || false);
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

  const handleBack = useCallback(() => {
    navigate(`/spaces/${spaceId}`);
  }, [navigate, spaceId]);

  const handleFavorite = useCallback(async () => {
    if (!memory) return;
    try {
      const api = createApiClient(getAccessTokenSilently);
      const result = await api.post(`/memories/${memory.id}/favorite`, {});
      setMemory(prev => ({ ...prev, isFavorite: result.isFavorite }));
    } catch (err) {
      console.error('Favorite error:', err);
    }
  }, [memory, getAccessTokenSilently]);

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
  const spaceInitial = space?.name ? space.name.charAt(0).toUpperCase() : '?';

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
        <button className={styles.btnPrimary} onClick={handleBack}>Go back</button>
      </div>
    );
  }

  // Voice memories redirect (safety — should not render)
  if (category === 'voice') return null;

  // ═══════════════════════════════════════
  //  EDIT MODE (text/photo only)
  // ═══════════════════════════════════════
  if (editing) {
    return (
      <div className={styles.screen}>
        <div className={styles.header}>
          <div className={styles.headerInner}>
            <button className={styles.backBtn} onClick={() => setEditing(false)}>←</button>
            <span className={styles.headerTitle}>Edit Memory</span>
          </div>
        </div>

        {/* v2.3: Under-header "Updated" banner — page-level status chrome.
            Rendered between .header and .content so it sits under the sticky
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
              <span className={styles.updatedBannerText}>Updated</span>
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

          {/* Note (text memories) */}
          {isText && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Memory text</label>
              <textarea
                className={styles.fieldTextarea}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Your memory..."
                maxLength={5000}
                rows={8}
                disabled={savedToast}
              />
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

          {/* v2.3: The inline .successToast block from v2.2 has been removed
              from here. Confirmation is now the under-header banner above. */}

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
      </div>
    );
  }

  // ═══════════════════════════════════════
  //  VIEW MODE (text/photo only)
  // ═══════════════════════════════════════
  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <button className={styles.backBtn} onClick={handleBack}>←</button>
          {space && (
            <div className={styles.headerSpace}>
              <div className={styles.headerAvatar}>
                {space.photoUrl ? (
                  <img src={space.photoUrl} alt={space.name} className={styles.headerAvatarImg} />
                ) : (
                  <span className={styles.headerAvatarInitial}>{spaceInitial}</span>
                )}
              </div>
              <span className={styles.headerName}>{space.name}</span>
            </div>
          )}
          <div className={styles.headerActions}>
            <button
              className={`${styles.favBtn} ${memory.isFavorite ? styles.favActive : ''}`}
              onClick={handleFavorite}
              aria-label={memory.isFavorite ? 'Unfavorite' : 'Favorite'}
            >
              ♥
            </button>
            <button className={styles.editBtn} onClick={() => setEditing(true)} aria-label="Edit">
              ✏️
            </button>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* Category + date */}
        <div className={styles.meta}>
          <span className={styles.metaCategory}>{(memory.category || '').toUpperCase()}</span>
          <span className={styles.metaDate}>{formatDate(memory.createdAt)}</span>
        </div>

        {/* Title */}
        {memory.title && (
          <h1 className={styles.title}>{memory.title}</h1>
        )}

        {/* Photo image */}
        {isPhoto && (
          <div className={styles.photoContainer}>
            {photoUrl ? (
              <img src={photoUrl} alt={memory.title || 'Photo'} className={styles.photoImg} />
            ) : (
              <div className={styles.photoPlaceholder}>
                <span>Loading photo...</span>
              </div>
            )}
          </div>
        )}

        {/* Text/note body */}
        {memory.note && (
          <div className={styles.noteBody}>
            <p className={styles.noteText}>{memory.note}</p>
          </div>
        )}

        {/* Privacy badge */}
        <div className={styles.privacyBadge}>
          {memory.isPrivate ? '🔒 Private' : '👥 Shared with family'}
        </div>
      </div>
    </div>
  );
}
