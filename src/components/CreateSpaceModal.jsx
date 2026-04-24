// components/CreateSpaceModal.jsx — Anamoria SPA
// v1.2 — Wire photo upload on space creation (April 24, 2026)
//
// Changes from v1.1:
//   - Replaced TODO stub with actual photo upload flow:
//     1. POST /spaces creates the space (returns newSpaceId)
//     2. If photoFile exists:
//        a. POST /media/upload-url → get pre-signed S3 PUT URL
//        b. PUT file to S3 via the pre-signed URL
//        c. PATCH /spaces/:id with { photoUrl: s3Key }
//     3. Photo failure does not block space creation — warning shown,
//        user can add photo later via Space Settings.
//   - Client-side validation: max 5MB, image/* MIME types only.
//   - AppContext stub now includes photoUrl for sidebar avatar rendering.
//
// v1.1 — A-4: Update AppContext spaces list after creation (April 22, 2026)
// v1.0 — April 1, 2026

import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../App';
import styles from './CreateSpaceModal.module.css';

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

export default function CreateSpaceModal({ getApi, onClose }) {
  const navigate = useNavigate();
  const appState = useAppContext();
  const fileInputRef = useRef(null);

  const [name, setName] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const isDisabled = !name.trim() || creating;

  /* ─── Photo upload ─── */

  const handlePhotoClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePhotoChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setError('Photo must be under 5MB.');
      return;
    }

    setError('');
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  }, []);

  const handleRemovePhoto = useCallback(() => {
    setPhotoPreview(null);
    setPhotoFile(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  /* ─── Upload photo to S3 and save key to space ─── */

  async function uploadSpacePhoto(api, spaceId, file) {
    // Step 1: Get pre-signed upload URL
    const mimeType = file.type || 'image/jpeg';
    const ext = mimeType.split('/')[1] || 'jpg';
    const fileName = `space-photo.${ext}`;

    const uploadData = await api.post('/media/upload-url', {
      spaceId,
      albumId: null,
      fileName,
      mimeType,
      mediaType: 'photo',
    });

    if (!uploadData?.uploadUrl || !uploadData?.s3Key) {
      throw new Error('Failed to get upload URL');
    }

    // Step 2: PUT file to S3
    const putResponse = await fetch(uploadData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: file,
    });

    if (!putResponse.ok) {
      throw new Error(`S3 upload failed: ${putResponse.status}`);
    }

    // Step 3: Save S3 key to space
    await api.patch(`/spaces/${spaceId}`, {
      photoUrl: uploadData.s3Key,
    });

    return uploadData.s3Key;
  }

  /* ─── Create space ─── */

  const handleCreate = useCallback(async () => {
    if (isDisabled) return;
    setCreating(true);
    setError('');
    try {
      const api = getApi();
      const result = await api.post('/spaces', {
        name: name.trim(),
        isPrivate: true,
      });

      const newSpaceId = result.id || result.spaceId;
      if (!newSpaceId) {
        throw new Error('No space ID returned');
      }

      // v1.2: Upload photo if one was selected
      let savedPhotoUrl = null;
      if (photoFile) {
        try {
          savedPhotoUrl = await uploadSpacePhoto(api, newSpaceId, photoFile);
        } catch (photoError) {
          console.error('Space photo upload failed:', photoError);
          // Photo failure does not block space creation.
          // User can add photo later via Space Settings.
          // We still navigate to the new space.
        }
      }

      // A-4: Update spaces list in AppContext so sidebar reflects the new space
      // without requiring a page reload or /spaces re-fetch.
      // v1.2: Include photoUrl so sidebar can show avatar immediately.
      if (appState?.updateSpaces && appState?.spaces) {
        const newSpace = {
          id: newSpaceId,
          name: name.trim(),
          privacyMode: 'private',
          photoUrl: savedPhotoUrl,
          isPinned: false,
          pinnedAt: null,
        };
        appState.updateSpaces([...appState.spaces, newSpace]);
      }

      onClose();
      navigate(`/spaces/${newSpaceId}`);
    } catch (err) {
      console.error('Create space error:', err);
      setError('Could not create space. Please try again.');
    } finally {
      setCreating(false);
    }
  }, [isDisabled, name, photoFile, getApi, navigate, onClose, appState]);

  /* ─── Backdrop click ─── */

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.modal}>

        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Create a Space</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <p className={styles.prompt}>Who is this space for?</p>

          <input
            type="text"
            className={styles.input}
            placeholder="Their name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
          />

          {/* Photo upload */}
          <div className={styles.photoRow}>
            {!photoPreview ? (
              <>
                <button className={styles.photoDashed} onClick={handlePhotoClick}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    stroke="currentColor"
                    width="24"
                    height="24"
                    style={{ opacity: 0.45 }}
                  >
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </button>
                <span className={styles.photoHelper}>Add a photo (optional)</span>
              </>
            ) : (
              <div className={styles.photoPreviewWrap}>
                <img src={photoPreview} alt="Preview" className={styles.photoPreviewImg} />
                <button className={styles.photoChange} onClick={handleRemovePhoto}>
                  Change photo
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className={styles.fileInput}
            />
          </div>
        </div>

        {/* CTA */}
        <div className={styles.cta}>
          {error && <p className={styles.error}>{error}</p>}

          <button
            className={styles.nextBtn}
            onClick={handleCreate}
            disabled={isDisabled}
          >
            {creating ? 'Creating...' : 'Next'}
          </button>

          <div className={styles.privacyNote}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <span>This space will be private</span>
          </div>
        </div>

      </div>
    </div>
  );
}
