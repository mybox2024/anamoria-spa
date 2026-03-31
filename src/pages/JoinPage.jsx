// pages/JoinPage.jsx — Anamoria SPA
// Route: /join (public — no JWT, uses API key)

import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import styles from './JoinPage.module.css';

export default function JoinPage() {
  const { loginWithRedirect, getAccessTokenSilently } = useAuth0();
  const api = createApiClient(getAccessTokenSilently);

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setError('');
    setLoading(true);

    try {
      const data = await api.postPublic('/pilot/validate-code', {
        accessCode: trimmed,
      });

      localStorage.setItem('ana_groupId', data.groupId);
      localStorage.setItem('ana_groupName', data.groupName);

      await loginWithRedirect({
        appState: { returnTo: '/' },
      });
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

  function handleCodeChange(e) {
    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (error) setError('');
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>

        <div className={styles.header}>
          <p className={styles.brand}>Anamoria</p>
          <h1 className={styles.title}>Welcome.</h1>
          <p className={styles.subtitle}>
            Enter the access code from your group leader to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
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
            onClick={() => loginWithRedirect({ appState: { returnTo: '/' } })}
          >
            Sign in
          </button>
        </p>

      </div>
    </div>
  );
}
