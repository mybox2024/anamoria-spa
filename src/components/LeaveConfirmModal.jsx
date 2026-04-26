// components/LeaveConfirmModal.jsx — Anamoria SPA
// v1.0 — Shared "Leave without saving?" modal (April 26, 2026)
//
// Ported from LWC Step 14.5 (axr_MemoryVaultV2.html lines 3659–3706,
// .js lines 5430–5452). Renders a confirmation dialog when the user
// attempts to navigate away from a capture/edit screen with unsaved work.
//
// Props:
//   open           — boolean — controls visibility (modal renders when true)
//   message        — string — contextual description, e.g.
//                    "Your writing won't be saved if you leave now."
//   icon           — 'write' | 'record' | 'photo' | 'edit' — determines
//                    which SVG icon is shown in the modal header circle
//   onKeepEditing  — function — dismiss modal, stay on page
//   onLeave        — function — discard work, navigate away
//
// Usage:
//   <LeaveConfirmModal
//     open={showLeaveConfirm}
//     message="Your recording won't be saved if you leave now."
//     icon="record"
//     onKeepEditing={() => setShowLeaveConfirm(false)}
//     onLeave={() => { setShowLeaveConfirm(false); navigate(-1); }}
//   />
//
// Accessibility:
//   - role="dialog" with aria-modal="true"
//   - Backdrop click dismisses (calls onKeepEditing)
//   - Card click stops propagation (doesn't dismiss)
//   - Focus management: "Keep editing" is the primary action

import styles from './LeaveConfirmModal.module.css';

/* ─── Icon SVGs ─── */

function RecordModalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function WriteModalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function PhotoModalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function EditModalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

const ICONS = {
  record: RecordModalIcon,
  write: WriteModalIcon,
  photo: PhotoModalIcon,
  edit: EditModalIcon,
};

export default function LeaveConfirmModal({
  open,
  message,
  icon = 'edit',
  onKeepEditing,
  onLeave,
}) {
  if (!open) return null;

  const IconComponent = ICONS[icon] || ICONS.edit;

  return (
    <div
      className={styles.backdrop}
      onClick={onKeepEditing}
      role="dialog"
      aria-modal="true"
      aria-label="Leave without saving?"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.icon}>
          <IconComponent />
        </div>

        <h3 className={styles.heading}>Leave without saving?</h3>
        <p className={styles.message}>{message}</p>

        <div className={styles.actions}>
          <button
            className={styles.keepBtn}
            onClick={onKeepEditing}
            autoFocus
          >
            Keep editing
          </button>
          <button
            className={styles.leaveBtn}
            onClick={onLeave}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
