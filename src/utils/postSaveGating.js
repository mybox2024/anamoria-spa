// src/utils/postSaveGating.js
// v1.0 — Session 1A (April 18, 2026)
//
// Purpose:
//   Pure async decision function. Given current space + session state, decides
//   where a user should land after the SuccessScreen "View all memories" CTA.
//   Called by RecordPage, WritePage, PhotoPage from their tertiaryCta.onClick
//   handler.
//
// Session scope:
//   Session 1A — implements reminder branch only.
//   Session 2  — extends with feedback branch (queries /feedback/stats).
//   Session 3  — contributor gating reuses this helper via memoryType === 'voice' |
//                'text' | 'photo' + contributor session token path (tbd).
//
// Branch table (reference for future sessions):
//   ┌───────────────────────────────────────────────────────────┬────────────────────┐
//   │ Condition                                                 │ returns            │
//   ├───────────────────────────────────────────────────────────┼────────────────────┤
//   │ space.reminderEnabled === false                           │ { redirectTo:      │
//   │   AND hasSeenReminderPrompt === false                     │   'reminder' }     │
//   ├───────────────────────────────────────────────────────────┼────────────────────┤
//   │ (Session 2) feedback eligibility check per R3 gating rule │ { redirectTo:      │
//   │   — stub in v1.0 (always returns 'feed' from this branch) │   'feedback' }     │
//   ├───────────────────────────────────────────────────────────┼────────────────────┤
//   │ otherwise                                                 │ { redirectTo:      │
//   │                                                           │   'feed' }         │
//   └───────────────────────────────────────────────────────────┴────────────────────┘
//
// Guardrails:
//   - Pure async function — no DOM, no navigate(), no sessionStorage writes.
//     sessionStorage is READ at the call site and passed in as
//     `hasSeenReminderPrompt`. The helper never touches sessionStorage itself.
//     This keeps the function testable and keeps single-source-of-truth for
//     the session flag at the page level.
//   - Never throws. Any internal error is caught and returns { redirectTo:
//     'feed' } so the caller can navigate safely. The CALLER is also expected
//     to wrap the call in its own try/catch as a defense-in-depth measure.
//
// Contract:
//   @param {Object} args
//   @param {string} args.spaceId                 — current space UUID
//   @param {Object} args.space                   — space object with { reminderEnabled, ... }
//   @param {'voice'|'text'|'photo'} args.memoryType — type just saved
//   @param {boolean} args.hasSeenReminderPrompt  — from sessionStorage
//   @param {Function} args.getApi                — () => apiClient (Session 2+)
//   @returns {Promise<{ redirectTo: 'reminder'|'feedback'|'feed' }>}

export async function checkPostSaveGating({
  spaceId,
  space,
  memoryType,
  hasSeenReminderPrompt,
  getApi,
}) {
  try {
    // ─── REMINDER BRANCH (Session 1A) ────────────────────────────────────
    // Show reminder opt-in if the user has not yet enabled reminders on this
    // space AND has not already seen/dismissed the prompt in this session.
    //
    // Note: `space?.reminderEnabled` uses optional chaining so a missing
    // space object falls through to `feed` rather than showing reminder.
    if (!space?.reminderEnabled && !hasSeenReminderPrompt) {
      return { redirectTo: 'reminder' };
    }

    // ─── FEEDBACK BRANCH (Session 2 — stubbed in v1.0) ───────────────────
    // Session 2 will query /feedback/stats via getApi() and apply R3 gating:
    //   - First_Memory (once ever)
    //   - First_Voice / First_Text / First_Photo (once ever each)
    //   - Periodic (>=7d since last Periodic AND >=3 memories since last Periodic)
    // In Session 1A this branch is intentionally a no-op: we fall through to
    // 'feed'. Do NOT remove this comment block when Session 2 extends the
    // function; replace the body with the real check and keep the fall-through.

    // ─── DEFAULT ─────────────────────────────────────────────────────────
    return { redirectTo: 'feed' };
  } catch (err) {
    // Never block the user from reaching the feed. The caller will also log,
    // but we log here so callers that forget to log still leave a trace.
    console.error('[postSaveGating] unexpected error, falling through to feed:', err);
    return { redirectTo: 'feed' };
  }
}
