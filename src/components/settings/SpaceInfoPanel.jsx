// components/settings/SpaceInfoPanel.jsx — Anamoria SPA
// v1.2 — Space photo management (April 24, 2026)
//
// Changes from v1.1:
//   - Added SPACE PHOTO section between Space Name and Voice Card Style.
//   - If space has a photo (space.photoUrl), shows circular preview with
//     "Change photo" and "Remove photo" buttons.
//   - If no photo, shows dashed circle + camera icon + "Add a photo" label.
//   - Photo upload uses POST /media/upload-url → PUT → included in save payload.
//   - Remove photo sets photoUrl to null in the PATCH body.
//   - Photo changes are saved together with name/theme on "Save" click.
//   - Resolves S3 key to CloudFront signed URL for display via GET /media/playback/{key}.
//
// v1.1 — Screenshot thumbnails replace CSS-drawn previews (April 21, 2026)
// v1.0 — Space name + voice card style picker (April 11, 2026)
//
// Props:
//   space    — current space object (from SettingsPage state)
//   getApi   — stable API client factory
//   onSave   — callback with full updated space object (for parent state sync)

import { useState, useEffect, useRef, useCallback } from 'react';
import { THEME_OPTIONS } from './settingsUtils';
import { invalidateCache } from '../../utils/apiCache';
import shared from './settingsShared.module.css';
import styles from './SpaceInfoPanel.module.css';

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

