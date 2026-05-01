// pages/JoinPage.jsx — Anamoria SPA
// v1.6 — May 1, 2026
// Changes from v1.5:
//   Personal invite token support for gated alpha launch.
//
//   NEW: /join/invite/:token route — reads token from URL path via useParams.
//   On mount, if token is present:
//     1. Shows branded loading screen ("Checking your invite...")
//     2. Calls POST /pilot/validate-invite with the token
//     3. On success: stores groupId, groupName, inviteToken in sessionStorage,
//        advances to Step 2 (name entry), shows masked email hint
//     4. On failure: shows error banner, falls back to Step 1 (manual entry)
//
//   Token is stored in sessionStorage as ana_inviteToken. App.jsx bootstrap
//   reads it and passes it to POST /pilot/join, which claims the token
//   atomically with user creation.
//
//   If URL has no token (/join), page renders identically to v1.5.
//   Zero regression on existing flows.
//
// Previous changes (v1.5):
//   Layout + structure pass — dual-section parallel paths (Returning / Just Joining).
//   See v1.5 header for full details.
//
// Route: /join (public — no JWT, uses API key)
// Route: /join/invite/:token (public — no JWT, uses API key)

import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useParams } from 'react-router-dom';
import { createApiClient } from '../api/client';
import styles from './JoinPage.module.css';

export default function JoinPage() {
  const { loginWithRedirect, getAccessTokenSilently } = useAuth0();
  const api = createApiClient(getAccessTokenSilently);

  // v1.6: Read invite token from URL path (/join/invite/:token)
  const { token: inviteToken } = useParams();

  // v1.3: Two-step flow — step 1 = code entry, step 2 = name entry
  const [step, setStep] = useState(inviteToken ? 0 : 1); // 0 = invite loading
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // v1.5: Separate state for Sign In path (Returning section).
  const [signInError, setSignInError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  // v1.6: Invite token state
  const [inviteError, setInviteError] = useState('');
  const [inviteEmail, setInviteEmail] = useState(''); // masked email from validate

  // v1.6: Auto-validate invite token on mount
  useEffect(() => {
    if (!inviteToken) return;

    let cancelled = false;

    async function validateInvite() {
      try {
        const data = await api.postPublic('/pilot/validate-invite', {
          token: inviteToken,
        });

        if (cancelled) return;

        sessionStorage.setItem('ana_groupId', data.groupId);
        sessionStorage.setItem('ana_groupName', data.groupName);
        sessionStorage.setItem('ana_inviteToken', inviteToken);

        setGroupName(data.groupName);
        setInviteEmail(data.maskedEmail);
        setStep(2); // Skip code entry — go straight to name
      } catch (err) {
        if (cancelled) return;

        if (err.error === 'INVITE_ALREADY_CLAIMED') {
          setInviteError("This invite has already been used. If you already have an account, sign in above.");
        } else if (err.error === 'INVITE_EXPIRED') {
          setInviteError("This invite has expired. Please ask for a new one.");
        } else if (err.error === 'GROUP_NOT_ACTIVE') {
          setInviteError("This group isn't active yet. Check back when your group leader lets you know it's ready.");
        } else {
          setInviteError("This invite link isn't working. Please check with the person who sent it.");
        }
        setStep(1); // Fall back to manual entry
      }
    }

    validateInvite();

    return () => { cancelled = true; };
  }, [inviteToken]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // is cached in this browser.
    await loginWithRedirect({
      authorizationParams: { max_age: 0 },
      appState: { returnTo: '/' },
    });
  }

  // v1.5: Returning user sign-in with loading state.
  async function handleSignIn() {
    setSignInError('');
    setIsSigningIn(true);

    try {
      await loginWithRedirect({
        authorizationParams: { max_age: 0 },
        appState: { returnTo: '/' },
      });
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
    setInviteError('');
    setInviteEmail('');
    // Clear invite token from sessionStorage if going back
    sessionStorage.removeItem('ana_inviteToken');
  }

  return (
    <div className={styles.page}>

      {/* ─── Brand panel (v1.5) ─── */}
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

      {/* ─── Form panel (v1.5) ─── */}
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
              STEP 0: Invite token loading (v1.6)
              Shown while POST /pilot/validate-invite is in flight.
              ═══════════════════════════════════════ */}
          {step === 0 && (
            <div className={styles.inviteLoading}>
              <img
                src="/butterfly.svg"
                alt=""
                className={styles.inviteButterfly}
                aria-hidden="true"
              />
              <p className={styles.inviteLoadingText}>Checking your invite...</p>
            </div>
          )}

          {/* ═══════════════════════════════════════
              STEP 1: Dual-section parallel paths (v1.5)
              ═══════════════════════════════════════ */}
          {step === 1 && (
            <>
              {/* v1.6: Invite error banner — shown when token validation failed,
                  user falls back to Step 1. Appears above the dual-section layout. */}
              {inviteError && (
                <div className={styles.inviteErrorBanner} role="alert">
                  <p>{inviteError}</p>
                </div>
              )}

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
              v1.6: Shows masked email hint when arriving via invite token.
              ═══════════════════════════════════════ */}
          {step === 2 && (
            <>
              <div className={styles.header}>
                <p className={styles.groupBadge}>{groupName}</p>
                <h2 className={styles.step2Heading}>What should we call you?</h2>
                <p className={styles.subtitle}>
                  This is how your name will appear in your vault.
                </p>
                {/* v1.6: Masked email hint — confirms which email the invite is for */}
                {inviteEmail && (
                  <p className={styles.inviteEmailHint}>
                    Invite for {inviteEmail}
                  </p>
                )}
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

        </div>
      </div>
    </div>
  );
}
