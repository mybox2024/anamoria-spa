// components/ContributorBottomNav.jsx — Anamoria SPA
// v1.0 — Session 3 (April 19, 2026)
//
// Contributor-side bottom navigation. 3 buttons (Record, Write, Photo).
// No Invite button — contributors cannot invite (only space owners can, per
// Session 3 Plan v1.1 decision V: contributors see each other's memories only,
// no ownership-level actions).
//
// REUSES BottomNav.module.css (per Session 3 Plan v1.1 decision B2 — new
// component, shared CSS module). The .nav class uses flex: 1 on each .btn
// so dropping from 4 to 3 buttons redistributes space automatically — no
// CSS changes required.
//
// Differences from owner BottomNav.jsx v1.1:
//   - No Invite button
//   - Navigates to /contribute/{spaceId}/{record|write|photo} instead of
//     /spaces/{spaceId}/{record|write|photo}
//   - Otherwise identical: same icons, same Safari-safe photo picker pattern,
//     same CSS classes
//
// Props:
//   spaceId   — current space UUID (used for navigation)
//   activeTab — 'record' | 'write' | 'photo'
//
// Safari user-gesture note (inherited from owner):
//   Photo button opens file picker synchronously in the click handler. File
//   selection triggers navigate(...) with the File passed via location.state.
//   Navigating first then calling .click() would break Safari's user-activation
//   chain (WebKit enforces .click() must be called in the same task as the
//   user gesture). See owner BottomNav.jsx v1.1 comment block for references.

import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecordIcon, WriteIcon, PhotoIcon } from './BrandIcons';
import styles from './BottomNav.module.css';

export default function ContributorBottomNav({ spaceId, activeTab = 'record' }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // ─── Photo picker handlers ─────────────────────────────────
  // Identical behavior to owner BottomNav: file picker opens synchronously
  // to preserve Safari user-gesture chain; file is passed via location.state.

  function handlePhotoClick() {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // reset so re-selecting same file works
      fileInputRef.current.click();
    }
  }

  function handlePhotoFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return; // cancel → stay on feed
    navigate(`/contribute/${spaceId}/photo`, { state: { file } });
  }

  return (
    <nav className={styles.nav} aria-label="Contributor navigation">

      {/* Record — primary action */}
      <button
        className={`${styles.btn} ${styles.btnPrimary} ${activeTab === 'record' ? styles.active : ''}`}
        onClick={() => navigate(`/contribute/${spaceId}/record`)}
        title="Record a voice memory"
        aria-label="Record a voice memory"
      >
        <span className={styles.icon}>
          <RecordIcon />
        </span>
        <span className={styles.label}>Record</span>
      </button>

      {/* Write */}
      <button
        className={`${styles.btn} ${activeTab === 'write' ? styles.active : ''}`}
        onClick={() => navigate(`/contribute/${spaceId}/write`)}
        title="Write a memory"
        aria-label="Write a memory"
      >
        <span className={styles.icon}>
          <WriteIcon />
        </span>
        <span className={styles.label}>Write</span>
      </button>

      {/* Photo — opens file picker in same user-gesture task (Safari-safe) */}
      <button
        className={`${styles.btn} ${activeTab === 'photo' ? styles.active : ''}`}
        onClick={handlePhotoClick}
        title="Add a photo"
        aria-label="Add a photo"
      >
        <span className={styles.icon}>
          <PhotoIcon />
        </span>
        <span className={styles.label}>Photo</span>
      </button>

      {/* Hidden file input — clicked programmatically from Photo button above. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className={styles.fileInput}
        onChange={handlePhotoFileChange}
      />

    </nav>
  );
}
