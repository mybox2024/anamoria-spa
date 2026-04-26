// pages/JoinPage.jsx — Anamoria SPA
// v1.5 — April 25, 2026
// Changes from v1.4:
//   Layout + structure pass — implements approved Login/Typography/Auth0 plan v1.0.
//   See Anamoria_Login_Typography_Auth0_Plan_v1_0.md for full rationale.
//
//   Step 1 (access code entry) — RESTRUCTURED to dual-section parallel paths:
//     - Layout was: single header + form (with inline sign-in link in subtitle)
//     - Layout now: two parallel sections separated by horizontal divider
//         · "RETURNING" section — section label + "Sign in to your vault." +
//           full-width Sign In button (returning user path — primary action)
//         · "JUST JOINING?" section — section label + "Enter your access code"
//           heading + subtitle + access code input + Continue button
//     - Inline sign-in link in subtitle removed entirely; Sign In is now a
//       primary CTA in its own section with equal weight to the access code path.
//
//   Sign In button — NEW LOADING STATE:
//     - Added isSigningIn state. Click → spinner shows briefly during the window
//       between click and Auth0 redirect. Prevents double-clicks on slow connections.
//     - Wrapped loginWithRedirect in try/catch. On reject (rare — network failure
//       or Auth0 outage), resets isSigningIn and shows generic-fallback error in
//       the Returning section (separate from access code error).
//     - signInError state — separate from access code error so the two paths stay
//       cleanly isolated. A user clicking Sign In never sees error text under the
//       access code field.
//
//   Step 2 (name collection) — typography only:
//     - Heading "What should we call you?" now uses .step2Heading class which
//       consumes var(--font-serif) (system serif fallback chain — see
//       variables.css v1.1). All other Step 2 copy and structure unchanged.
//
//   Trust badge:
//     - Label unchanged ("Secure"). Persists across both steps.
//
//   Layout: responsive split-screen on desktop (≥ 1024px) + centered stack on
//   mobile (< 1024px). Brand panel (sage, butterfly+wordmark+tagline) on desktop
//   left side; logo section at top of content stack on mobile. CSS handles the
//   responsive switch — no JS conditional rendering for layout.
//
//   Layout refinements (within v1.5):
//     - Brand/form proportion: 40/60 (was 50/50)
//     - Form panel: left-aligned content with 96px horizontal padding on desktop
//     - Tagline: non-italic on both desktop and mobile
//     - Butterfly cream asset: fill #faf9f7 (matches --color-bg cream background)
//
//   Removed CSS classes: .inlineLink (consumed by v1.4 inline sign-in, no longer present)
//   New CSS classes consumed: .brandPanel, .formPanel, .sectionLabel,
//   .sectionSubtitle, .sectionHeading, .sectionDivider, .step2Heading, .codeInputRow
//
// Previous changes (v1.4):
//   - Voice pass on copy across both steps (em dashes removed, AI tells removed,
//     product-accurate "vault" wording, error strings rewritten)
//   - .inlineLink class for inline sign-in (now removed in v1.5)
//   - Trust badge "Private & Secure" → "Secure"
//
// Previous changes (v1.3):
//   - Two-step flow (access code → display name)
//   - max_age: 0 on Auth0 redirects for shared-device safety
//
// Previous changes (v1.2):
//   - Added butterfly logo, ANAMORIA wordmark, tagline, trust badge
//
// Previous changes (v1.1):
//   - localStorage.setItem → sessionStorage.setItem for ana_groupId and ana_groupName
//
// Route: /join (public — no JWT, uses API key)

import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import styles from './JoinPage.module.css';

