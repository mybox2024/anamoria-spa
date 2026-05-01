// pages/ConsentPage.jsx — Anamoria SPA
// Route: /consent (protected — JWT required)
//
// v1.2 — May 1, 2026
//   - Capture POST /pilot/consent response and call appContext.updateConsent
//     with createdAt + policyVersion before navigating. SettingsPage Account
//     panel now reflects the new consent immediately in the same session,
//     no hard refresh required. createdAt is the DB-authoritative value from
//     the Lambda's RETURNING created_at on the INSERT (no client-side
//     timestamp fabrication, no extra HTTP round-trip).
//   - No changes to API payload, age confirmation, navigation target, or copy.
//   - If updateConsent is unavailable for any reason (older App.jsx, race),
//     navigation still proceeds — appState will pick up consent on the next
//     /pilot/me fetch (hard refresh / next session) per the LATERAL JOIN in
//     pilotaccessindex.mjs v1.5+. No-op fallback, not a failure path.
//
// v1.1 — May 1, 2026
//   - Each policy section now renders as <h2> + <ul><li>… for scannability.
//   - Responsive container width (640/780/880/960) — matches WritePage / InvitePage
//     ladder so the form expands with viewport on ultrawide.
//   - No behavior changes: same POST /pilot/consent payload, same age-confirmation
//     state, same navigation on success, same policy version "1.0".
//
// v1.0 — Initial implementation.
//
// Flow:
//   1. Display privacy policy summary
//   2. User checks age confirmation + accepts
//   3. POST /pilot/consent → { consentId, consentType, createdAt }
//   4. Update appState via context (consentDate, consentPolicyVersion)
//   5. Navigate to /spaces/new
//
// API: POST /pilot/consent
//   Request: { consentType: 'member_activation', policyVersion: '1.0', consentPurpose: 'Pilot participation' }
//   Response 201: { consentId, consentType, createdAt }

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import { useAppContext } from '../App';
import styles from './ConsentPage.module.css';

const POLICY_VERSION = '1.0';

export default function ConsentPage() {
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();
  const api = createApiClient(getAccessTokenSilently);

  // v1.2: Pull updateConsent off the app context so we can refresh appState
  // immediately after the POST succeeds. Optional-chained — if running against
  // an older App.jsx that doesn't expose updateConsent, the navigate still
  // works and appState picks up consent on next /pilot/me fetch.
  const { updateConsent } = useAppContext();

  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAccept() {
    if (!ageConfirmed) return;
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/pilot/consent', {
        consentType: 'member_activation',
        policyVersion: POLICY_VERSION,
        consentPurpose: 'Pilot participation',
        metadata: { ageConfirmed: true },
      });

      // v1.2: Push DB-authoritative consent into appState before navigating.
      // response.createdAt comes from RETURNING created_at on the Lambda's
      // INSERT — same value the next GET /pilot/me LATERAL JOIN would return.
      // policyVersion is the value we just submitted (echoed back is unchanged).
      if (typeof updateConsent === 'function' && response?.createdAt) {
        updateConsent({
          consentDate: response.createdAt,
          consentPolicyVersion: POLICY_VERSION,
        });
      }

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
            <ul className={styles.policyList}>
              <li>Voice recordings, written memories, and photos you choose to share.</li>
              <li>Your name and email address for your account.</li>
              <li>Basic usage information to improve the experience.</li>
            </ul>
          </div>

          <div className={styles.policySection}>
            <h2 className={styles.policySectionTitle}>How we protect your data</h2>
            <ul className={styles.policyList}>
              <li>All recordings and memories are encrypted in transit and at rest.</li>
              <li>Access is restricted to you and anyone you explicitly invite as a contributor.</li>
              <li>Anamoria staff cannot access your memory content.</li>
            </ul>
          </div>

          <div className={styles.policySection}>
            <h2 className={styles.policySectionTitle}>Your rights</h2>
            <ul className={styles.policyList}>
              <li>You can export all your data at any time.</li>
              <li>You can delete your account and all associated memories permanently.</li>
              <li>You can withdraw consent and we will remove your data within 30 days.</li>
            </ul>
          </div>

          <div className={styles.policySection}>
            <h2 className={styles.policySectionTitle}>Pilot program</h2>
            <ul className={styles.policyList}>
              <li>You are participating in an early pilot.</li>
              <li>Features may change.</li>
              <li>We may contact you for feedback.</li>
              <li>Participation is voluntary and you may stop at any time.</li>
            </ul>
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
