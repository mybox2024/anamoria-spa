// components/settings/NeedHelpPanel.jsx — Anamoria SPA
// v1.2 — Navigate to request panel via callback (April 21, 2026 — Phase C)
//
// Changes from v1.1:
//   - Replaced generic mailto link with "Submit a request" button
//   - Uses onRequestHelp callback prop to open request panel inside SettingsPage
//     (request form renders as a panel, not a standalone route)
//   - space prop used to pass space name for subject pre-fill
//
// Previous changes (v1.1):
//   - Removed Space Deletion button, EnvelopeIcon, panel-specific styles

import shared from './settingsShared.module.css';

export default function NeedHelpPanel({ space, onRequestHelp }) {
  function handleContact() {
    if (onRequestHelp) {
      onRequestHelp(space?.name || null);
    }
  }

  return (
    <div>
      <div className={shared.section}>
        <h3 className={shared.sectionTitle}>NEED HELP?</h3>
        <p className={shared.hint}>
          If you have questions about this space or need a hand, we're here to help.
        </p>
        <button className={shared.saveBtn} onClick={handleContact}>
          Submit a request
        </button>
      </div>
    </div>
  );
}
