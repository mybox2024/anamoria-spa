// src/utils/postSaveGating.js
// v1.1 — Session 1A.5 (April 18, 2026)
//
// Changes from v1.0:
//   - Removed `hasSeenReminderPrompt` parameter from the function signature.
//     The session-scoped sessionStorage flag it represented has been retired
//     in favor of DB-owned state (see ADR-038).
//   - Reminder branch now reads `space.reminderPromptedAt` instead of the
//     combined `!reminderEnabled && !hasSeenReminderPrompt` rule. A null
//     (or absent) timestamp means "user has never been prompted on this
//     space" — regardless of reminderEnabled state. Once set (by ReminderPage
//     on Yes / Not now / Back), the user is never re-prompted for this space.
//   - Header branch table, guardrails, and @param contract updated to reflect
//     the new single-field rule and DB ownership.
//
// Purpose:
//   Pure async decision function. Given current space state, decides where a
//   user should land after the SuccessScreen "View all memories" CTA.
//   Called by RecordPage, WritePage, PhotoPage from their tertiaryCta.onClick
//   handler.
//
// Session scope:
//   Session 1A.5 — DB-backed reminder branch.
//   Session 2    — extends with feedback branch (queries /feedback/stats).
//   Session 3    — contributor gating reuses this helper via memoryType === 'voice' |
//                  'text' | 'photo' + contributor session token path (tbd).
//
// Branch table (reference for future sessions):
//   ┌───────────────────────────────────────────────────────────┬────────────────────┐
//   │ Condition                                                 │ returns            │
//   ├───────────────────────────────────────────────────────────┼────────────────────┤
//   │ space.reminderPromptedAt == null                          │ { redirectTo:      │
//   │   (never prompted on this space — regardless of           │   'reminder' }     │
//   │    reminderEnabled)                                       │                    │
//   ├───────────────────────────────────────────────────────────┼────────────────────┤
//   │ (Session 2) feedback eligibility check per R3 gating rule │ { redirectTo:      │
//   │   — stub in v1.1 (always returns 'feed' from this branch) │   'feedback' }     │
//   ├───────────────────────────────────────────────────────────┼────────────────────┤
//   │ otherwise                                                 │ { redirectTo:      │
//   │                                                           │   'feed' }         │
//   └───────────────────────────────────────────────────────────┴────────────────────┘
//
// Guardrails:
//   - Pure async function — no DOM, no navigate(), no sessionStorage reads or
//     writes. Prompt history is read from `space.reminderPromptedAt` which
//     is populated from the DB column `spaces.reminder_prompted_at`
//     (migration 015). ReminderPage writes it on Yes / Not now / Back via
//     PATCH /spaces/:id. See ADR-038.
//   - Never throws. Any internal error is caught and returns { redirectTo:
//     'feed' } so the caller can navigate safely. The CALLER is also expected
//     to wrap the call in its own try/catch as a defense-in-depth measure.
//   - `getApi` is retained in the signature even though unused in v1.1.
//     Session 2's feedback branch will use it to query /feedback/stats, and
//     preserving it now avoids another breaking-signature change when
//     feedback lands.
//
// Contract:
//   @param {Object} args
//   @param {string} args.spaceId                 — current space UUID
//   @param {Object} args.space                   — space object with
//                                                  { reminderPromptedAt, ... }
//                                                  where reminderPromptedAt is
//                                                  ISO string or null
//   @param {'voice'|'text'|'photo'} args.memoryType — type just saved
//   @param {Function} args.getApi                — () => apiClient (Session 2+)
//   @returns {Promise<{ redirectTo: 'reminder'|'feedback'|'feed' }>}

export async function checkPostSaveGating({
  spaceId,
  space,
  memoryType,
  getApi,
}) {
  try {
    // ─── REMINDER BRANCH (Session 1A.5 — DB-backed) ──────────────────────
    // Show reminder opt-in if the user has not yet been prompted on this
    // space. `reminderPromptedAt == null` covers both null and undefined
    // (loose-equality intentional) — the single source of truth is the DB
    // column `spaces.reminder_prompted_at`.
    //
    // Note: `space?.reminderPromptedAt` uses optional chaining so a missing
    // space object falls through to `feed` rather than showing reminder.
    // This differs from v1.0 which would have shown reminder in that case;
    // v1.1's stricter rule is safer — we only prompt when we can confirm the
    // null state from a loaded space object.
    if (space && space.reminderPromptedAt == null) {
      return { redirectTo: 'reminder' };
    }

    // ─── FEEDBACK BRANCH (Session 2 — stubbed in v1.1) ───────────────────
    // Session 2 will query /feedback/stats via getApi() and apply R3 gating:
    //   - First_Memory (once ever)
    //   - First_Voice / First_Text / First_Photo (once ever each)
    //   - Periodic (>=7d since last Periodic AND >=3 memories since last Periodic)
    // In Session 1A.5 this branch is intentionally a no-op: we fall through
    // to 'feed'. Do NOT remove this comment block when Session 2 extends the
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
