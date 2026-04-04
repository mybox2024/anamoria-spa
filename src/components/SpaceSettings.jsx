// components/SpaceSettings.jsx — Anamoria SPA
// v1.0 — Space Settings modal (April 4, 2026)
// Source: axr_MemoryVaultV2.html/.js/.css (LWC Space Settings modal)
//
// Sections:
//   1. Space Info (name + allow contributors toggle)
//   2. Voice Card Style (4-theme picker)
//   3. Weekly Reminders (enable toggle + day/time selectors)
//   4. Contributors list (with memory count + remove)
//   5. Need Help (request space deletion via email)
//   6. Footer (Cancel / Save Changes)
//
// Props:
//   space       — current space object from SpacePage
//   getApi      — stable API client factory
//   onClose     — close modal callback
//   onSave      — callback with updated space data (for parent state sync)

import { useState, useEffect, useCallback } from 'react';
import styles from './SpaceSettings.module.css';

/* ═══════════════════════════════════════
   INLINE SVG ICONS
   ═══════════════════════════════════════ */

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 6l-10 7L2 6" />
    </svg>
  );
}

/* ═══════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════ */

const DAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const THEME_OPTIONS = [
  { value: 'warm', label: 'Warm', previewLabel: '● VOICE' },
  { value: 'story', label: 'Story', previewLabel: '❙❙' },
  { value: 'sage', label: 'Sage', previewLabel: '🎙' },
  { value: 'clean', label: 'Clean', previewLabel: '▌▌▌▌' },
];

/* ═══════════════════════════════════════
   SPACE SETTINGS COMPONENT
   ═══════════════════════════════════════ */

