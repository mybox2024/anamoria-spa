// IOSInstallPrompt.jsx — Anamoria SPA
// v1.0 — PWA Conversion (April 23, 2026)
// Custom install banner for iOS Safari users (no automatic install prompt on iOS).
// Uses feature detection (not user-agent sniffing) to identify iOS Safari.
// Only shows after onboarding (not on /join), and only if not already installed.
// Dismissed state persisted in localStorage.
// Accessibility: role="complementary", aria-label, keyboard-dismissible (Escape).

import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import styles from './IOSInstallPrompt.module.css';

const DISMISS_KEY = 'ana_ios_install_dismissed';

function isIOSSafari() {
  // Feature detection approach:
  // 1. Touch support + maxTouchPoints > 0 (iOS/iPadOS)
  // 2. Not running in standalone mode already
  // 3. navigator.standalone exists (Safari-specific property)
  if (typeof navigator === 'undefined') return false;

  const isIOS = (
    ('standalone' in navigator) &&
    navigator.maxTouchPoints > 0
  );

  const isStandalone = (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true
  );

  return isIOS && !isStandalone;
}

export default function IOSInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Don't show on join page (pre-onboarding)
    if (location.pathname === '/join') return;

    // Don't show if already dismissed
    if (localStorage.getItem(DISMISS_KEY) === 'true') return;

    // Only show on iOS Safari, not already installed
    if (isIOSSafari()) {
      setVisible(true);
    }
  }, [location.pathname]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setVisible(false);
  }, []);

  // Keyboard: Escape dismisses
  useEffect(() => {
    if (!visible) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div
      className={styles.banner}
      role="complementary"
      aria-label="Install instructions"
    >
      <div className={styles.content}>
        <p className={styles.message}>
          Add Anamoria to your Home Screen for the best experience.
        </p>
        <ol className={styles.steps}>
          <li>
            Tap the <strong>Share</strong> button
            <span className={styles.shareIcon} aria-hidden="true">
              {/* iOS share icon approximation */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </span>
          </li>
          <li>Then tap <strong>Add to Home Screen</strong></li>
        </ol>
      </div>
      <button
        className={styles.dismissBtn}
        onClick={dismiss}
        aria-label="Dismiss install prompt"
      >
        ✕
      </button>
    </div>
  );
}
