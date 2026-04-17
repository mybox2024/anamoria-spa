// MemoryDetailPage.jsx — /spaces/:spaceId/memories/:memId
// v2.1 — Edit mode displays photo above caption field (April 16, 2026)
//
// Changes from v2.0:
//   - In edit mode, when the memory is a photo and photoUrl has resolved,
//     render the <img> above the caption field. Reuses existing .photoContainer
//     and .photoImg classes from view mode — no new CSS required.
//   - No other changes. View mode, edit mode for text memories, save logic,
//     voice-redirect behavior all unchanged.
//
// v2.0 — Voice edit removed; voice memories now route to RecordPage (April 3, 2026)
//
// This page handles text and photo memory detail/edit only.
// Voice memories are edited via RecordPage Review screen (5b).
//
// APIs: PATCH /memories/:id, POST /memories/:id/favorite, GET /media/playback/:key

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import styles from './MemoryDetailPage.module.css';

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
  // Photo
  const [photoUrl, setPhotoUrl] = useState(null);
  // UI
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!location.state?.memory);

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

  const handleSaveEdit = useCallback(async () => {
    if (saving) return;
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
      setEditing(false);
    } catch (err) {
      console.error('Save edit error:', err);
      setError("Couldn't save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [saving, editTitle, editNote, editPrivate, memory, getAccessTokenSilently]);

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
              />
            </div>
          )}

          {/* Caption (photo memories) */}
          {isPhoto && (
            <>
              {/* v2.1: Show the photo above the caption field in edit mode.
                  Reuses .photoContainer / .photoImg classes from view mode
                  (no new CSS). photoUrl is fetched by the same useEffect
                  that powers view mode, so it's available here too. */}
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
                />
              </div>
            </>
          )}

          {/* Privacy toggle */}
          <div className={styles.privacyRow} onClick={() => setEditPrivate((p) => !p)}>
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
            <button className={styles.btnPrimary} onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button className={styles.btnGhost} onClick={() => setEditing(false)} disabled={saving}>
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
