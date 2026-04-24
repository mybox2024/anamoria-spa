// components/MemoryFeed.jsx — Anamoria SPA
// v2.9 — Tabs sticky at top:0, prompt outside scroll container (April 24, 2026)
//
// Changes from v2.8:
//   - No logic changes. Version bump to match MemoryFeed.module.css v2.4.
//   - With v2.4 architecture, the prompt section is above <main>, so
//     tabs stick at top:0 with nothing above them in the scroll container.
//
// v2.8 — Sticky tabs + feedPad wrapper (April 24, 2026)
//
// Changes from v2.7:
//   - Wrapped empty state and masonry grid in .feedPad div for side padding.
//     SpacePage .main no longer has padding (removed for full-width sticky prompt).
//   - Tabs now sticky via CSS (position: sticky in MemoryFeed.module.css v2.3).
//   - No logic changes. All rendering, caching, Macy, and interactions unchanged.
//
// v2.7 — D-5: Image dimensions for CLS fix (April 22, 2026)
//
// v2.6 — D-4: AbortController + fetchpriority + client-side cache (April 22, 2026)
//   - 6A: AbortController cleanup in memories fetch useEffect
//   - 5:  fetchpriority="high" on first photo, loading="lazy" on rest
//   - 6B: Module-level memories cache with 50-min TTL + exported invalidateMemoriesCache()
//
// v2.5 — BlurHash placeholders for photo cards (April 22, 2026)
//   - BlurHash canvas placeholder, onError fallback to original
//
// v2.3 — Inline signed URLs from memories response (April 22, 2026)
//
// v2.2 — Voice card theme passthrough (April 21, 2026)
//   - Accepts voiceCardTheme prop and forwards to VoiceCard as theme prop
//
// v2.1 — Voice edit routes to RecordPage (April 3, 2026)
//   - handleEdit: voice memories route to /spaces/:id/record with editMode state
//   - handleCardClick: voice cards route to RecordPage in edit mode
//
// Features (unchanged):
//   - Macy.js masonry layout (CDN loaded, CSS columns fallback)
//   - Private / Shared tabs (client-side filter on isPrivate)
//   - Photo cards with CloudFront signed URL from API response
//   - Voice cards (4 themes: warm, story, sage, clean)
//   - Text cards (white, amber "TEXT" label)
//   - Favorite toggle + edit icon overlays on all card types

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { decode } from 'blurhash';
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
   BLURHASH CANVAS PLACEHOLDER (D-3)
   ═══════════════════════════════════════ */

function BlurHashCanvas({ hash, width = 269, height = 180 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !hash) return;
    try {
      const pixels = decode(hash, width, height);
      const ctx = canvasRef.current.getContext('2d');
      const imageData = ctx.createImageData(width, height);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch (err) {
      console.warn('BlurHash decode failed:', err);
    }
  }, [hash, width, height]);
  return <canvas ref={canvasRef} width={width} height={height} className={styles.blurCanvas} />;
}

/* ═══════════════════════════════════════
   MEMORIES CACHE (D-4, Strategy 6B)
   Module-level cache with 50-minute TTL.
   Persists across navigations within the SPA.
   ═══════════════════════════════════════ */

const memoriesCache = new Map();
const CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes (below 60-min signed URL expiry)

function getCachedMemories(spaceId) {
  const entry = memoriesCache.get(spaceId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    memoriesCache.delete(spaceId);
    return null;
  }
  return entry.data;
}

function setCachedMemories(spaceId, data) {
  memoriesCache.set(spaceId, { data, timestamp: Date.now() });
}

/**
 * Invalidate the memories cache for a given space.
 * Call this after creating, editing, or deleting a memory so the next
 * navigation to the feed fetches fresh data.
 */
