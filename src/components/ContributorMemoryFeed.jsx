// components/ContributorMemoryFeed.jsx — Anamoria SPA
// v1.0 — Session 3 (April 19, 2026)
//
// Contributor-side masonry feed. Parallel implementation to MemoryFeed.jsx v2.1
// per Session 3 Plan v1.1 decisions A3 (new component, reuse MemoryFeed.module.css)
// and V (contributors see each other's memories only).
//
// Reuses MemoryFeed.module.css for all layout and card styling. No new CSS.
//
// Differences from owner MemoryFeed v2.1:
//   - Single view (no Private/Shared tabs) — decision V
//   - No favorite heart overlay
//   - No edit pencil overlay — decision E2 (edit deferred to Session 3.5)
//   - No MemoryDetailPage navigation — contributors have no detail page
//   - No privacy icon in card footer — contributor memories are all non-private
//   - Card footer shows creator attribution "{Name} {M/D/YY}" — decision CN
//   - Voice cards render inline as metadata only (no play button) — decision V
//     Contributors can see voice memories exist but not play them.
//   - Photo cards still fetch signed URLs via /media/playback/:key — PF-10 verified
//     this route accepts contributor session tokens.
//
// Props:
//   spaceId       — space UUID
//   getApi        — factory returning contributor API client (from createContributorApiClient)
//   onMemoryCount — optional callback invoked with memory count after load
//
// Masonry behavior, Macy.js loader, and photo URL fetch pattern all mirror
// MemoryFeed v2.1 exactly — only the card rendering and feature set differ.

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './MemoryFeed.module.css';

/* ═══════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════ */

// Attribution date format per decision CN: short M/D/YY.
// Example: "4/19/26" for April 19, 2026.
function formatShortDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
    });
  } catch {
    return '';
  }
}

// Voice duration MM:SS (matches VoiceCard.formatDuration)
function formatDuration(val) {
  const s = Math.round(Number(val) || 0);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// Waveform bar heights — same 12-bar pattern as owner VoiceCard for visual consistency.
const WAVE_BARS = [8, 14, 10, 18, 12, 20, 8, 16, 14, 10, 18, 6];

/* ═══════════════════════════════════════
   MACY.JS DYNAMIC LOADER
   Duplicated from MemoryFeed.jsx per Cap-1 isolation principle.
   If this loader changes there, update here too (coupling documented).
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
      macyPromise = null;
      reject(new Error('Failed to load Macy.js'));
    };
    document.head.appendChild(script);
  });
  return macyPromise;
}

/* ═══════════════════════════════════════
   CONTRIBUTOR MEMORY FEED COMPONENT
   ═══════════════════════════════════════ */

export default function ContributorMemoryFeed({ spaceId, getApi, onMemoryCount }) {
  const masonryRef = useRef(null);
  const macyInstanceRef = useRef(null);

  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photoUrls, setPhotoUrls] = useState({}); // s3Key → signed URL
  const [macyReady, setMacyReady] = useState(false);

  /* ─── Fetch contributor memories ─── */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const api = getApi();
        const data = await api.get(`/contribute/${spaceId}/memories?limit=100`);
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

  /* ─── Fetch photo signed URLs ───
     Uses existing route GET /media/playback/:key. PF-10 empirically verified
     this route accepts contributor session tokens. See Session 3 Plan v1.1
     Addendum §3.2. */
  const fetchedKeysRef = useRef(new Set());

  useEffect(() => {
    if (memories.length === 0) return;
    const photoMems = memories.filter(
      (m) => (m.category || '').toLowerCase() === 'photo'
        && m.s3Key
        && !fetchedKeysRef.current.has(m.s3Key)
    );
    if (photoMems.length === 0) return;

    photoMems.forEach((m) => fetchedKeysRef.current.add(m.s3Key));

    let cancelled = false;

    async function fetchPhotoUrls() {
      const api = getApi();
      const results = {};

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
  }, [memories, photoUrls]);

  /* ─── Recalculate on photo load ─── */
  const handleImageLoad = useCallback(() => {
    const inst = macyInstanceRef.current;
    if (inst) {
      requestAnimationFrame(() => inst.recalculate(true, true));
    }
  }, []);

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

  // Empty state — no contributor memories yet
  if (memories.length === 0) {
    const spaceName = sessionStorage.getItem('ana_spaceName') || 'this space';
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>💭</span>
        <p className={styles.emptyTitle}>No memories yet</p>
        <p className={styles.emptyText}>
          Be the first to share a memory of {spaceName}.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.feedContainer}>
      <div
        ref={masonryRef}
        className={`${styles.masonry} ${!macyReady ? styles.masonryFallback : ''}`}
      >
        {memories.map((memory) => {
          const category = (memory.category || '').toLowerCase();
          const attribution = memory.creatorName
            ? `${memory.creatorName} ${formatShortDate(memory.createdAt)}`
            : formatShortDate(memory.createdAt);

          /* ── Voice card (metadata only — no play button per decision V) ── */
          if (category === 'voice') {
            const duration = memory.voiceNote?.duration || 0;
            return (
              <div key={memory.id} className={styles.masonryItem}>
                <div className={styles.textCard}>
                  <p className={styles.textLabel}>VOICE</p>
                  <div className={styles.textContent}>
                    {memory.title && (
                      <p className={styles.textTitle}>{memory.title}</p>
                    )}
                    {/* Static waveform + duration — visual indicator only */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginTop: '8px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          flex: 1,
                        }}
                      >
                        {WAVE_BARS.map((h, i) => (
                          <div
                            key={i}
                            style={{
                              width: '2px',
                              height: `${h}px`,
                              background: 'var(--color-sage-dark, #5b7a65)',
                              opacity: 0.3,
                              borderRadius: '1px',
                            }}
                          />
                        ))}
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-text-subtle, #737373)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatDuration(duration)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.cardFooter}>
                    <span className={styles.cardDate}>{attribution}</span>
                  </div>
                </div>
              </div>
            );
          }

          /* ── Photo card ── */
          if (category === 'photo') {
            const photoUrl = photoUrls[memory.s3Key];
            return (
              <div key={memory.id} className={`${styles.masonryItem} ${styles.photoItem}`}>
                <div className={styles.photoCard}>
                  <div className={styles.photoImageWrap}>
                    {photoUrl ? (
                      <img
                        className={styles.photoImage}
                        src={photoUrl}
                        alt={memory.title || 'Photo memory'}
                        onLoad={handleImageLoad}
                      />
                    ) : (
                      <div className={styles.photoSkeleton}>
                        <div className={styles.photoSkeletonShimmer} />
                      </div>
                    )}
                  </div>

                  <div className={styles.photoContent}>
                    {memory.title && (
                      <p className={styles.photoTitle}>{memory.title}</p>
                    )}
                    {!memory.title && <p className={styles.photoLabel}>Photo</p>}
                  </div>

                  <div className={`${styles.cardFooter} ${styles.photoCardFooter}`}>
                    <span className={styles.cardDate}>{attribution}</span>
                  </div>
                </div>
              </div>
            );
          }

          /* ── Text card ── */
          return (
            <div key={memory.id} className={styles.masonryItem}>
              <div className={styles.textCard}>
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
                  <span className={styles.cardDate}>{attribution}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
