// components/MemoryFeed.jsx — Anamoria SPA
// v2.0 — Space screen overhaul (April 1, 2026)
//
// Features:
//   - Macy.js masonry layout (CDN loaded, CSS columns fallback)
//   - Private / Shared tabs (client-side filter on isPrivate)
//   - Photo cards with CloudFront signed URL fetch
//   - Voice cards (warm amber theme)
//   - Text cards (white, amber "TEXT" label)
//   - Favorite toggle + edit icon overlays on all card types
//   - Card click → memory detail navigation

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import VoiceCard from './VoiceCard';
import styles from './MemoryFeed.module.css';

/* ═══════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════ */

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
  } catch {
    return '';
  }
}

/* ─── Inline SVGs (from LWC axr_MediaCard.html) ─── */

function HeartIcon({ filled }) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="#e76869">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function PrivacyIcon({ isPrivate }) {
  if (isPrivate) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="1.5" strokeLinecap="round">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

/* ═══════════════════════════════════════
   MACY.JS DYNAMIC LOADER
   ═══════════════════════════════════════ */

let macyPromise = null;

function loadMacy() {
  if (macyPromise) return macyPromise;
  macyPromise = new Promise((resolve, reject) => {
    if (window.Macy) {
      resolve(window.Macy);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/macy@2/dist/macy.js';
    script.async = true;
    script.onload = () => resolve(window.Macy);
    script.onerror = () => {
      macyPromise = null; // allow retry
      reject(new Error('Failed to load Macy.js'));
    };
    document.head.appendChild(script);
  });
  return macyPromise;
}

/* ═══════════════════════════════════════
   MEMORY FEED COMPONENT
   ═══════════════════════════════════════ */

export default function MemoryFeed({ spaceId, getApi, onMemoryCount }) {
  const navigate = useNavigate();
  const masonryRef = useRef(null);
  const macyInstanceRef = useRef(null);

  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('private'); // 'private' | 'shared'
  const [photoUrls, setPhotoUrls] = useState({}); // s3Key → url
  const [macyReady, setMacyReady] = useState(false);

  /* ─── Fetch memories ─── */

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const api = getApi();
        const data = await api.get(`/spaces/${spaceId}/memories?limit=100&offset=0`);
        if (cancelled) return;
        const mems = data.memories || [];
        setMemories(mems);
        if (onMemoryCount) onMemoryCount(mems.length);
      } catch (err) {
        if (!cancelled) setError('Could not load memories.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [spaceId, getApi, onMemoryCount]);

  /* ─── Fetch photo CloudFront URLs ─── */
  // Use a ref to track which keys have been fetched or are in-flight.
  // This survives React 18 StrictMode double-mount and prevents
  // duplicate API calls that would generate new signed URLs and
  // cause the browser to abort in-flight image loads.
  const fetchedKeysRef = useRef(new Set());

  useEffect(() => {
    if (memories.length === 0) return;
    const photoMems = memories.filter(
      (m) => (m.category || '').toLowerCase() === 'photo' && m.s3Key
        && !fetchedKeysRef.current.has(m.s3Key)
    );
    if (photoMems.length === 0) return;

    // Mark as in-flight immediately
    photoMems.forEach((m) => fetchedKeysRef.current.add(m.s3Key));

    let cancelled = false;

    async function fetchPhotoUrls() {
      const api = getApi();
      const results = {};

      // Fetch in parallel (max 6 concurrent)
      const chunks = [];
      for (let i = 0; i < photoMems.length; i += 6) {
        chunks.push(photoMems.slice(i, i + 6));
      }

      for (const chunk of chunks) {
        if (cancelled) break;
        const promises = chunk.map(async (m) => {
          try {
            const data = await api.get(`/media/playback/${encodeURIComponent(m.s3Key)}`);
            results[m.s3Key] = data.playbackUrl;
          } catch (err) {
            console.error('Photo URL fetch error:', err);
            // Remove from fetched set so retry is possible
            fetchedKeysRef.current.delete(m.s3Key);
          }
        });
        await Promise.all(promises);
      }

      if (!cancelled && Object.keys(results).length > 0) {
        setPhotoUrls((prev) => ({ ...prev, ...results }));
      }
    }

    fetchPhotoUrls();
    return () => { cancelled = true; };
  }, [memories, getApi]);

  /* ─── Initialize Macy.js ─── */

  useEffect(() => {
    let instance = null;
    let cancelled = false;

    loadMacy()
      .then((Macy) => {
        if (cancelled || !masonryRef.current) return;

        instance = Macy({
          container: masonryRef.current,
          trueOrder: false,
          waitForImages: true,
          margin: 16,
          columns: 5,
          breakAt: {
            1279: 4,
            899: 3,
            599: 2,
          },
        });

        macyInstanceRef.current = instance;

        // Listen for image load events
        if (instance.on) {
          instance.on(instance.constants.EVENT_IMAGE_COMPLETE, () => {
            instance.recalculate(true, true);
          });
        }

        if (!cancelled) setMacyReady(true);
      })
      .catch(() => {
        // Macy failed — CSS columns fallback is already in place
        if (!cancelled) setMacyReady(false);
      });

    return () => {
      cancelled = true;
      if (instance) {
        try { instance.remove(); } catch { /* ignore */ }
      }
      macyInstanceRef.current = null;
    };
  }, []);

  /* ─── Recalculate Macy when data changes ─── */

  useEffect(() => {
    const inst = macyInstanceRef.current;
    if (!inst) return;

    // Allow React to finish rendering, then recalculate
    const raf1 = requestAnimationFrame(() => {
      inst.recalculate(true, true);
      // Second pass after images may have loaded
      const raf2 = requestAnimationFrame(() => {
        inst.recalculate(true, true);
      });
      return () => cancelAnimationFrame(raf2);
    });

    return () => cancelAnimationFrame(raf1);
  }, [memories, activeTab, photoUrls]);

  /* ─── Recalculate on photo URL load (images change card height) ─── */

  const handleImageLoad = useCallback(() => {
    const inst = macyInstanceRef.current;
    if (inst) {
      requestAnimationFrame(() => inst.recalculate(true, true));
    }
  }, []);

  /* ─── Filter by tab ─── */

  const filteredMemories = memories.filter((m) => {
    if (activeTab === 'private') return m.isPrivate;
    return !m.isPrivate; // shared
  });

  /* ─── Navigation ─── */

  const handleCardClick = useCallback((memory) => {
    navigate(`/spaces/${spaceId}/memories/${memory.id}`, {
      state: { memory },
    });
  }, [navigate, spaceId]);

  const handleEdit = useCallback((memory) => {
    navigate(`/spaces/${spaceId}/memories/${memory.id}`, {
      state: { memory, editing: true },
    });
  }, [navigate, spaceId]);

  /* ─── Favorite toggle (optimistic update) ─── */
  // Endpoint confirmed: POST /memories/{id}/favorite (toggles is_favorite)

  const handleFavorite = useCallback(async (memory) => {
    const newVal = !memory.isFavorite;

    // Optimistic update
    setMemories((prev) =>
      prev.map((m) => (m.id === memory.id ? { ...m, isFavorite: newVal } : m))
    );

    try {
      const api = getApi();
      const result = await api.post(`/memories/${memory.id}/favorite`);
      // Use server response as source of truth
      if (result && result.isFavorite !== undefined) {
        setMemories((prev) =>
          prev.map((m) => (m.id === memory.id ? { ...m, isFavorite: result.isFavorite } : m))
        );
      }
    } catch (err) {
      console.error('Favorite toggle failed:', err);
      // Revert on failure
      setMemories((prev) =>
        prev.map((m) => (m.id === memory.id ? { ...m, isFavorite: !newVal } : m))
      );
    }
  }, [getApi]);

  /* ─── Render states ─── */

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className="app-loading-spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.feedContainer}>

      {/* ─── Private / Shared Tabs ─── */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'private' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('private')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Private
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'shared' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('shared')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Shared with Family
        </button>
      </div>

      {/* ─── Empty state ─── */}
      {filteredMemories.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            {activeTab === 'private' ? '🔒' : '👨‍👩‍👧‍👦'}
          </span>
          <p className={styles.emptyTitle}>
            {activeTab === 'private' ? 'No private memories yet' : 'No shared memories yet'}
          </p>
          <p className={styles.emptyText}>
            {activeTab === 'private'
              ? 'Memories you record are private by default. They\u2019ll appear here.'
              : 'When you mark memories as shared, they\u2019ll be visible to family members.'}
          </p>
        </div>
      )}

      {/* ─── Masonry Grid ─── */}
      {filteredMemories.length > 0 && (
        <div
          ref={masonryRef}
          className={`${styles.masonry} ${!macyReady ? styles.masonryFallback : ''}`}
        >
          {filteredMemories.map((memory) => {
            const category = (memory.category || '').toLowerCase();

            /* ── Voice card ── */
            if (category === 'voice') {
              return (
                <div key={memory.id} className={styles.masonryItem}>
                  <VoiceCard
                    memory={memory}
                    getApi={getApi}
                    onFavorite={handleFavorite}
                    onEdit={handleEdit}
                    onClick={handleCardClick}
                  />
                </div>
              );
            }

            /* ── Photo card ── */
            if (category === 'photo') {
              const photoUrl = photoUrls[memory.s3Key];
              return (
                <div key={memory.id} className={`${styles.masonryItem} ${styles.photoItem}`}>
                  <div
                    className={styles.photoCard}
                    onClick={() => handleCardClick(memory)}
                    role="button"
                    tabIndex={0}
                  >
                    {/* Image area */}
                    <div className={styles.photoImageWrap}>
                      {photoUrl ? (
                        <img
                          className={styles.photoImage}
                          src={photoUrl}
                          alt={memory.title || 'Photo'}
                          onLoad={handleImageLoad}
                        />
                      ) : (
                        <div className={styles.photoSkeleton}>
                          <div className={styles.photoSkeletonShimmer} />
                        </div>
                      )}

                      {/* Hover overlay: favorite + edit */}
                      <div className={`${styles.cardOverlay} ${memory.isFavorite ? styles.cardOverlayLiked : ''}`}>
                        <button
                          className={`${styles.cardOverlayBtn} ${memory.isFavorite ? styles.cardOverlayBtnLiked : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleFavorite(memory); }}
                          aria-label={memory.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <HeartIcon filled={memory.isFavorite} />
                        </button>
                        <button
                          className={`${styles.cardOverlayBtn} ${styles.cardOverlayEdit} ${memory.isFavorite ? styles.cardOverlayEditWhenLiked : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleEdit(memory); }}
                          aria-label="Edit memory"
                        >
                          <EditIcon />
                        </button>
                      </div>
                    </div>

                    {/* Content below image */}
                    <div className={styles.photoContent}>
                      {memory.title && (
                        <p className={styles.photoTitle}>{memory.title}</p>
                      )}
                      {!memory.title && <p className={styles.photoLabel}>Photo</p>}
                    </div>

                    {/* Footer */}
                    <div className={`${styles.cardFooter} ${styles.photoCardFooter}`}>
                      <span className={styles.cardDate}>{formatDate(memory.createdAt)}</span>
                      <span className={styles.cardPrivacy}>
                        <PrivacyIcon isPrivate={memory.isPrivate} />
                      </span>
                    </div>
                  </div>
                </div>
              );
            }

            /* ── Text card ── */
            return (
              <div key={memory.id} className={styles.masonryItem}>
                <div
                  className={styles.textCard}
                  onClick={() => handleCardClick(memory)}
                  role="button"
                  tabIndex={0}
                >
                  {/* Hover overlay */}
                  <div className={`${styles.cardOverlay} ${memory.isFavorite ? styles.cardOverlayLiked : ''}`}>
                    <button
                      className={`${styles.cardOverlayBtn} ${memory.isFavorite ? styles.cardOverlayBtnLiked : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleFavorite(memory); }}
                      aria-label={memory.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <HeartIcon filled={memory.isFavorite} />
                    </button>
                    <button
                      className={`${styles.cardOverlayBtn} ${styles.cardOverlayEdit} ${memory.isFavorite ? styles.cardOverlayEditWhenLiked : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleEdit(memory); }}
                      aria-label="Edit memory"
                    >
                      <EditIcon />
                    </button>
                  </div>

                  {/* TEXT label — warm amber */}
                  <p className={styles.textLabel}>TEXT</p>

                  {/* Content */}
                  <div className={styles.textContent}>
                    {memory.title && (
                      <p className={styles.textTitle}>{memory.title}</p>
                    )}
                    {memory.note && (
                      <p className={styles.textNote}>{memory.note}</p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className={styles.cardFooter}>
                    <span className={styles.cardDate}>{formatDate(memory.createdAt)}</span>
                    <span className={styles.cardPrivacy}>
                      <PrivacyIcon isPrivate={memory.isPrivate} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
