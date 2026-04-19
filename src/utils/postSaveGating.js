// src/utils/postSaveGating.js
// v1.2 — Session 2 (April 19, 2026)
//
// Changes from v1.1:
//   - FEEDBACK BRANCH IS NOW IMPLEMENTED.
//     v1.1 had a comment-only stub that always fell through to 'feed'.
//     v1.2 fetches fresh stats + memory count from the server and applies
//     the R3 gating rules from Plan v1.2 §2. When a rule matches, returns
//     {redirectTo:'feedback', triggerContext, userMemoryCount} so the
//     caller can populate router state for FeedbackPage.
//   - `getApi` is now USED (v1.1 preserved the arg but didn't call it).
//   - Added a new optional arg `userMemoryCount` for callers that already
//     know the count post-save. If not provided, the helper fetches it
//     from `GET /spaces/{id}/memories/count` (parallel with stats fetch).
//   - Return shape is a widened union:
//       { redirectTo: 'reminder' }
//       { redirectTo: 'feed' }
//       { redirectTo: 'feedback', triggerContext, userMemoryCount }
//     The third shape is new in v1.2. Callers switching on redirectTo will
//     compile-error-free (plain object access), but must now destructure
//     triggerContext + userMemoryCount when routing to feedback.
//
// Changes from v1.1 — reminder branch:
//   - BYTE-IDENTICAL. Zero regression risk.
//
// Purpose:
//   Pure async decision function. Given current space state (+ memoryType +
//   optional pre-known memory count), decides where a user should land after
//   the SuccessScreen "View all memories" CTA.
//
//   Called by RecordPage, WritePage, PhotoPage from their
//   tertiaryCta.onClick handler.
//
// Branch table (v1.2):
//   ┌────────────────────────────────────────────────────────┬──────────────────────────┐
//   │ Condition                                              │ returns                  │
//   ├────────────────────────────────────────────────────────┼──────────────────────────┤
//   │ space.reminderPromptedAt == null                       │ { redirectTo:            │
//   │   (never prompted on this space)                       │   'reminder' }           │
//   ├────────────────────────────────────────────────────────┼──────────────────────────┤
//   │ R3 gating matches (First_Memory / First_Voice /        │ { redirectTo:            │
//   │   First_Text / First_Photo / Periodic)                 │   'feedback',            │
//   │                                                        │   triggerContext,        │
//   │                                                        │   userMemoryCount }      │
//   ├────────────────────────────────────────────────────────┼──────────────────────────┤
//   │ gating fetch fails, no rule matches, or any throw      │ { redirectTo:            │
//   │                                                        │   'feed' }               │
//   └────────────────────────────────────────────────────────┴──────────────────────────┘
//
// R3 gating rules (Plan v1.2 §2, locked — evaluated in order, first match wins):
//   1. First_Memory  — userMemoryCount === 1 AND no prior First_Memory feedback
//   2. First_Voice   — memoryType === 'voice' AND no prior First_Voice feedback
//   3. First_Text    — memoryType === 'text'  AND no prior First_Text feedback
//   4. First_Photo   — memoryType === 'photo' AND no prior First_Photo feedback
//   5. Periodic      — >= 7 days since last Periodic AND >= 3 memories since last Periodic
//
// Guardrails (unchanged from v1.1):
//   - Pure async function — no DOM, no navigate(), no sessionStorage reads or writes.
//     Reminder prompt history reads from space.reminderPromptedAt (DB-owned;
//     ADR-038). Feedback state reads from GET /feedback/stats (Session 2 Lambda).
//   - Never throws. Any internal error is caught and returns
//     { redirectTo: 'feed' } so the caller can navigate safely.
//   - The CALLER is also expected to wrap the call in its own try/catch as
//     defense-in-depth. Pattern established in Session 1A.
//
// Contract:
//   @param {Object} args
//   @param {string} args.spaceId                       — current space UUID
//   @param {Object} args.space                         — space object with
//                                                        { reminderPromptedAt, ... }
//   @param {'voice'|'text'|'photo'} args.memoryType    — type just saved
//   @param {Function} args.getApi                      — () => apiClient
//   @param {number}  [args.userMemoryCount]            — optional; if omitted,
//                                                        fetched from server
//   @returns {Promise<
//     { redirectTo: 'reminder' } |
//     { redirectTo: 'feedback', triggerContext: string, userMemoryCount: number } |
//     { redirectTo: 'feed' }
//   >}

