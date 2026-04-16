// components/ButterflyLoader.jsx — Anamoria SPA
// v1.0 — Shared full-page loading indicator (April 15, 2026)
//
// Replaces the generic "Anamoria" text + CSS spinner used in App.jsx bootstrap
// states and SpacePage.jsx page loading. Uses the butterfly brand mark with
// a subtle breathe animation, ported from LWC axr_MemoryVaultV2.css
// .initial-loading-overlay pattern.
//
// Usage:
//   <ButterflyLoader />
//
// Context: Full-page brand loading moment only. Not intended for inline or
// component-level wait indicators (e.g., sidebar space list spinner) — those
// should remain as small inline spinners to preserve UX information hierarchy.

import styles from './ButterflyLoader.module.css';

export default function ButterflyLoader() {
  return (
    <div className={styles.overlay} role="status" aria-label="Loading">
      <div className={styles.logo}>
        <svg
          width="84"
          height="91"
          viewBox="0 0 84 91"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M82.4188 23.8273C85.8416 43.1509 75.0179 57.2543 64.7493 57.2543C78.0708 62.3096 77.8857 80.7906 74.2779 89.9487C61.8814 92.6962 42.4384 88.3919 41.5292 62.2913C41.5288 62.2781 41.5284 62.2649 41.528 62.2518C41.5275 62.2649 41.5273 62.2781 41.5269 62.2913C40.6177 88.3918 21.1747 92.6961 8.77827 89.9487C5.17043 80.7906 4.98535 62.3096 18.3068 57.2543C8.03824 57.2543 -2.78545 43.1509 0.637368 23.8273C12.2481 26.8567 40.759 37.7748 41.528 60.3767C42.2969 37.7747 70.8081 26.8567 82.4188 23.8273Z"
            fill="#7c9885"
          />
          <ellipse
            cx="41.0461"
            cy="12.3687"
            rx="11.4582"
            ry="11.4582"
            fill="#7c9885"
          />
        </svg>
      </div>
    </div>
  );
}