export default function SpaceInfoPanel({ space, getApi, onSave }) {
  // ─── Editable state (initialized from space prop) ───
  const [editName, setEditName] = useState(space.name || '');
  const [editTheme, setEditTheme] = useState(space.voiceCardTheme || 'warm');

  // ─── Photo state ───
  const [photoS3Key, setPhotoS3Key] = useState(space.photoUrl || null);
  const [photoDisplayUrl, setPhotoDisplayUrl] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null); // local preview for new uploads
  const [pendingPhotoFile, setPendingPhotoFile] = useState(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef(null);

  // ─── Save state ───
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // ─── Timeout ref for cleanup ───
  const savedTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // ─── Re-initialize from space prop when it changes ───
  useEffect(() => {
    setEditName(space.name || '');
    setEditTheme(space.voiceCardTheme || 'warm');
    setPhotoS3Key(space.photoUrl || null);
    setPhotoPreview(null);
    setPendingPhotoFile(null);
    setPhotoRemoved(false);
  }, [space.name, space.voiceCardTheme, space.photoUrl]);

  // ─── Resolve existing S3 key to CloudFront signed URL for display ───
  useEffect(() => {
    if (!photoS3Key || photoRemoved) {
      setPhotoDisplayUrl(null);
      return;
    }
    let cancelled = false;
    async function resolve() {
      try {
        const api = getApi();
        const data = await api.get(`/media/playback/${photoS3Key}`);
        if (!cancelled && data?.playbackUrl) {
          setPhotoDisplayUrl(data.playbackUrl);
        }
      } catch (err) {
        console.error('Failed to resolve space photo URL:', err);
        if (!cancelled) setPhotoDisplayUrl(null);
      }
    }
    resolve();
    return () => { cancelled = true; };
  }, [photoS3Key, photoRemoved, getApi]);

  // ─── Photo handlers ───

  const handlePhotoClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePhotoChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('Please select an image file.');
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setPhotoError('Photo must be under 5MB.');
      return;
    }

    setPhotoError('');
    setPendingPhotoFile(file);
    setPhotoRemoved(false);

    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  }, []);

  const handleRemovePhoto = useCallback(() => {
    setPhotoPreview(null);
    setPendingPhotoFile(null);
    setPhotoRemoved(true);
    setPhotoError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ─── Save handler (includes photo upload) ───
  const handleSave = useCallback(async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError('Space name cannot be empty.');
      return;
    }

    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const api = getApi();
      const body = {
        name: trimmedName,
        voiceCardTheme: editTheme,
      };

      // Handle photo changes
      if (pendingPhotoFile) {
        // Upload new photo to S3, then include key in PATCH
        try {
          const mimeType = pendingPhotoFile.type || 'image/jpeg';
          const ext = mimeType.split('/')[1] || 'jpg';
          const fileName = `space-photo.${ext}`;

          const uploadData = await api.post('/media/upload-url', {
            spaceId: space.id,
            albumId: null,
            fileName,
            mimeType,
            mediaType: 'photo',
          });

          if (!uploadData?.uploadUrl || !uploadData?.s3Key) {
            throw new Error('Failed to get upload URL');
          }

          const putResponse = await fetch(uploadData.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': mimeType },
            body: pendingPhotoFile,
          });

          if (!putResponse.ok) {
            throw new Error(`S3 upload failed: ${putResponse.status}`);
          }

          body.photoUrl = uploadData.s3Key;
        } catch (photoErr) {
          console.error('Photo upload failed:', photoErr);
          setError('Photo upload failed. Other changes saved.');
          // Continue with save — name and theme still update
        }
      } else if (photoRemoved) {
        // Remove photo — set to null
        body.photoUrl = null;
      }

      const updated = await api.patch(`/spaces/${space.id}`, body);

      if (onSave) onSave(updated);

      // Invalidate space detail cache so SpacePage fetches fresh data
      // (including new photoUrl) on next mount. See Tier A CF-1.
      invalidateCache(`space:${space.id}`);

      // Reset photo pending state after successful save
      setPendingPhotoFile(null);
      setPhotoPreview(null);
      setPhotoRemoved(false);
      if (updated.photoUrl) {
        setPhotoS3Key(updated.photoUrl);
      } else {
        setPhotoS3Key(null);
        setPhotoDisplayUrl(null);
      }

      setSaved(true);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('SpaceInfoPanel save error:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [editName, editTheme, pendingPhotoFile, photoRemoved, getApi, space.id, onSave]);

  // ─── Determine what photo to show ───
  const displayPhoto = photoPreview || (photoRemoved ? null : photoDisplayUrl);
  const showPhotoPlaceholder = !displayPhoto;

  // ─── Render ───
  return (
    <div>
      {/* ══════ Space Name ══════ */}
      <div className={shared.section}>
        <h3 className={shared.sectionTitle}>SPACE INFO</h3>

        <div className={shared.formGroup}>
          <label className={shared.formLabel}>Space Name</label>
          <input
            type="text"
            className={shared.formInput}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={100}
          />
        </div>
      </div>

      {/* ══════ Space Photo ══════ */}
      <div className={shared.section}>
        <h3 className={shared.sectionTitle}>SPACE PHOTO</h3>
        <p className={shared.hint}>This photo appears as the avatar for this space.</p>

        <div className={styles.photoSection}>
          {showPhotoPlaceholder ? (
            <div className={styles.photoPlaceholder} onClick={handlePhotoClick}>
              <div className={styles.photoDashed}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  stroke="currentColor"
                  width="28"
                  height="28"
                  style={{ opacity: 0.4 }}
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <span className={styles.photoAddLabel}>Add a photo</span>
            </div>
          ) : (
            <div className={styles.photoPreviewSection}>
              <img
                src={displayPhoto}
                alt={`${space.name} photo`}
                className={styles.photoPreviewCircle}
              />
              <div className={styles.photoActions}>
                <button className={styles.photoActionBtn} onClick={handlePhotoClick}>
                  Change photo
                </button>
                <button
                  className={`${styles.photoActionBtn} ${styles.photoActionRemove}`}
                  onClick={handleRemovePhoto}
                >
                  Remove photo
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className={styles.fileInput}
          />

          {photoError && <p className={styles.photoError}>{photoError}</p>}
        </div>
      </div>

      {/* ══════ Voice Card Style ══════ */}
      <div className={shared.section}>
        <h3 className={shared.sectionTitle}>VOICE CARD STYLE</h3>
        <p className={shared.hint}>Choose how your voice notes appear in the feed.</p>
        <div className={styles.themePicker}>
          {THEME_OPTIONS.map((theme) => (
            <div
              key={theme.value}
              className={`${styles.themeOption} ${editTheme === theme.value ? styles.themeSelected : ''}`}
              onClick={() => setEditTheme(theme.value)}
              role="radio"
              aria-checked={editTheme === theme.value}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setEditTheme(theme.value);
                }
              }}
            >
              <img
                className={styles.themePreviewImg}
                src={theme.imagePath}
                alt={`${theme.label} voice card theme`}
              />
              <span className={styles.themePickerName}>{theme.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════ Footer: Save + feedback ══════ */}
      <div className={shared.panelFooter}>
        <button
          className={shared.saveBtn}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && <span className={shared.savedFade}>Saved ✓</span>}
      </div>

      {error && <p className={shared.errorMsg}>{error}</p>}
    </div>
  );
}
