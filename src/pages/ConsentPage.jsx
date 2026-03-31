// pages/ConsentPage.jsx — Anamoria SPA
// Route: /consent (protected — JWT required)
//
// Flow:
//   1. Display privacy policy summary
//   2. User checks age confirmation + accepts
//   3. POST /pilot/consent → { consentId, consentType, createdAt }
//   4. Navigate to /spaces/new
//
// API: POST /pilot/consent
//   Request: { consentType: 'member_activation', policyVersion: '1.0', consentPurpose: 'Pilot participation' }
//   Response 201: { consentId, consentType, createdAt }

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import styles from './ConsentPage.module.css';

const POLICY_VERSION = '1.0';

export default function ConsentPage() {
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();
  const api = createApiClient(getAccessTokenSilently);

  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAccept() {
    if (!ageConfirmed) return;
    setError('');
    setLoading(true);

    try {
      await api.post('/pilot/consent', {
        consentType: 'member_activation',
        policyVersion: POLICY_VERSION,
        consentPurpose: 'Pilot participation',
        metadata: { ageConfirmed: true },
      });
      navigate('/spaces/new', { replace: true });
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>

        {/* Header */}
        <div className={styles.header}>
          <p className={styles.brand}>Anamoria</p>
          <h1 className={styles.title}>Before we begin</h1>
          <p className={styles.subtitle}>
            Please take a moment to understand how Anamoria works and how we
            protect your memories.
          </p>
        </div>

        {/* Policy summary */}
        <div className={styles.policy}>

          <div className={styles.policySection}>
            <h2 className={styles.policySectionTitle}>What Anamoria collects</h2>
            <p className={styles.policySectionText}>
              Voice recordings, written memories, and photos you choose to share.
              Your name and email address for your account. Basic usage information
              to improve the experience.
            </p>
          </div>

          <div className={styles.policySection}>
            <h2 className={styles.policySectionTitle}>How we protect your data</h2>
            <p className={styles.policySectionText}>
              All recordings and memories are encrypted in transit and at rest.
              Access is restricted to you and anyone you explicitly invite as a
              contributor. Anamoria staff cannot access your memory content.
            </p>
          </div>

          <div className={styles.policySection}>
            <h2 className={styles.policySectionTitle}>Your rights</h2>
            <p className={styles.policySectionText}>
              You can export all your data at any time. You can delete your account
              and all associated memories permanently. You can withdraw consent and
              we will remove your data within 30 days.
            </p>
          </div>

          <div className={styles.policySection}>
            <h2 className={styles.policySectionTitle}>Pilot program</h2>
            <p className={styles.policySectionText}>
              You are participating in an early pilot. Features may change. We may
              contact you for feedback. Participation is voluntary and you may
              stop at any time.
            </p>
          </div>

        </div>

        {/* Age confirmation checkbox */}
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={ageConfirmed}
            onChange={(e) => {
              setAgeConfirmed(e.target.checked);
              if (error) setError('');
            }}
          />
          <span className={styles.checkboxText}>
            I confirm that I am 18 years of age or older.
          </span>
        </label>

        {error && (
          <p className={styles.error} role="alert">{error}</p>
        )}

        {/* Accept button */}
        <button
          className={styles.btn}
          onClick={handleAccept}
          disabled={!ageConfirmed || loading}
        >
          {loading ? (
            <span className={styles.btnSpinner} aria-label="Saving..." />
          ) : (
            'I agree — continue'
          )}
        </button>

        <p className={styles.footer}>
          By continuing you agree to Anamoria&apos;s Privacy Policy (v{POLICY_VERSION}).
          This is a pilot program — please contact us with any questions.
        </p>

      </div>
    </div>
  );
}
