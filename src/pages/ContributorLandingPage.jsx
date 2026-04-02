// ContributorLandingPage.jsx — /invite/:token
// No auth required. Validates invite token, shows space name + contributor name.
// On claim: receives session token, stores in sessionStorage, redirects to /contribute/:spaceId
// APIs: GET /invite/:token (public via API key), POST /invite/:token/claim (public via API key)

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import config from '../config';
import styles from './ContributorLandingPage.module.css';

// Direct fetch for public routes (no JWT, uses API key)
async function publicFetch(path, options = {}) {
  const url = `${config.apiUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    mode: 'cors',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, ...(options.headers || {}) },
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : {};
  if (!res.ok) throw { error: data.error || 'REQUEST_FAILED', status: res.status };
  return data;
}

export default function ContributorLandingPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState(null);

  // Validate token on mount
  useEffect(() => {
    let cancelled = false;
    async function validate() {
      try {
        const data = await publicFetch(`/invite/${token}`, { method: 'GET' });
        if (!cancelled) setInvite(data);
      } catch (err) {
        if (err.error === 'INVALID_TOKEN') {
          setError('This invite link is not valid.');
        } else if (err.error === 'TOKEN_ALREADY_CLAIMED') {
          setError('This invite has already been used.');
        } else {
          setError('Something went wrong. Please try the link again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    validate();
    return () => { cancelled = true; };
  }, [token]);

  const handleClaim = useCallback(async () => {
    if (claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const data = await publicFetch(`/invite/${token}/claim`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      // Store session token for contributor auth
      sessionStorage.setItem('ana_sessionToken', data.sessionToken);
      sessionStorage.setItem('ana_contributorName', data.contributorName);
      sessionStorage.setItem('ana_spaceId', data.spaceId);
      sessionStorage.setItem('ana_spaceName', data.spaceName);
      // Navigate to contributor feed
      navigate(`/contribute/${data.spaceId}`, { replace: true });
    } catch (err) {
      if (err.error === 'TOKEN_ALREADY_CLAIMED') {
        setError('This invite has already been used.');
      } else {
        setError("Couldn't claim invite. Please try again.");
      }
      setClaiming(false);
    }
  }, [token, claiming, navigate]);

  if (loading) {
    return <div className={styles.loading}><div className={styles.loadingDot} /><span>Loading invite...</span></div>;
  }

  if (error && !invite) {
    return (
      <div className={styles.screen}>
        <div className={styles.card}>
          <span className={styles.logo}>Anamoria</span>
          <div className={styles.errorIcon}>⚠️</div>
          <p className={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <span className={styles.logo}>Anamoria</span>
        <h1 className={styles.title}>You've been invited</h1>
        <p className={styles.subtitle}>
          to add a memory to <strong>{invite?.spaceName}</strong>'s space
        </p>

        <div className={styles.welcomeBox}>
          <p className={styles.welcomeName}>Hi {invite?.contributorName},</p>
          <p className={styles.welcomeText}>
            Someone special wants to hear from you. Share a voice note, write a memory, or add a photo — whatever feels right.
          </p>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <button
          className={styles.btnPrimary}
          onClick={handleClaim}
          disabled={claiming}
        >
          {claiming ? 'Getting ready...' : 'Start adding memories'}
        </button>

        <div className={styles.privacyNote}>
          <span>🔒</span>
          <span>This is a private space. Only invited people can see what's shared here.</span>
        </div>
      </div>
    </div>
  );
}
