// pages/CreateSpacePage.jsx — Anamoria SPA
// Route: /spaces/new (protected — JWT required)
//
// Flow:
//   1. "Who is this space for?" — name required, dates optional
//   2. POST /spaces → { id, name, voiceCardTheme, defaultAlbumId, ... }
//   3. Navigate to /spaces/:id

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import styles from './CreateSpacePage.module.css';

export default function CreateSpacePage() {
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();
  const api = createApiClient(getAccessTokenSilently);

  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [dateOfLoss, setDateOfLoss] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setError('');
    setLoading(true);

    try {
      const body = { name: trimmedName };
      if (birthdate) body.birthdate = birthdate;
      if (dateOfLoss) body.dateOfLoss = dateOfLoss;

      const data = await api.post('/spaces', body);
      navigate(`/spaces/${data.id}`, { replace: true });
    } catch (err) {
      setError('Something went wrong creating the space. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>

        <div className={styles.header}>
          <p className={styles.brand}>Anamoria</p>
          <h1 className={styles.title}>Create a memory space</h1>
          <p className={styles.subtitle}>
            A space holds all the voice notes and memories for one person.
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>

          <div className={styles.fieldGroup}>
            <label htmlFor="space-name" className={styles.label}>
              Who is this space for? <span className={styles.required}>*</span>
            </label>
            <input
              id="space-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Grandma Rose"
              className={styles.input}
              maxLength={100}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className={styles.optionalSection}>
            <p className={styles.optionalLabel}>Optional — helps personalize prompts</p>

            <div className={styles.fieldGroup}>
              <label htmlFor="birthdate" className={styles.label}>
                Date of birth
              </label>
              <input
                id="birthdate"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                className={styles.input}
                disabled={loading}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="date-of-loss" className={styles.label}>
                Date of passing
              </label>
              <input
                id="date-of-loss"
                type="date"
                value={dateOfLoss}
                onChange={(e) => setDateOfLoss(e.target.value)}
                className={styles.input}
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <p className={styles.error} role="alert">{error}</p>
          )}

          <button
            type="submit"
            className={styles.btn}
            disabled={loading || name.trim().length === 0}
          >
            {loading ? (
              <span className={styles.btnSpinner} aria-label="Creating space..." />
            ) : (
              'Create space'
            )}
          </button>

        </form>
      </div>
    </div>
  );
}
