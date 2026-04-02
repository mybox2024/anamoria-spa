// PhotoPage.jsx — /spaces/:spaceId/photo
// Flow: select photo → preview → caption/title → privacy → save
// Save sequence: POST /media/upload-url → PUT S3 → POST /spaces/:id/memories
// Ported from LWC currentStep === 'photoSave'

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import styles from './PhotoPage.module.css';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default function PhotoPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();

  // Space data
  const [space, setSpace] = useState(null);
  // Photo state
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  // Form state
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

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

  // ─── Auto-open file picker if no photo selected ───
  useEffect(() => {
    if (space && !file && fileInputRef.current) {
      // Small delay so screen renders first
      const t = setTimeout(() => fileInputRef.current?.click(), 200);
      return () => clearTimeout(t);
    }
  }, [space, file]);

  // ─── Clean up object URL on unmount ───
  useEffect(() => {
    return () => {
      if (preview && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  // ─── Handlers ───

  const handleFileSelect = useCallback((e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Validate type
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError('Please select a JPEG, PNG, or WebP image.');
      return;
    }

    // Validate size
    if (selected.size > MAX_FILE_SIZE) {
      setError('Photo must be under 10 MB.');
      return;
    }

    setError(null);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }, []);

  const handleChangePhoto = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRemovePhoto = useCallback(() => {
    if (preview && preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview);
    }
    setFile(null);
    setPreview(null);
    // Reset file input so re-selecting same file works
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [preview]);

  const handleCancel = useCallback(() => {
    navigate(`/spaces/${spaceId}`);
  }, [navigate, spaceId]);

  const handleSave = useCallback(async () => {
    if (!file || saving) return;
    setSaving(true);
    setError(null);

    try {
      const api = createApiClient(getAccessTokenSilently);

      // Strip codecs suffix from MIME if present (same fix as voice recording)
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

      // 4. Navigate back to feed
      navigate(`/spaces/${spaceId}`);
    } catch (err) {
      console.error('Photo save error:', err);
      setError("Something didn't save. Please try again.");
      setSaving(false);
    }
  }, [file, saving, title, caption, isPrivate, spaceId, getAccessTokenSilently, navigate]);

  // ─── Derived ───
  const spaceInitial = space?.name ? space.name.charAt(0).toUpperCase() : '?';

  // ─── Loading ───
  if (!space) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingDot} />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      {/* Hidden file input */}
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
        {/* Photo preview / upload area */}
        {preview ? (
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
        ) : (
          <div className={styles.uploadArea} onClick={handleChangePhoto}>
            <span className={styles.uploadIcon}>📷</span>
            <span className={styles.uploadLabel}>Tap to select a photo</span>
            <span className={styles.uploadHint}>JPEG, PNG, or WebP · up to 10 MB</span>
          </div>
        )}

        {/* Title input */}
        {preview && (
          <>
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
          </>
        )}

        {/* Error when no photo */}
        {!preview && error && (
          <div className={styles.errorBanner}>{error}</div>
        )}
      </div>
    </div>
  );
}
