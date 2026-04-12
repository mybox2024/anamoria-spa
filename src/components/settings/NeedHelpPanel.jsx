// components/settings/NeedHelpPanel.jsx — Anamoria SPA
// v1.0 — Help text + space deletion request mailto (April 11, 2026)
//
// Extracted from SpaceSettings.jsx v1.1 (Section 5)
// No save — purely presentational with a mailto link.
//
// Props:
//   space — current space object (for name + ID in email)

import shared from './settingsShared.module.css';
import styles from './NeedHelpPanel.module.css';

/* ─── Inline SVG icon ─── */

function EnvelopeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 6l-10 7L2 6" />
    </svg>
  );
}

export default function NeedHelpPanel({ space }) {
  function handleRequestDeletion() {
    const subject = encodeURIComponent(`Delete space: ${space.name}`);
    const body = encodeURIComponent(
      `Please delete the space "${space.name}" (ID: ${space.id}). I understand backups are kept for 30 days.`
    );
    window.open(`mailto:support@anamoria.org?subject=${subject}&body=${body}`, '_blank');
  }

  return (
    <div>
      <div className={shared.section}>
        <h3 className={shared.sectionTitle}>NEED HELP?</h3>
        <p className={shared.hint}>
          If you need to delete this space or have other questions, we're here to help.
          We keep backups for 30 days in case you change your mind.
        </p>
        <button className={styles.supportLink} onClick={handleRequestDeletion}>
          <span className={styles.supportIcon}><EnvelopeIcon /></span>
          Request Space Deletion
        </button>
      </div>
    </div>
  );
}
