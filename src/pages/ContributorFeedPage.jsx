// ContributorFeedPage.jsx — /contribute/:spaceId
// Session token auth (from sessionStorage, not Auth0)
// Shows shared memories, contributor can record voice / write text
// APIs: GET /contribute/:spaceId, GET /contribute/:spaceId/memories
// Session token sent via x-session-token header

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import config from '../config';
import styles from './ContributorFeedPage.module.css';

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

// Session-token fetch (no JWT)
function sessionFetch(path, sessionToken, options = {}) {
  const url = `${config.apiUrl}${path}`;
  return fetch(url, {
    ...options,
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'x-session-token': sessionToken,
      ...(options.headers || {}),
    },
  }).then(async (res) => {
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : {};
    if (!res.ok) throw { error: data.error || 'REQUEST_FAILED', status: res.status };
    return data;
  });
}

export default function ContributorFeedPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();

  const sessionToken = sessionStorage.getItem('ana_sessionToken');
  const contributorName = sessionStorage.getItem('ana_contributorName');

  const [space, setSpace] = useState(null);
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── Validate session ───
  useEffect(() => {
    if (!sessionToken) {
      setError('Your session has expired. Please use your invite link again.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const [spaceData, feedData] = await Promise.all([
          sessionFetch(`/contribute/${spaceId}`, sessionToken),
          sessionFetch(`/contribute/${spaceId}/memories?limit=100&offset=0`, sessionToken),
        ]);
        if (cancelled) return;
        setSpace(spaceData);
        setMemories(feedData.memories || []);
      } catch (err) {
        if (err.error === 'INVALID_SESSION') {
          setError('Your session has expired. Please use your invite link again.');
        } else {
          setError('Could not load this space.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId, sessionToken]);

  const handleRefresh = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const feedData = await sessionFetch(`/contribute/${spaceId}/memories?limit=100&offset=0`, sessionToken);
      setMemories(feedData.memories || []);
    } catch (_) { /* silent */ }
  }, [spaceId, sessionToken]);

  if (loading) {
    return <div className={styles.loading}><div className={styles.loadingDot} /><span>Loading...</span></div>;
  }

  if (error) {
    return (
      <div className={styles.errorScreen}>
        <span className={styles.logo}>Anamoria</span>
        <p className={styles.errorText}>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.logo}>ANAMORIA</span>
          <div className={styles.headerInfo}>
            <span className={styles.headerName}>{space?.name}</span>
            <span className={styles.headerSub}>Welcome, {contributorName || space?.contributorName}</span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className={styles.ctaSection}>
        <p className={styles.ctaText}>Share a memory of {space?.name}</p>
        <div className={styles.ctaButtons}>
          <button className={styles.ctaBtn} onClick={() => {/* TODO: contributor record */}}>
            🎙 Record
          </button>
          <button className={styles.ctaBtn} onClick={() => {/* TODO: contributor write */}}>
            ✏️ Write
          </button>
        </div>
        <p className={styles.ctaNote}>Your memories will be shared with the family</p>
      </div>

      {/* Feed */}
      <div className={styles.feed}>
        {memories.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No shared memories yet. Be the first to add one.</p>
          </div>
        ) : (
          memories.map((m) => {
            const category = (m.category || '').toLowerCase();
            return (
              <div key={m.id} className={styles.card}>
                <p className={styles.cardCategory}>{(m.category || '').toUpperCase()}</p>
                {m.title && <p className={styles.cardTitle}>{m.title}</p>}
                {category === 'text' && m.note && <p className={styles.cardNote}>{m.note}</p>}
                {category === 'voice' && m.duration_seconds && (
                  <span className={styles.cardDuration}>🎙 {Math.floor(m.duration_seconds / 60)}:{(m.duration_seconds % 60).toString().padStart(2, '0')}</span>
                )}
                <div className={styles.cardFooter}>
                  <span className={styles.cardDate}>{formatDate(m.created_at)}</span>
                  <span className={styles.cardCreator}>
                    {m.creator_type === 'contributor' ? (m.creator_name || 'Contributor') : 'Family'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
