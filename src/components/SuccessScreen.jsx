// components/SuccessScreen.jsx — Anamoria SPA
// v1.0 — Shared success screen for Voice / Text / Photo memory saves
//         (April 16, 2026)
//
// Purpose:
//   Renders the "Memory saved" screen with the "JUST ADDED" (or "UPDATED")
//   badge, a saved card preview (per-type content via children slot),
//   footer (privacy · time), and 3 stacked action buttons.
//
// Reference implementation:
//   Voice success screen in RecordPage.jsx v5.0 (lines 429–520).
//   This component lifts that markup into a reusable shape.
//
// Per-type preview body is passed via `children` — this keeps the
// voice audio player, text excerpt, and photo thumbnail concerns in
// their respective pages, while the badge + card wrapper + footer +
// actions + LovedOneBar + BottomNav live here.
//
// Props:
//   spaceName       (string)          — displayed in LovedOneBar
//   spacePhotoUrl   (string | null)   — avatar image in LovedOneBar
//   subtitle        (string)          — LovedOneBar subtitle
//                                        (e.g., "Label · Memory saved" or "Memory saved")
//   onBack          (() => void)      — LovedOneBar back button handler
//   backLabel       (string)          — aria-label on back button
//   badgeLabel      (string)          — "JUST ADDED" or "UPDATED"
//   promptText      (string | null)   — optional italic prompt header inside card
//   isPrivate       (boolean)         — footer privacy indicator
//   primaryCta      ({ icon, label, onClick })   — sage pill button (top)
//   secondaryCta    ({ label, onClick })          — outline button (middle)
//   tertiaryCta     ({ label, onClick })          — text link (bottom)
//   spaceId         (string)          — passed to BottomNav
//   activeTab       (string)          — 'record' | 'write' | 'photo' | 'invite'
//   children        (ReactNode)       — per-type preview body
//
// Styles: SuccessScreen.module.css v1.0

import LovedOneBar from './LovedOneBar';
import BottomNav from './BottomNav';
import styles from './SuccessScreen.module.css';

export default function SuccessScreen({
  spaceName,
  spacePhotoUrl,
  subtitle,
  onBack,
  backLabel,
  badgeLabel,
  promptText,
  isPrivate,
  primaryCta,
  secondaryCta,
  tertiaryCta,
  spaceId,
  activeTab,
  children,
}) {
  return (
    <div className={styles.page}>
      <LovedOneBar
        spaceName={spaceName}
        spacePhotoUrl={spacePhotoUrl}
        subtitle={subtitle}
        onBack={onBack}
        backLabel={backLabel}
      />

      <div className={styles.savedBody}>
        {/* Badge + saved card */}
        <div className={styles.savedCardWrapper}>
          <span className={styles.savedBadge}>{badgeLabel}</span>
          <div className={styles.savedCard}>
            {promptText && (
              <p className={styles.savedPrompt}>{promptText}</p>
            )}

            {/* Per-type preview body */}
            {children}

            <div className={styles.savedCardFooter}>
              <span className={styles.savedPrivacy}>
                {isPrivate ? '🔒 Private' : '🌐 Shared'}
              </span>
              <span className={styles.savedDot}>·</span>
              <span className={styles.savedTime}>Just now</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className={styles.savedActions}>
          <button
            className={styles.primaryBtn}
            onClick={primaryCta.onClick}
          >
            <span className={styles.primaryIcon}>{primaryCta.icon}</span>
            {primaryCta.label}
          </button>
          <button
            className={styles.secondaryBtn}
            onClick={secondaryCta.onClick}
          >
            {secondaryCta.label}
          </button>
          <button
            className={styles.tertiaryBtn}
            onClick={tertiaryCta.onClick}
          >
            {tertiaryCta.label}
          </button>
        </div>
      </div>

      <BottomNav spaceId={spaceId} activeTab={activeTab} />
    </div>
  );
}