export default function SpaceSettings({ space, getApi, onClose, onSave }) {

  // ─── Editable state (initialized from space prop) ───
  const [editName, setEditName] = useState(space.name || '');
  const [allowContributors, setAllowContributors] = useState(space.privacyMode !== 'private');
  const [editTheme, setEditTheme] = useState(space.voiceCardTheme || 'warm');
  const [reminderEnabled, setReminderEnabled] = useState(space.reminderEnabled || false);
  const [reminderDay, setReminderDay] = useState(space.reminderDay || 'Sunday');
  const [reminderTime, setReminderTime] = useState(space.reminderTime || '09:00');

  // ─── Contributors state ───
  const [contributors, setContributors] = useState([]);
  const [loadingContributors, setLoadingContributors] = useState(false);
  const [contributorToRemove, setContributorToRemove] = useState(null);

  // ─── Save state ───
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /* ─── Load contributors on mount ─── */

  useEffect(() => {
    let cancelled = false;

    async function loadContributors() {
      setLoadingContributors(true);
      try {
        const api = getApi();
        const data = await api.get(`/spaces/${space.id}/contributors`);
        if (!cancelled) {
          setContributors(data.contributors || []);
        }
      } catch (err) {
        console.error('Failed to load contributors:', err);
      } finally {
        if (!cancelled) setLoadingContributors(false);
      }
    }

    loadContributors();
    return () => { cancelled = true; };
  }, [space.id, getApi]);

  /* ─── Remove contributor ─── */

  const handleRemoveConfirm = useCallback(async () => {
    if (!contributorToRemove) return;

    try {
      const api = getApi();
      await api.delete(`/spaces/${space.id}/contributors/${contributorToRemove.id}`);
      setContributors((prev) => prev.filter((c) => c.id !== contributorToRemove.id));
      setContributorToRemove(null);
    } catch (err) {
      console.error('Failed to remove contributor:', err);
      setError('Failed to remove contributor.');
    }
  }, [contributorToRemove, getApi, space.id]);

  /* ─── Save all settings ─── */

  const handleSave = useCallback(async () => {
    if (!editName.trim()) {
      setError('Space name cannot be empty.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const api = getApi();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

      const body = {
        name: editName.trim(),
        privacyMode: allowContributors ? 'shared' : 'private',
        voiceCardTheme: editTheme,
        reminderEnabled: reminderEnabled,
        reminderDay: reminderDay,
        reminderTime: reminderTime,
        reminderTimezone: timezone,
      };

      const updated = await api.patch(`/spaces/${space.id}`, body);

      if (onSave) {
        onSave(updated);
      }

      setSuccess('Settings saved.');
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      console.error('Save settings error:', err);
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }, [editName, allowContributors, editTheme, reminderEnabled, reminderDay, reminderTime, getApi, space.id, onSave, onClose]);

  /* ─── Request deletion (mailto) ─── */

  function handleRequestDeletion() {
    const subject = encodeURIComponent(`Delete space: ${space.name}`);
    const body = encodeURIComponent(`Please delete the space "${space.name}" (ID: ${space.id}). I understand backups are kept for 30 days.`);
    window.open(`mailto:support@anamoria.org?subject=${subject}&body=${body}`, '_blank');
  }

  /* ─── Stop propagation (prevent overlay click closing modal) ─── */

  function stopPropagation(e) {
    e.stopPropagation();
  }

  /* ─── Contributor helpers ─── */

  function getStatusClass(status) {
    if (status === 'active') return styles.statusActive;
    if (status === 'invited') return styles.statusPending;
    return styles.statusPending;
  }

  function getStatusLabel(status) {
    if (status === 'active') return 'Active';
    if (status === 'invited') return 'Pending';
    if (status === 'revoked') return 'Revoked';
    return status || 'Pending';
  }

  function getMemoryLabel(count) {
    if (count === 1) return '1 memory';
    return `${count || 0} memories`;
  }

  /* ═══════════════════════════════════════
     RENDER
     ═══════════════════════════════════════ */

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={stopPropagation}>

        {/* ─── Header ─── */}
        <div className={styles.header}>
          <h2 className={styles.title}>Space Settings</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {/* ─── Scrollable body ─── */}
        <div className={styles.scroll}>

          {/* ══════ Section 1: Space Info ══════ */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>SPACE INFO</h3>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Space Name</label>
              <input
                type="text"
                className={styles.formInput}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className={styles.toggleRow} onClick={() => setAllowContributors(!allowContributors)}>
              <div className={styles.toggleRowLeft}>
                <span className={styles.toggleLabel}>Allow Contributors</span>
                <span className={styles.toggleDesc}>Let family and friends contribute memories.</span>
              </div>
              <div className={`${styles.toggleTrack} ${allowContributors ? styles.toggleOn : ''}`}>
                <div className={styles.toggleKnob} />
              </div>
            </div>
          </div>

          {/* ══════ Section 2: Voice Card Style ══════ */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>VOICE CARD STYLE</h3>
            <p className={styles.hint}>Choose how your voice notes appear in the feed.</p>
            <div className={styles.themePicker}>
              {THEME_OPTIONS.map((theme) => (
                <div
                  key={theme.value}
                  className={`${styles.themeOption} ${editTheme === theme.value ? styles.themeSelected : ''}`}
                  onClick={() => setEditTheme(theme.value)}
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

          {/* ══════ Section 3: Weekly Reminders ══════ */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>WEEKLY REMINDERS</h3>

            <div className={styles.toggleRow} onClick={() => setReminderEnabled(!reminderEnabled)}>
              <div className={styles.toggleRowLeft}>
                <span className={styles.toggleLabel}>Enable Reminders</span>
              </div>
              <div className={`${styles.toggleTrack} ${reminderEnabled ? styles.toggleOn : ''}`}>
                <div className={styles.toggleKnob} />
              </div>
            </div>

            {reminderEnabled && (
              <div className={styles.reminderInputs}>
                <div className={styles.reminderGroup}>
                  <label className={styles.reminderLabel}>Day</label>
                  <select
                    className={styles.formSelect}
                    value={reminderDay}
                    onChange={(e) => setReminderDay(e.target.value)}
                  >
                    {DAY_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.reminderGroup}>
                  <label className={styles.reminderLabel}>Time</label>
                  <input
                    type="time"
                    className={styles.formInput}
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ══════ Section 4: Contributors ══════ */}
          {allowContributors && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>
                CONTRIBUTORS ({contributors.length})
              </h3>

              {loadingContributors && (
                <p className={styles.loadingText}>Loading...</p>
              )}

              {!loadingContributors && contributors.length > 0 && (
                <ul className={styles.contributorList}>
                  {contributors.map((c) => (
                    <li key={c.id} className={styles.contributorItem}>
                      <div className={styles.contributorInfo}>
                        <span className={styles.contributorName}>{c.contributor_name}</span>
                        <span className={getStatusClass(c.status)}>{getStatusLabel(c.status)}</span>
                      </div>
                      <div className={styles.contributorDetails}>
                        <span className={styles.contributorEmail}>{c.email}</span>
                        <span className={styles.contributorMemories}>{getMemoryLabel(c.memory_count)}</span>
                      </div>
                      <button
                        className={styles.removeBtn}
                        onClick={() => setContributorToRemove(c)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!loadingContributors && contributors.length === 0 && (
                <p className={styles.noContributors}>
                  No contributors yet. Use the Invite tab to share your space.
                </p>
              )}
            </div>
          )}

          {/* ══════ Section 5: Need Help ══════ */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>NEED HELP?</h3>
            <p className={styles.hint}>
              If you need to delete this space or have other questions, we're here to help.
              We keep backups for 30 days in case you change your mind.
            </p>
            <button className={styles.supportLink} onClick={handleRequestDeletion}>
              <span className={styles.supportIcon}><EnvelopeIcon /></span>
              Request Space Deletion
            </button>
          </div>
        </div>

        {/* ─── Error / success messages ─── */}
        {error && <p className={styles.errorMsg}>{error}</p>}
        {success && <p className={styles.successMsg}>{success}</p>}

        {/* ─── Footer ─── */}
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          REMOVE CONTRIBUTOR CONFIRMATION
          ═══════════════════════════════════════ */}
      {contributorToRemove && (
        <div className={styles.confirmOverlay} onClick={() => setContributorToRemove(null)}>
          <div className={styles.confirmModal} onClick={stopPropagation}>
            <h3 className={styles.confirmTitle}>Remove Contributor?</h3>
            <p className={styles.confirmMessage}>
              Remove <strong>{contributorToRemove.contributor_name}</strong> from this space?
              Their memories will remain, but they won't be able to add new ones.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setContributorToRemove(null)}
              >
                Cancel
              </button>
              <button
                className={styles.removeBtnConfirm}
                onClick={handleRemoveConfirm}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