export async function checkPostSaveGating({
  spaceId,
  space,
  memoryType,
  getApi,
  userMemoryCount,   // optional — falls back to server fetch
}) {
  try {
    // ─── REMINDER BRANCH (Session 1A.5 — DB-backed; BYTE-IDENTICAL to v1.1) ──
    // Show reminder opt-in if the user has not yet been prompted on this
    // space. `reminderPromptedAt == null` covers both null and undefined
    // (loose-equality intentional) — the single source of truth is the DB
    // column `spaces.reminder_prompted_at`.
    //
    // Note: `space?.reminderPromptedAt` uses optional chaining so a missing
    // space object falls through to `feed` rather than showing reminder.
    if (space && space.reminderPromptedAt == null) {
      return { redirectTo: 'reminder' };
    }

    // ─── FEEDBACK BRANCH (Session 2 — v1.2) ──────────────────────────────────
    // Preconditions at this point: space is loaded AND reminder has been
    // prompted before (reminderPromptedAt != null). We now fetch whatever we
    // need (stats + optionally count) in parallel and evaluate R3 rules.
    //
    // Fetching strategy:
    //   - stats: always fetched (we don't cache — BP2 revised, compute on read)
    //   - count: fetched only if caller didn't provide userMemoryCount
    //
    // Parallel fetch via Promise.all — both are independent GETs. Sequential
    // fetching would double latency before FeedbackPage can be shown.
    //
    // Any fetch failure → log + fall through to 'feed'. Do NOT block the
    // user's post-save flow on feedback gating errors. Per handoff §5.2.

    const api = typeof getApi === 'function' ? getApi() : null;
    if (!api) {
      console.error('[postSaveGating] getApi did not return a valid client; falling through to feed');
      return { redirectTo: 'feed' };
    }

    let stats;
    let countResolved;
    try {
      if (typeof userMemoryCount === 'number') {
        // Caller provided count; only fetch stats.
        stats = await api.get(`/spaces/${spaceId}/feedback/stats`);
        countResolved = userMemoryCount;
      } else {
        // Fetch both in parallel.
        const [countResponse, statsResponse] = await Promise.all([
          api.get(`/spaces/${spaceId}/memories/count`),
          api.get(`/spaces/${spaceId}/feedback/stats`),
        ]);
        countResolved = countResponse?.count ?? 0;
        stats = statsResponse;
      }
    } catch (err) {
      console.error(
        '[postSaveGating] stats/count fetch failed; falling through to feed:',
        err
      );
      return { redirectTo: 'feed' };
    }

    // Stats shape defensive check. If the Lambda response is malformed,
    // evaluate gating as if no feedback has ever been given on any first —
    // that's the safest UX (more feedback prompts, never fewer), but if
    // fields are missing entirely, fall through to feed.
    if (!stats || typeof stats !== 'object') {
      console.error('[postSaveGating] stats response malformed; falling through to feed');
      return { redirectTo: 'feed' };
    }

    // ─── R3 evaluation ───────────────────────────────────────────────────────
    const triggerContext = decideTriggerContext(memoryType, stats, countResolved);
    if (triggerContext) {
      return {
        redirectTo: 'feedback',
        triggerContext,
        userMemoryCount: countResolved,
      };
    }

    // ─── DEFAULT ─────────────────────────────────────────────────────────────
    return { redirectTo: 'feed' };
  } catch (err) {
    // Never block the user from reaching the feed. The caller will also log,
    // but we log here so callers that forget to log still leave a trace.
    console.error('[postSaveGating] unexpected error, falling through to feed:', err);
    return { redirectTo: 'feed' };
  }
}

// ============================================================================
// decideTriggerContext — pure function, no side effects
// ============================================================================
//
// Evaluates R3 gating rules in priority order. First match wins.
// Returns the triggerContext string that matched, or null if no rule fires.
//
// Exported as a named helper so it can be unit-tested in isolation.
// (Not consumed externally by any runtime code — the main entrypoint is
// checkPostSaveGating above.)
//
// @param {'voice'|'text'|'photo'} memoryType
// @param {Object} stats             — response from GET /feedback/stats
// @param {number} userMemoryCount   — total owner memories in this space
// @returns {string|null}
export function decideTriggerContext(memoryType, stats, userMemoryCount) {
  // 1. First_Memory — user's first memory of any type, not yet feedbacked.
  //    "First" is strict: userMemoryCount === 1 at time of save.
  if (userMemoryCount === 1 && !stats.hasFirstMemoryFeedback) {
    return 'First_Memory';
  }

  // 2. First by type — first memory of this particular type, not yet feedbacked.
  if (memoryType === 'voice' && !stats.hasFirstVoiceFeedback) return 'First_Voice';
  if (memoryType === 'text'  && !stats.hasFirstTextFeedback)  return 'First_Text';
  if (memoryType === 'photo' && !stats.hasFirstPhotoFeedback) return 'First_Photo';

  // 3. Periodic — >= 7 days since last Periodic AND >= 3 memories since
  //    If never given Periodic feedback, the cooldown is satisfied by default.
  //    The ">= 3 memories since last Periodic" is compared against the
  //    server-computed `memoriesSinceLastPeriodic` in the stats response.
  const last = stats.lastPeriodicFeedbackAt
    ? new Date(stats.lastPeriodicFeedbackAt).getTime()
    : null;
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const periodicCooldownOk = last === null || last <= sevenDaysAgo;
  const periodicMemoryThresholdOk =
    typeof stats.memoriesSinceLastPeriodic === 'number' &&
    stats.memoriesSinceLastPeriodic >= 3;

  if (periodicCooldownOk && periodicMemoryThresholdOk) {
    return 'Periodic';
  }

  return null;
}
