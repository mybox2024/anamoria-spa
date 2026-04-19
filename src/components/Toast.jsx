// components/Toast.jsx — reusable transient toast
// v1.0 — Session 2 (April 19, 2026)
//
// Purpose:
//   Controlled, self-dismissing toast component. Parent owns visibility;
//   Toast owns the auto-dismiss timer. Introduced in Session 2 for the
//   feedback flow ("Thanks for sharing"); designed as a reusable primitive
//   for any future "stay on page" success confirmation.
//
// Design sources:
//   - Session 2 Implementation Plan v1.2 §8.3 (baseline spec)
//   - Anamoria Session 2 Frontend Phase Handoff v1.0 §5.4
//     ("If user navigates away before 2s timeout fires, the setTimeout must
//      be cleared. Standard useEffect cleanup pattern.")
//   - React.dev — useEffect cleanup pattern for subscriptions and timers
//     (https://react.dev/reference/react/useEffect#useeffect)
//   - ARIA Authoring Practices — role="status" + aria-live="polite" for
//     non-urgent transient messages
//     (https://www.w3.org/WAI/ARIA/apg/patterns/alert/)
//
// Accessibility:
//   - role="status"        — screen readers announce as a status message,
//                            not an error or alert
//   - aria-live="polite"   — announcement waits for current utterance to
//                            complete; does not interrupt
//   - pointer-events: none — via CSS; toast is informational only, clicks
//                            pass through to content beneath
//   - prefers-reduced-motion — honored in CSS (animation disabled)
//
// Contract:
//   @param {string}   message     Text to display inside the toast
//   @param {boolean}  visible     Whether to render the toast at all
//   @param {number}   durationMs  Auto-dismiss delay in milliseconds
//                                 (default 3000 — per Option B session
//                                 decision; NN/G + Designary research
//                                 support ≥3s for short confirmations)
//   @param {Function} onDismiss   Called once after durationMs elapses.
//                                 Consumer should set visible=false here.
//
// Usage:
//   const [toastVisible, setToastVisible] = useState(false);
//   // ...later, after async action succeeds:
//   setToastVisible(true);
//   // render:
//   <Toast
//     message="Thanks for sharing"
//     visible={toastVisible}
//     onDismiss={() => setToastVisible(false)}
//   />
//
// Lifecycle guarantees:
//   - Timer is created only when visible=true
//   - Timer is cleared on:
//       a) component unmount
//       b) visible flipping to false
//       c) durationMs or onDismiss identity changing (new timer supersedes)
//   - onDismiss fires exactly once per visibility cycle (one setTimeout
//     per effect run; cleanup cancels before reaching the callback)

import { useEffect } from 'react';
import styles from './Toast.module.css';

export default function Toast({
  message,
  visible,
  durationMs = 3000,
  onDismiss,
}) {
  // Auto-dismiss timer.
  // The effect runs when any dependency changes. If `visible` is false, we
  // bail early and no timer is scheduled. When `visible` flips true, a
  // setTimeout schedules the onDismiss call. The cleanup function (returned
  // by the effect) cancels that timeout if the component unmounts, if
  // `visible` flips back to false, or if durationMs / onDismiss change
  // identity before the timer fires.
  useEffect(() => {
    if (!visible) return undefined;

    const timerId = setTimeout(() => {
      onDismiss?.();
    }, durationMs);

    return () => clearTimeout(timerId);
  }, [visible, durationMs, onDismiss]);

  // Early return when hidden — no DOM node rendered. Keeps the accessibility
  // tree clean (no empty role="status" element announcing repeatedly).
  if (!visible) return null;

  return (
    <div
      className={styles.toast}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
