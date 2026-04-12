// components/settings/ContributorsPanel.jsx — Anamoria SPA
// v1.0 — Contributors toggle + list + remove (April 11, 2026)
//
// Extracted from SpaceSettings.jsx v1.1 (Sections 1 toggle + 4)
// Independent save: PATCH /spaces/:id with { privacyMode }
// Remove: DELETE /spaces/:id/contributors/:contributorId
//
// Props:
//   space    — current space object (from SettingsPage state)
//   getApi   — stable API client factory
//   onSave   — callback with full updated space object (for parent state sync)

import { useState, useEffect, useRef, useCallback } from 'react';
import { getStatusKey, getStatusLabel, getMemoryLabel } from './settingsUtils';
import shared from './settingsShared.module.css';
import styles from './ContributorsPanel.module.css';

export default function ContributorsPanel({ space, getApi, onSave }) {
  // ─── Toggle state ───
  const [allowContributors, setAllowContributors] = useState(space.privacyMode !== 'private');

  // ─── Contributors list state ───
  const [contributors, setContributors] = useState([]);
  const [loadingContributors, setLoadingContributors] = useState(false);
  const [contributorToRemove, setContributorToRemove] = useState(null);

  // ─── Save state (for toggle) ───
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

  // ─── Re-initialize toggle from space prop ───
  useEffect(() => {
    setAllowContributors(space.privacyMode !== 'private');
  }, [space.privacyMode]);

  // ─── Load contributors on mount ───
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
        console.error('ContributorsPanel: failed to load contributors:', err);
      } finally {
        if (!cancelled) setLoadingContributors(false);
      }
    }

    loadContributors();
    return () => { cancelled = true; };
  }, [space.id, getApi]);

  // ─── Save toggle (privacy mode) ───
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const api = getApi();
      const body = {
        privacyMode: allowContributors ? 'shared' : 'private',
      };

      const updated = await api.patch(`/spaces/${space.id}`, body);

      if (onSave) onSave(updated);

      setSaved(true);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('ContributorsPanel save error:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [allowContributors, getApi, space.id, onSave]);

  // ─── Remove contributor ───
  const handleRemoveConfirm = useCallback(async () => {
    if (!contributorToRemove) return;

    try {
      const api = getApi();
      await api.delete(`/spaces/${space.id}/contributors/${contributorToRemove.id}`);
      setContributors((prev) => prev.filter((c) => c.id !== contributorToRemove.id));
      setContributorToRemove(null);
    } catch (err) {
      console.error('ContributorsPanel: failed to remove contributor:', err);
      setError('Failed to remove contributor.');
    }
  }, [contributorToRemove, getApi, space.id]);

  // ─── Stop propagation for confirm dialog ───
  function stopPropagation(e) {
    e.stopPropagation();
  }

  // ─── Status class lookup ───
  function statusClass(status) {
    const key = getStatusKey(status);
    return key === 'active' ? styles.statusActive : styles.statusPending;
  }

  // ─── Render ───
  return (
    <div>
      {/* ══════ Allow Contributors Toggle ══════ */}
      <div className={shared.section}>
        <h3 className={shared.sectionTitle}>CONTRIBUTORS</h3>

        <div
          className={shared.toggleRow}
          onClick={() => setAllowContributors(!allowContributors)}
          role="switch"
          aria-checked={allowContributors}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setAllowContributors(!allowContributors);
            }
          }}
        >
          <div className={shared.toggleRowLeft}>
            <span className={shared.toggleLabel}>Allow Contributors</span>
            <span className={shared.toggleDesc}>Let family and friends contribute memories.</span>
          </div>
          <div className={`${shared.toggleTrack} ${allowContributors ? shared.toggleOn : ''}`}>
            <div className={shared.toggleKnob} />
          </div>
        </div>
      </div>

      {/* ══════ Contributor List (shown when toggle ON) ══════ */}
      {allowContributors && (
        <div className={shared.section}>
          <h3 className={shared.sectionTitle}>
            CONTRIBUTOR LIST ({contributors.length})
          </h3>

          {loadingContributors && (
            <p className={shared.loadingText}>Loading...</p>
          )}

          {!loadingContributors && contributors.length > 0 && (
            <ul className={styles.contributorList}>
              {contributors.map((c) => (
                <li key={c.id} className={styles.contributorItem}>
                  <div className={styles.contributorInfo}>
                    <span className={styles.contributorName}>{c.contributor_name}</span>
                    <span className={statusClass(c.status)}>{getStatusLabel(c.status)}</span>
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

      {/* ══════ Remove Contributor Confirmation ══════ */}
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
                className={styles.confirmCancelBtn}
                onClick={() => setContributorToRemove(null)}
              >
                Cancel
              </button>
              <button
                className={styles.confirmRemoveBtn}
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
