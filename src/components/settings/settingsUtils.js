// components/settings/settingsUtils.js — Anamoria SPA
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
  { value: 'warm', label: 'Warm', previewLabel: '● VOICE' },
  { value: 'story', label: 'Story', previewLabel: '❙❙' },
  { value: 'sage', label: 'Sage', previewLabel: '🎙' },
  { value: 'clean', label: 'Clean', previewLabel: '▌▌▌▌' },
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
