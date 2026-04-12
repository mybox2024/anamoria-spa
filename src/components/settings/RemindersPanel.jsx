// components/settings/RemindersPanel.jsx — Anamoria SPA
// v1.0 — Weekly reminders toggle + day/time (April 11, 2026)
//
// Extracted from SpaceSettings.jsx v1.1 (Section 3)
// Independent save: PATCH /spaces/:id with
//   { reminderEnabled, reminderDay, reminderTime, reminderTimezone }
//
// Props:
//   space    — current space object (from SettingsPage state)
//   getApi   — stable API client factory
//   onSave   — callback with full updated space object (for parent state sync)

import { useState, useEffect, useRef, useCallback } from 'react';
import { DAY_OPTIONS } from './settingsUtils';
import shared from './settingsShared.module.css';
import styles from './RemindersPanel.module.css';

export default function RemindersPanel({ space, getApi, onSave }) {
  // ─── Editable state (initialized from space prop) ───
  const [reminderEnabled, setReminderEnabled] = useState(space.reminderEnabled || false);
  const [reminderDay, setReminderDay] = useState(space.reminderDay || 'Sunday');
  const [reminderTime, setReminderTime] = useState(space.reminderTime || '09:00');

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

  // ─── Re-initialize from space prop ───
  useEffect(() => {
    setReminderEnabled(space.reminderEnabled || false);
    setReminderDay(space.reminderDay || 'Sunday');
    setReminderTime(space.reminderTime || '09:00');
  }, [space.reminderEnabled, space.reminderDay, space.reminderTime]);

  // ─── Save handler ───
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const api = getApi();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

      const body = {
        reminderEnabled: reminderEnabled,
        reminderDay: reminderDay,
        reminderTime: reminderTime,
        reminderTimezone: timezone,
      };

      const updated = await api.patch(`/spaces/${space.id}`, body);

      if (onSave) onSave(updated);

      setSaved(true);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('RemindersPanel save error:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [reminderEnabled, reminderDay, reminderTime, getApi, space.id, onSave]);

  // ─── Render ───
  return (
    <div>
      {/* ══════ Enable Reminders Toggle ══════ */}
      <div className={shared.section}>
        <h3 className={shared.sectionTitle}>WEEKLY REMINDERS</h3>

        <div
          className={shared.toggleRow}
          onClick={() => setReminderEnabled(!reminderEnabled)}
          role="switch"
          aria-checked={reminderEnabled}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setReminderEnabled(!reminderEnabled);
            }
          }}
        >
          <div className={shared.toggleRowLeft}>
            <span className={shared.toggleLabel}>Enable Reminders</span>
          </div>
          <div className={`${shared.toggleTrack} ${reminderEnabled ? shared.toggleOn : ''}`}>
            <div className={shared.toggleKnob} />
          </div>
        </div>

        {/* ─── Day + Time selectors (shown when enabled) ─── */}
        {reminderEnabled && (
          <div className={styles.reminderInputs}>
            <div className={styles.reminderGroup}>
              <label className={shared.formLabel}>Day</label>
              <select
                className={shared.formSelect}
                value={reminderDay}
                onChange={(e) => setReminderDay(e.target.value)}
              >
                {DAY_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className={styles.reminderGroup}>
              <label className={shared.formLabel}>Time</label>
              <input
                type="time"
                className={shared.formInput}
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
              />
            </div>
          </div>
        )}
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
