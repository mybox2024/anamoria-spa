// components/settings/SpaceInfoPanel.jsx — Anamoria SPA
// v1.0 — Space name + voice card style picker (April 11, 2026)
//
// Extracted from SpaceSettings.jsx v1.1 (Sections 1 + 2)
// Independent save: PATCH /spaces/:id with { name, voiceCardTheme }
//
// Props:
//   space    — current space object (from SettingsPage state)
//   getApi   — stable API client factory
//   onSave   — callback with full updated space object (for parent state sync)

import { useState, useEffect, useRef, useCallback } from 'react';
import { THEME_OPTIONS } from './settingsUtils';
import shared from './settingsShared.module.css';
import styles from './SpaceInfoPanel.module.css';

export default function SpaceInfoPanel({ space, getApi, onSave }) {
  // ─── Editable state (initialized from space prop) ───
  const [editName, setEditName] = useState(space.name || '');
  const [editTheme, setEditTheme] = useState(space.voiceCardTheme || 'warm');

  // ─── Save state ───
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // ─── Timeout ref for cleanup ───
  const savedTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // ─── Re-initialize from space prop when it changes (e.g., another panel saved) ───
  useEffect(() => {
    setEditName(space.name || '');
    setEditTheme(space.voiceCardTheme || 'warm');
  }, [space.name, space.voiceCardTheme]);

  // ─── Save handler ───
  const handleSave = useCallback(async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError('Space name cannot be empty.');
      return;
    }

    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const api = getApi();
      const body = {
        name: trimmedName,
        voiceCardTheme: editTheme,
      };

      const updated = await api.patch(`/spaces/${space.id}`, body);

      if (onSave) onSave(updated);

      setSaved(true);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('SpaceInfoPanel save error:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [editName, editTheme, getApi, space.id, onSave]);

  // ─── Render ───
  return (
    <div>
      {/* ══════ Space Name ══════ */}
      <div className={shared.section}>
        <h3 className={shared.sectionTitle}>SPACE INFO</h3>

        <div className={shared.formGroup}>
          <label className={shared.formLabel}>Space Name</label>
          <input
            type="text"
            className={shared.formInput}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={100}
          />
        </div>
      </div>

      {/* ══════ Voice Card Style ══════ */}
      <div className={shared.section}>
        <h3 className={shared.sectionTitle}>VOICE CARD STYLE</h3>
        <p className={shared.hint}>Choose how your voice notes appear in the feed.</p>
        <div className={styles.themePicker}>
          {THEME_OPTIONS.map((theme) => (
            <div
              key={theme.value}
              className={`${styles.themeOption} ${editTheme === theme.value ? styles.themeSelected : ''}`}
              onClick={() => setEditTheme(theme.value)}
              role="radio"
              aria-checked={editTheme === theme.value}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setEditTheme(theme.value);
                }
              }}
            >
              <div className={`${styles.themePreview} ${styles[`themePreview_${theme.value}`]}`}>
                <div className={styles.themePreviewInner}>
                  <span className={styles.themePreviewLabel}>{theme.previewLabel}</span>
                  <div className={styles.themePreviewWaveform} />
                </div>
              </div>
              <span className={styles.themePickerName}>{theme.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════ Footer: Save + feedback ══════ */}
      <div className={shared.panelFooter}>
        <button
          className={shared.saveBtn}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && <span className={shared.savedFade}>Saved ✓</span>}
      </div>

      {error && <p className={shared.errorMsg}>{error}</p>}
    </div>
  );
}
