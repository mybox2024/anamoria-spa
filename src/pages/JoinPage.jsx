// pages/JoinPage.jsx — Anamoria SPA
// v1.3 — April 15, 2026
// Changes from v1.2:
//   - Added two-step flow within the same route (/join):
//     Step 1: Enter access code (unchanged from v1.2)
//     Step 2: "What should we call you?" — collects display name after code validates.
//     Name stored in sessionStorage as ana_displayName. App.jsx bootstrap reads it
//     and passes to POST /pilot/join instead of auth0User.name (which is email for OTP users).
//   - max_age: 0 on new user loginWithRedirect (step 2) — forces fresh Auth0 login
//     even if a previous user's session is cached. Critical for shared devices.
//   - "Sign in" link also uses max_age: 0 — returning users on shared devices must
//     re-authenticate to prevent silent login as the wrong person.
//   - All branding from v1.2 preserved (logo, tagline, trust badge).
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

  // Step 1: Validate access code
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
      if (err.error === 'INVALID_CODE') {
        setError("That code doesn't look right. Check with your group leader.");
      } else if (err.error === 'GROUP_NOT_ACTIVE') {
        setError("This group isn't active yet. Your pilot hasn't started.");
      } else if (err.error === 'NETWORK_ERROR') {
        setError('Connection problem — please try again.');
      } else {
        setError('Something went wrong. Please try again.');
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

  // Returning user sign-in — also forces fresh auth for shared device safety
  function handleSignIn() {
    loginWithRedirect({
      authorizationParams: { max_age: 0 },
      appState: { returnTo: '/' },
    });
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
      <div className={styles.content}>

        {/* ─── Logo section (v1.2) ─── */}
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
            STEP 1: Access Code Entry
            ═══════════════════════════════════════ */}
        {step === 1 && (
          <>
            <div className={styles.header}>
              <h2 className={styles.title}>Welcome</h2>
              <p className={styles.subtitle}>
                Enter the access code from your group leader to get started.
              </p>
            </div>

            <form onSubmit={handleCodeSubmit} className={styles.form} noValidate>
              <div className={styles.fieldGroup}>
                <label htmlFor="access-code" className={styles.label}>
                  Access code
                </label>
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
                  placeholder="Enter your code"
                  className={styles.input}
                  aria-describedby={error ? 'code-error' : undefined}
                  disabled={loading}
                />
                {error && (
                  <p id="code-error" className={styles.error} role="alert">
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className={styles.btn}
                disabled={loading || code.trim().length === 0}
              >
                {loading ? (
                  <span className={styles.btnSpinner} aria-label="Checking code" />
                ) : (
                  'Continue'
                )}
              </button>
            </form>

            <p className={styles.footer}>
              Already have an account?{' '}
              <button
                type="button"
                className={styles.footerLink}
                onClick={handleSignIn}
              >
                Sign in
              </button>
            </p>
          </>
        )}

        {/* ═══════════════════════════════════════
            STEP 2: Name Collection (v1.3)
            ═══════════════════════════════════════ */}
        {step === 2 && (
          <>
            <div className={styles.header}>
              <p className={styles.groupBadge}>{groupName}</p>
              <h2 className={styles.title}>What should we call you?</h2>
              <p className={styles.subtitle}>
                This is how your name will appear in your memory spaces.
              </p>
            </div>

            <form onSubmit={handleNameSubmit} className={styles.form} noValidate>
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
                  placeholder="e.g. Sophie R"
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

        {/* ─── Trust badge (v1.2) ─── */}
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
          <span>Private &amp; Secure</span>
        </div>

      </div>
    </div>
  );
}
