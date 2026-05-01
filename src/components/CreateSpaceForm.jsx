// components/CreateSpaceForm.jsx — Anamoria SPA
// v1.0 — May 1, 2026
//
// Purpose:
//   Shared form body for creating a Space. Renders the prompt, name input,
//   photo upload row, CTA button, and privacy footer. Owns all state and
//   the create-space + S3 photo upload flow.
//
//   Currently consumed by:
//     - src/pages/CreateSpacePage.jsx (full-page route at /spaces/new)
//
//   The CreateSpaceModal v1.2 still has its own inline copy of this logic.
//   When the modal is next touched, replace its inline body+cta with
//   <CreateSpaceForm/> and remove the inline copy.
//
// Logic source: ported verbatim from CreateSpaceModal.jsx v1.2.
//   - Same state (name, photoFile, photoPreview, creating, error)
//   - Same client-side validation (image/* MIME, ≤ 5MB)
//   - Same 3-step S3 upload (POST /media/upload-url → PUT to S3 → PATCH /spaces/:id)
//   - Same AppContext sidebar update
//   - Photo failure does NOT block space creation (graceful degradation)
//
// Props:
//   getApi      function     Required. Returns API client. Same shape modal expects.
//   onSuccess   function     Required. Called with newSpaceId after successful creation.
//                            Caller is responsible for navigation / closing.
//   ctaLabel    string       Optional. Defaults to "Next". Page passes "Create space".
//   autoFocus   boolean      Optional. Defaults to true.

import { useState, useCallback, useRef } from 'react';
import { useAppContext } from '../App';
import styles from './CreateSpaceForm.module.css';

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB

export default function CreateSpaceForm({
  getApi,
  onSuccess,
  ctaLabel = 'Next',
  autoFocus = true,
}) {
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

      // Upload photo if one was selected
      let savedPhotoUrl = null;
      if (photoFile) {
        try {
          savedPhotoUrl = await uploadSpacePhoto(api, newSpaceId, photoFile);
        } catch (photoError) {
          console.error('Space photo upload failed:', photoError);
          // Photo failure does not block space creation.
          // User can add photo later via Space Settings.
        }
      }

      // Update spaces list in AppContext so sidebar reflects the new space
      // without requiring a page reload or /spaces re-fetch.
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

      // Hand off to caller. Caller decides what to do (close modal, navigate, etc.)
      onSuccess(newSpaceId);
    } catch (err) {
      console.error('Create space error:', err);
      setError('Could not create space. Please try again.');
      setCreating(false);
    }
    // NOTE: do not setCreating(false) on success — onSuccess unmounts this
    // component (page navigates / modal closes). Setting state on an unmounted
    // component would warn in dev. Same pattern as CreateSpaceModal v1.2.
  }, [isDisabled, name, photoFile, getApi, onSuccess, appState]);

  return (
    <>
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
          autoFocus={autoFocus}
        />

        {/* Photo upload */}
        <div className={styles.photoRow}>
          {!photoPreview ? (
            <>
              <button
                type="button"
                className={styles.photoDashed}
                onClick={handlePhotoClick}
                aria-label="Add a photo"
              >
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
              <button
                type="button"
                className={styles.photoChange}
                onClick={handleRemovePhoto}
              >
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
        {error && <p className={styles.error} role="alert">{error}</p>}

        <button
          type="button"
          className={styles.nextBtn}
          onClick={handleCreate}
          disabled={isDisabled}
        >
          {creating ? 'Creating...' : ctaLabel}
        </button>

        <div className={styles.privacyNote}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span>This space will be private</span>
        </div>
      </div>
    </>
  );
}
