// pages/SpacePage.jsx — Anamoria SPA
// Route: /spaces/:spaceId (protected — JWT required)

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import PromptCard from '../components/PromptCard';
import BottomNav from '../components/BottomNav';
import MemoryFeed from '../components/MemoryFeed';
import styles from './SpacePage.module.css';

export default function SpacePage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();

  // Stable getApi function for child components (VoiceCard playback)
  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  const [space, setSpace] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const api = getApi();
        const [spaceData, promptData] = await Promise.all([
          api.get(`/spaces/${spaceId}`),
          api.get(`/spaces/${spaceId}/prompt`).catch(() => null),
        ]);
        setSpace(spaceData);
        setPrompt(promptData);
      } catch (err) {
        console.error('SpacePage load error:', err);
        setError('Could not load this space.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [spaceId, getApi]);

  function handleRecord() {
    navigate(`/spaces/${spaceId}/record`, {
      state: { promptId: prompt?.promptId || null },
    });
  }

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <div className="app-loading-spinner" />
      </div>
    );
  }

  if (error || !space) {
    return (
      <div className="app-error">
        <h2>Something went wrong</h2>
        <p>{error || 'Space not found.'}</p>
        <button className="app-error-btn" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  const voiceTheme = space.voiceCardTheme || 'warm';

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <p className={styles.brand}>Anamoria</p>
        <h1 className={styles.spaceName}>{space.name}</h1>
      </header>

      <main className={styles.main}>

        {/* Prompt card or standalone CTA */}
        {prompt ? (
          <PromptCard
            prompt={prompt}
            spaceName={space.name}
            onRecord={handleRecord}
          />
        ) : (
          <div className={styles.noPromptCta}>
            <button className={styles.recordBtn} onClick={handleRecord}>
              <span className={styles.recordBtnIcon}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" strokeLinecap="round" strokeLinejoin="round">
                  <path className={styles.recordBtnFill} d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                  <path d="M18 10.5v.5a6 6 0 0 1-12 0v-.5" strokeWidth="1.5"/>
                  <path d="M12 17v4" strokeWidth="1.5"/>
                </svg>
              </span>
              Record a voice note
            </button>
          </div>
        )}

        {/* Memory feed */}
        <MemoryFeed
          spaceId={spaceId}
          theme={voiceTheme}
          getApi={getApi}
        />

      </main>

      <BottomNav spaceId={spaceId} activeTab="record" />

    </div>
  );
}
