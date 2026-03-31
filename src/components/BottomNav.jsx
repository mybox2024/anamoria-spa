// components/BottomNav.jsx — Anamoria SPA
// Brand Sage SVG icons per BottomNav_BrandSage_Implementation.md
// Props:
//   spaceId   — current space UUID (used for navigation)
//   activeTab — 'record' | 'write' | 'photo' | 'invite'

import { useNavigate } from 'react-router-dom';
import styles from './BottomNav.module.css';

export default function BottomNav({ spaceId, activeTab = 'record' }) {
  const navigate = useNavigate();

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
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" strokeLinecap="round" strokeLinejoin="round">
            <path className={styles.svgFill} d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M18 10.5v.5a6 6 0 0 1-12 0v-.5" strokeWidth="1.5"/>
            <path d="M12 17v4" strokeWidth="1.5"/>
          </svg>
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
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 7l-3-3-12.5 12.5L3 21l4.5-1.5L20 7z" strokeWidth="1.5"/>
            <path d="M15 6l3 3" strokeWidth="1.5"/>
            <circle className={styles.svgFill} cx="18.5" cy="5.5" r="1"/>
          </svg>
        </span>
        <span className={styles.label}>Write</span>
      </button>

      {/* Photo */}
      <button
        className={`${styles.btn} ${activeTab === 'photo' ? styles.active : ''}`}
        onClick={() => navigate(`/spaces/${spaceId}/photo`)}
        title="Add a photo"
        aria-label="Add a photo"
      >
        <span className={styles.icon}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" strokeWidth="1.5"/>
            <circle className={styles.svgFill} cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5-8 11" strokeWidth="1.5"/>
          </svg>
        </span>
        <span className={styles.label}>Photo</span>
      </button>

      {/* Invite */}
      <button
        className={`${styles.btn} ${activeTab === 'invite' ? styles.active : ''}`}
        onClick={() => navigate(`/spaces/${spaceId}/invite`)}
        title="Invite someone"
        aria-label="Invite someone"
      >
        <span className={styles.icon}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="7" r="3.5" strokeWidth="1.5"/>
            <circle className={styles.svgFill} cx="9" cy="7" r="1.5"/>
            <path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" strokeWidth="1.5"/>
            <line x1="19" y1="8" x2="19" y2="14" strokeWidth="1.5"/>
            <line x1="22" y1="11" x2="16" y2="11" strokeWidth="1.5"/>
          </svg>
        </span>
        <span className={styles.label}>Invite</span>
      </button>

    </nav>
  );
}