export function invalidateMemoriesCache(spaceId) {
  if (spaceId) {
    memoriesCache.delete(spaceId);
  } else {
    memoriesCache.clear();
  }
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

export default function MemoryFeed({ spaceId, getApi, onMemoryCount, voiceCardTheme }) {
  const navigate = useNavigate();
  const masonryRef = useRef(null);
  const macyInstanceRef = useRef(null);

  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('private'); // 'private' | 'shared'
  const [macyReady, setMacyReady] = useState(false);

  /* ─── Fetch memories (D-4: AbortController + cache) ─── */

  useEffect(() => {
    const controller = new AbortController();

    // 6B: Check cache first — instant render on return visits
    const cached = getCachedMemories(spaceId);
    if (cached) {
      setMemories(cached);
      if (onMemoryCount) onMemoryCount(cached.length);
      setLoading(false);
      return () => controller.abort();
    }

    async function load() {
      setLoading(true);
      try {
        const api = getApi();
        const data = await api.get(
          `/spaces/${spaceId}/memories?limit=100&offset=0`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        const mems = data.memories || [];
        setMemories(mems);
        setCachedMemories(spaceId, mems); // Cache for return visits
        if (onMemoryCount) onMemoryCount(mems.length);
      } catch (err) {
        if (err.name === 'AbortError') return; // Expected during cleanup
        if (!controller.signal.aborted) setError('Could not load memories.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [spaceId, getApi, onMemoryCount]);

  // v2.3: Photo URL fetch loop removed — playbackUrl now comes from memories API response

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

        if (instance.on) {
          instance.on(instance.constants.EVENT_IMAGE_COMPLETE, () => {
            instance.recalculate(true, true);
          });
        }

        if (!cancelled) setMacyReady(true);
      })
      .catch(() => {
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
  // v2.3: Removed photoUrls from dependency array (no longer exists)

  useEffect(() => {
    const inst = macyInstanceRef.current;
    if (!inst) return;

    const raf1 = requestAnimationFrame(() => {
      inst.recalculate(true, true);
      const raf2 = requestAnimationFrame(() => {
        inst.recalculate(true, true);
      });
      return () => cancelAnimationFrame(raf2);
    });

    return () => cancelAnimationFrame(raf1);
  }, [memories, activeTab]);

  /* ─── Recalculate on photo image load ─── */

  const handleImageLoad = useCallback(() => {
    const inst = macyInstanceRef.current;
    if (inst) {
      requestAnimationFrame(() => inst.recalculate(true, true));
    }
  }, []);

  /* ─── Filter by tab ─── */

  const filteredMemories = memories.filter((m) => {
    if (activeTab === 'private') return m.isPrivate;
    return !m.isPrivate;
  });

  /* ─── Navigation ─── */

  // v2.1: Voice cards go to RecordPage in edit mode; text/photo go to MemoryDetailPage
  const handleCardClick = useCallback((memory) => {
    const category = (memory.category || '').toLowerCase();
    if (category === 'voice') {
      navigate(`/spaces/${spaceId}/record`, {
        state: { editMode: true, editMemory: memory },
      });
    } else {
      navigate(`/spaces/${spaceId}/memories/${memory.id}`, {
        state: { memory },
      });
    }
  }, [navigate, spaceId]);

  // v2.1: Voice edit → RecordPage; text/photo edit → MemoryDetailPage
  const handleEdit = useCallback((memory) => {
    const category = (memory.category || '').toLowerCase();
    if (category === 'voice') {
      navigate(`/spaces/${spaceId}/record`, {
        state: { editMode: true, editMemory: memory },
      });
    } else {
      navigate(`/spaces/${spaceId}/memories/${memory.id}`, {
        state: { memory, editing: true },
      });
    }
  }, [navigate, spaceId]);

  /* ─── Favorite toggle (optimistic update) ─── */

  const handleFavorite = useCallback(async (memory) => {
    const newVal = !memory.isFavorite;

    setMemories((prev) =>
      prev.map((m) => (m.id === memory.id ? { ...m, isFavorite: newVal } : m))
    );

    try {
      const api = getApi();
      const result = await api.post(`/memories/${memory.id}/favorite`);
      if (result && result.isFavorite !== undefined) {
        setMemories((prev) =>
          prev.map((m) => (m.id === memory.id ? { ...m, isFavorite: result.isFavorite } : m))
        );
      }
    } catch (err) {
      console.error('Favorite toggle failed:', err);
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

      {/* v2.8: feedPad wraps content below sticky tabs — provides side padding
          since SpacePage .main no longer has padding (removed for full-width sticky prompt) */}
      <div className={styles.feedPad}>

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
      {filteredMemories.length > 0 && (() => {
        let photoIndex = 0; // v2.6: tracks photo position for fetchpriority
        return (
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
                    theme={voiceCardTheme || 'warm'}
                    onFavorite={handleFavorite}
                    onEdit={handleEdit}
                    onClick={handleCardClick}
                  />
                </div>
              );
            }

            /* ── Photo card ── */
            if (category === 'photo') {
              // v2.6: fetchpriority + lazy loading + BlurHash + onError fallback
              const photoUrl = memory.playbackUrl;
              const fallbackUrl = memory.originalPlaybackUrl;
              const isFirstPhoto = photoIndex === 0;
              photoIndex++;

              // v2.7 (D-5): Compute aspect-ratio style from image dimensions
              const photoAspectStyle = memory.imageWidth && memory.imageHeight
                ? { aspectRatio: `${memory.imageWidth} / ${memory.imageHeight}` }
                : { aspectRatio: '4 / 3' };

              // v2.7 (D-5): BlurHash canvas dimensions matched to actual image ratio
              const blurWidth = 269;
              const blurHeight = (memory.imageWidth && memory.imageHeight)
                ? Math.round(blurWidth * memory.imageHeight / memory.imageWidth)
                : 180;

              return (
                <div key={memory.id} className={`${styles.masonryItem} ${styles.photoItem}`}>
                  <div
                    className={styles.photoCard}
                    onClick={() => handleCardClick(memory)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className={styles.photoImageWrap} style={photoAspectStyle}>
                      {photoUrl ? (
                        <img
                          className={styles.photoImage}
                          src={photoUrl}
                          alt={memory.title || 'Photo'}
                          fetchpriority={isFirstPhoto ? 'high' : undefined}
                          loading={isFirstPhoto ? 'eager' : 'lazy'}
                          onLoad={handleImageLoad}
                          onError={(e) => {
                            // D-2 fallback: feed variant not ready, use original
                            if (fallbackUrl && e.target.src !== fallbackUrl) {
                              e.target.src = fallbackUrl;
                            }
                          }}
                        />
                      ) : memory.blurHash ? (
                        <BlurHashCanvas hash={memory.blurHash} width={blurWidth} height={blurHeight} />
                      ) : (
                        <div className={styles.photoSkeleton}>
                          <div className={styles.photoSkeletonShimmer} />
                        </div>
                      )}

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

                    <div className={styles.photoContent}>
                      {memory.title && (
                        <p className={styles.photoTitle}>{memory.title}</p>
                      )}
                      {!memory.title && <p className={styles.photoLabel}>Photo</p>}
                    </div>

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

                  <p className={styles.textLabel}>TEXT</p>

                  <div className={styles.textContent}>
                    {memory.title && (
                      <p className={styles.textTitle}>{memory.title}</p>
                    )}
                    {memory.note && (
                      <p className={styles.textNote}>{memory.note}</p>
                    )}
                  </div>

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
        );
      })()}

      </div>{/* end feedPad */}
    </div>
  );
}
