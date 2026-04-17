// components/BottomNav.jsx — Anamoria SPA
// v1.1 — Photo picker on-feed + BrandIcons extraction (April 16, 2026)
//
// Changes from v1.0 (unversioned prior):
//   - Photo button now opens a file picker directly (hidden <input type="file">)
//     instead of navigating to /spaces/:id/photo first. File selection triggers
//     navigate(...) with the File passed via location.state, preserving the
//     Safari user-gesture chain (WebKit requires .click() to be called in the
//     same user-activation task — a route transition breaks that chain).
//     Reference: MDN HTMLInputElement.click() user-activation requirement.
//   - Inline SVG markup replaced with named imports from BrandIcons.jsx v1.0.
//     Record/Write/Invite navigation behavior unchanged.
//   - No change to .nav or styling — only the Photo button's click path and
//     the SVG source changed.
//
// Props:
//   spaceId   — current space UUID (used for navigation)
//   activeTab — 'record' | 'write' | 'photo' | 'invite'

import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecordIcon, WriteIcon, PhotoIcon, InviteIcon } from './BrandIcons';
import styles from './BottomNav.module.css';

export default function BottomNav({ spaceId, activeTab = 'record' }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // ─── Photo picker handlers ─────────────────────────────────
  // Button click: trigger file picker synchronously (user-gesture preserved).
  // onChange: if a file was selected, navigate to the photo-save page with the
  //           File in location.state. If user cancelled, onChange fires with
  //           no file — stay on feed, no navigation.

  function handlePhotoClick() {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';   // reset so re-selecting same file works
      fileInputRef.current.click();
    }
  }

  function handlePhotoFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;                   // cancel → stay on feed
    navigate(`/spaces/${spaceId}/photo`, { state: { file } });
  }

  return (
    <nav className={styles.nav} aria-label="Main navigation">

      {/* Record — primary action */}
      <button
        className={`${styles.btn} ${styles.btnPrimary} ${activeTab === 'record' ? styles.active : ''}`}
        onClick={() => navigate(`/spaces/${spaceId}/record`)}
        title="Record a voice note"
        aria-label="Record a voice note"
      >
        <span className={styles.icon}>
          <RecordIcon />
        </span>
        <span className={styles.label}>Record</span>
      </button>

      {/* Write */}
      <button
        className={`${styles.btn} ${activeTab === 'write' ? styles.active : ''}`}
        onClick={() => navigate(`/spaces/${spaceId}/write`)}
        title="Write a memory"
        aria-label="Write a memory"
      >
        <span className={styles.icon}>
          <WriteIcon />
        </span>
        <span className={styles.label}>Write</span>
      </button>

      {/* Photo — opens file picker in the same user-gesture task (Safari-safe) */}
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

      {/* Invite */}
      <button
        className={`${styles.btn} ${activeTab === 'invite' ? styles.active : ''}`}
        onClick={() => navigate(`/spaces/${spaceId}/invite`)}
        title="Invite someone"
        aria-label="Invite someone"
      >
        <span className={styles.icon}>
          <InviteIcon />
        </span>
        <span className={styles.label}>Invite</span>
      </button>

    </nav>
  );
}