export default function JoinPage() {
  const { loginWithRedirect, getAccessTokenSilently } = useAuth0();
  const api = createApiClient(getAccessTokenSilently);

  // v1.3: Two-step flow — step 1 = code entry, step 2 = name entry
  const [step, setStep] = useState(1);
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // v1.5: Separate state for Sign In path (Returning section).
  // Kept isolated from `error` (access code path) so users see errors
  // only in the section they were interacting with.
  const [signInError, setSignInError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Step 1: Validate access code (Just Joining section)
  async function handleCodeSubmit(e) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setError('');
    setLoading(true);

    try {
      const data = await api.postPublic('/pilot/validate-code', {
        accessCode: trimmed,
      });

      sessionStorage.setItem('ana_groupId', data.groupId);
      sessionStorage.setItem('ana_groupName', data.groupName);

      // v1.3: Transition to name step instead of immediate Auth0 redirect
      setGroupName(data.groupName);
      setLoading(false);
      setStep(2);
    } catch (err) {
      // v1.4: Voice pass on error strings
      if (err.error === 'INVALID_CODE') {
        setError("That code doesn't look right. Check with your group leader.");
      } else if (err.error === 'GROUP_NOT_ACTIVE') {
        setError("This group isn't active yet. Check back when your group leader lets you know it's ready.");
      } else if (err.error === 'NETWORK_ERROR') {
        setError("Something's wrong with the connection. Please try again in a moment.");
      } else {
        setError("Something's not working right. Please try again, or let us know if it keeps happening.");
      }
      setLoading(false);
    }
  }

  // Step 2: Save name and redirect to Auth0
  async function handleNameSubmit(e) {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) return;

    // Store name in sessionStorage — App.jsx bootstrap reads it for POST /pilot/join
    sessionStorage.setItem('ana_displayName', trimmed);

    // v1.3: max_age: 0 forces fresh Auth0 login even if a previous user's session
    // is cached in this browser. Critical for shared devices — prevents a new user
    // from silently authenticating as the previous user. Uses OIDC max_age (stronger
    // than prompt: 'login') per Auth0 best practice for sensitive data.
    await loginWithRedirect({
      authorizationParams: { max_age: 0 },
      appState: { returnTo: '/' },
    });
  }

  // v1.5: Returning user sign-in with loading state.
  // The spinner is visible during the brief window between click and the Auth0
  // redirect navigating away from the page. Prevents double-clicks on slow
  // connections. On reject (network failure / Auth0 outage), shows a separate
  // signInError below the Sign In button.
  async function handleSignIn() {
    setSignInError('');
    setIsSigningIn(true);

    try {
      await loginWithRedirect({
        authorizationParams: { max_age: 0 },
        appState: { returnTo: '/' },
      });
      // Note: on success, navigation happens before this line resolves.
      // No need to setIsSigningIn(false) on success — page is unmounting.
    } catch (err) {
      setIsSigningIn(false);
      setSignInError("Something's not working right. Please try again, or let us know if it keeps happening.");
    }
  }

  function handleCodeChange(e) {
    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (error) setError('');
  }

  function handleNameChange(e) {
    setDisplayName(e.target.value);
  }

  // Go back to step 1
  function handleBackToCode() {
    setStep(1);
    setError('');
  }

  return (
    <div className={styles.page}>

      {/* ─── Brand panel (v1.5) ───
          Desktop (≥ 1024px): renders as left half of split-screen, sage background,
          cream butterfly + wordmark + tagline. Visible at all times.
          Mobile (< 1024px): hidden via CSS; .logoSection inside .formPanel takes over. */}
      <div className={styles.brandPanel} aria-hidden="true">
        <div className={styles.brandPanelInner}>
          <img
            src="/butterfly-cream.svg"
            alt=""
            className={styles.brandPanelButterfly}
          />
          <h1 className={styles.brandPanelWordmark}>ANAMORIA</h1>
          <p className={styles.brandPanelTagline}>A private place to remember</p>
        </div>
      </div>

      {/* ─── Form panel (v1.5) ───
          Desktop: right half of split-screen.
          Mobile: full-width content stack with logo at top. */}
      <div className={styles.formPanel}>
        <div className={styles.content}>

          {/* ─── Mobile logo section (v1.2 — visible only < 1024px via CSS) ─── */}
          <div className={styles.logoSection}>
            <img
              src="/butterfly.svg"
              alt=""
              className={styles.butterfly}
              aria-hidden="true"
            />
            <h1 className={styles.wordmark}>ANAMORIA</h1>
            <p className={styles.tagline}>A private place to remember</p>
          </div>

          {/* ═══════════════════════════════════════
              STEP 1: Dual-section parallel paths (v1.5)
              ═══════════════════════════════════════ */}
          {step === 1 && (
            <>
              {/* ─── Returning section ─── */}
              <section className={styles.section} aria-labelledby="returning-label">
                <p
                  id="returning-label"
                  className={styles.sectionLabel}
                >
                  RETURNING
                </p>
                <p className={styles.sectionSubtitle}>
                  Sign in to your vault.
                </p>

                <button
                  type="button"
                  className={styles.btn}
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                >
                  {isSigningIn ? (
                    <span
                      className={styles.btnSpinner}
                      aria-label="Signing in"
                    />
                  ) : (
                    <>
                      <svg
                        className={styles.signInIcon}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                        <polyline points="10 17 15 12 10 7" />
                        <line x1="15" y1="12" x2="3" y2="12" />
                      </svg>
                      Sign In
                    </>
                  )}
                </button>

                {signInError && (
                  <p
                    className={styles.error}
                    role="alert"
                  >
                    {signInError}
                  </p>
                )}
              </section>

              {/* ─── Section divider ─── */}
              <hr className={styles.sectionDivider} aria-hidden="true" />

              {/* ─── Just Joining section ─── */}
              <section className={styles.section} aria-labelledby="just-joining-label">
                <p
                  id="just-joining-label"
                  className={styles.sectionLabel}
                >
                  JUST JOINING?
                </p>
                <h2 className={styles.sectionHeading}>
                  Enter your access code
                </h2>
                <p className={styles.sectionHint}>
                  Your group leader will have shared one with you.
                </p>

                <form
                  onSubmit={handleCodeSubmit}
                  className={styles.form}
                  noValidate
                >
                  <div className={styles.codeInputRow}>
                    <input
                      id="access-code"
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={20}
                      value={code}
                      onChange={handleCodeChange}
                      placeholder="Enter code"
                      className={styles.input}
                      aria-label="Access code"
                      aria-describedby={error ? 'code-error' : undefined}
                      disabled={loading}
                    />
                    <button
                      type="submit"
                      className={styles.btnContinue}
                      disabled={loading || code.trim().length === 0}
                    >
                      {loading ? (
                        <span
                          className={styles.btnSpinnerDark}
                          aria-label="Checking code"
                        />
                      ) : (
                        'Continue'
                      )}
                    </button>
                  </div>

                  {error && (
                    <p
                      id="code-error"
                      className={styles.error}
                      role="alert"
                    >
                      {error}
                    </p>
                  )}
                </form>
              </section>

              {/* ─── Trust badge (Step 1 — left-aligned with form content) ─── */}
              <div className={styles.trustBadge}>
                <svg
                  className={styles.trustIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <span>Secure</span>
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════
              STEP 2: Name Collection (v1.3)
              v1.5: Heading uses .step2Heading (serif font).
              All other content unchanged from v1.4.
              ═══════════════════════════════════════ */}
          {step === 2 && (
            <>
              <div className={styles.header}>
                <p className={styles.groupBadge}>{groupName}</p>
                <h2 className={styles.step2Heading}>What should we call you?</h2>
                <p className={styles.subtitle}>
                  This is how your name will appear in your vault.
                </p>
              </div>

              <form
                onSubmit={handleNameSubmit}
                className={styles.form}
                noValidate
              >
                <div className={styles.fieldGroup}>
                  <label htmlFor="display-name" className={styles.label}>
                    Your name
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    autoCapitalize="words"
                    autoCorrect="off"
                    autoComplete="name"
                    spellCheck={false}
                    maxLength={100}
                    value={displayName}
                    onChange={handleNameChange}
                    placeholder="e.g. Alex Morgan"
                    className={styles.nameInput}
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className={styles.btn}
                  disabled={displayName.trim().length === 0}
                >
                  Continue
                </button>
              </form>

              {/* ─── Trust badge (Step 2 — centered) ─── */}
              <div className={`${styles.trustBadge} ${styles.trustBadgeCenter}`}>
                <svg
                  className={styles.trustIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <span>Secure</span>
              </div>

              <p className={styles.footer}>
                <button
                  type="button"
                  className={styles.footerLink}
                  onClick={handleBackToCode}
                >
                  ← Back
                </button>
              </p>
            </>
          )}

          {/* Trust badge moved inside each step block — see Step 1 and Step 2 above */}

        </div>
      </div>
    </div>
  );
}
