// PWAUpdatePrompt.jsx — Anamoria SPA
// v1.0 — PWA Conversion (April 23, 2026)
// Non-intrusive banner shown when a new service worker is detected.
// Accessibility: role="alert", aria-live, keyboard-dismissible (Escape).
// Renders null unless an update is available.

import { useEffect, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './PWAUpdatePrompt.module.css';

export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW();

  const dismiss = useCallback(() => setNeedRefresh(false), [setNeedRefresh]);

  // Keyboard: Escape dismisses the banner
  useEffect(() => {
    if (!needRefresh) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [needRefresh, dismiss]);

  if (!needRefresh) return null;

  return (
    <div
      className={styles.banner}
      role="alert"
      aria-live="polite"
    >
      <p className={styles.message}>A new version is available.</p>
      <div className={styles.actions}>
        <button
          className={styles.refreshBtn}
          onClick={() => updateServiceWorker(true)}
        >
          Refresh
        </button>
        <button
          className={styles.laterBtn}
          onClick={dismiss}
          aria-label="Dismiss update notification"
        >
          Later
        </button>
      </div>
    </div>
  );
}
