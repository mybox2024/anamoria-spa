// components/LovedOneBar.jsx — Anamoria SPA
// v1.1 — Shared header for capture screens (April 2, 2026)
//
// Props:
//   spaceName     — string (required)
//   spacePhotoUrl — string|null
//   subtitle      — string (e.g. "Ready to record", "Review before saving")
//   onBack        — function
//   backLabel     — string — aria-label for back button (default: "Back")

import styles from './LovedOneBar.module.css';

export default function LovedOneBar({
  spaceName,
  spacePhotoUrl,
  subtitle,
  onBack,
  backLabel = 'Back',
}) {
  const initial = (spaceName || '?').charAt(0).toUpperCase();

  return (
    <header className={styles.bar}>
      <button
        className={styles.backBtn}
        onClick={onBack}
        aria-label={backLabel}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <div className={styles.avatar}>
        {spacePhotoUrl ? (
          <img src={spacePhotoUrl} alt={spaceName} className={styles.avatarImg} />
        ) : (
          <span className={styles.avatarInitial}>{initial}</span>
        )}
      </div>

      <div className={styles.info}>
        <span className={styles.name}>{spaceName}</span>
        <span className={styles.sub}>{subtitle}</span>
      </div>
    </header>
  );
}
