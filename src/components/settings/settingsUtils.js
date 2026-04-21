// components/settings/settingsUtils.js — Anamoria SPA
// v1.1 — Add imagePath to theme options for screenshot thumbnails (April 21, 2026)
//
// Changes from v1.0:
//   - THEME_OPTIONS: added imagePath field pointing to cropped card screenshots
//     in public/images/themes/. Replaces CSS-drawn abstract previews in
//     SpaceInfoPanel theme picker with real card images.
//   - previewLabel retained for backward compatibility (not currently rendered).
//
// v1.0 — Shared constants and helpers for settings panels (April 11, 2026)
//
// Extracted from SpaceSettings.jsx v1.1 to avoid duplication across
// SpaceInfoPanel, ContributorsPanel, RemindersPanel, NeedHelpPanel.
// Pure functions and constants only — no React, no styles, no side effects.

/* ─── Day options for reminder day selector ─── */

export const DAY_OPTIONS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/* ─── Voice card theme options for theme picker ─── */

export const THEME_OPTIONS = [
  { value: 'warm', label: 'Warm', previewLabel: '● VOICE', imagePath: '/images/themes/voice-card-warm.png' },
  { value: 'story', label: 'Story', previewLabel: '❙❙', imagePath: '/images/themes/voice-card-story.png' },
  { value: 'sage', label: 'Sage', previewLabel: '🎙', imagePath: '/images/themes/voice-card-sage.png' },
  { value: 'clean', label: 'Clean', previewLabel: '▌▌▌▌', imagePath: '/images/themes/voice-card-clean.png' },
];

/* ─── Contributor status helpers ─── */

/**
 * Returns a status key string for CSS class lookup.
 * The consuming component maps this to its own CSS module class.
 *   'active'  → styles.statusActive
 *   'pending' → styles.statusPending
 */
export function getStatusKey(status) {
  if (status === 'active') return 'active';
  return 'pending';
}

/**
 * Returns a human-readable label for contributor status.
 */
export function getStatusLabel(status) {
  if (status === 'active') return 'Active';
  if (status === 'invited') return 'Pending';
  if (status === 'revoked') return 'Revoked';
  return status || 'Pending';
}

/**
 * Returns a human-readable label for memory count.
 */
export function getMemoryLabel(count) {
  if (count === 1) return '1 memory';
  return `${count || 0} memories`;
}
