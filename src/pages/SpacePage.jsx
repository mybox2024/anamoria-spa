// pages/SpacePage.jsx — Anamoria SPA
// v2.19 — UI polish: pin icon + mini prompt mic fix (April 29, 2026)
//
// Changes from v2.18:
//   - PinIcon: replaced custom map-marker SVG with Bootstrap bi-pin
//     thumbtack icon. Universally recognized "pin to top" affordance.
//   - MiniPromptBar: mic icon SVG fixed — was rendering incorrectly
//     (amber dot bug). Now uses outlined mic matching full PromptCard
//     Record button (white stroke on sage background).
//
// v2.18 — F3: Collapsible prompt outside scroll container (April 24, 2026)
//
// Changes from v2.17.1:
//   - F3 fix: Moved prompt section from inside <main> (scroll container)
//     to between <header> and <main> in the .page flex column.
//     This eliminates the scroll-position feedback loop that caused
//     shimmer/oscillation when collapsing a sticky element inside
//     its own scroll container (confirmed via 6 Chrome DevTools traces).
//   - F3 fix: Collapse/expand uses a ref (promptCollapsedRef) + direct
//     DOM class toggle via data attribute. NO React state changes on
//     scroll = NO re-renders = NO layout thrashing.
//   - F3 fix: Both PromptCard and MiniPromptBar are rendered in JSX
//     at all times. Visibility toggled via CSS class on the wrapper.
//   - F3 fix: Scroll listener dependency is [loading] so it attaches
//     once mainRef.current exists after initial render.
//   - F3 fix: Header changed from position: sticky to position: relative
//     + flex-shrink: 0 (sits above scroll container in flex column).
//   - F3 fix: Prompt section uses position: relative + flex-shrink: 0
//     (sits between header and scroll container, not inside it).
//
// v2.17.1 — Fix photo URL resolution (April 24, 2026)
// v2.17 — Space Photo + Pin-to-Top + Collapsible Prompt (April 24, 2026)
// Previous changes (v2.16): Tier A Frontend Optimizations.
// Route: /spaces/:spaceId (protected — JWT required)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import { useAppContext } from '../App';
import { useBillingStatus, getPlanLabel } from '../hooks/useBillingStatus';
import { getCached, setCache, invalidateCache, SPACE_DETAIL_CACHE_TTL, PROMPT_CACHE_TTL } from '../utils/apiCache';
import PromptCard from '../components/PromptCard';
import BottomNav from '../components/BottomNav';
import MemoryFeed from '../components/MemoryFeed';
import CreateSpaceModal from '../components/CreateSpaceModal';
import SoftGateModal from '../components/billing/SoftGateModal';
import styles from './SpacePage.module.css';

/* ─── Inline SVG icons ─── */

function HamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// v2.19: Pin icon — Bootstrap bi-pin thumbtack. Filled when pinned, outline when not.
function PinIcon({ filled }) {
  if (filled) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A6 6 0 0 1 5 6.708V2.277a3 3 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A6 6 0 0 1 5 6.708V2.277a3 3 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354" />
    </svg>
  );
}

/* ─── Utility: sort spaces with pin-to-top logic ─── */

function sortSpaces(spaces) {
  return [...spaces].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    if (a.isPinned && b.isPinned) {
      return new Date(a.pinnedAt || 0) - new Date(b.pinnedAt || 0);
    }
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
}

/* ─── MiniPromptBar: collapsed single-line prompt ─── */

function MiniPromptBar({ prompt, spaceName, onRecord }) {
  const promptText = prompt?.text
    ? prompt.text.replace(/{name}/gi, spaceName || '')
    : 'Record a voice note';

  return (
    <div className={styles.miniPrompt}>
      <p className={styles.miniPromptText}>{promptText}</p>
      <button className={styles.miniPromptBtn} onClick={onRecord}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
          <line x1="12" y1="18" x2="12" y2="22" />
        </svg>
        Record
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════
   SPACE PAGE COMPONENT
   ═══════════════════════════════════════ */

export default function SpacePage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { getAccessTokenSilently, logout, user } = useAuth0();
  const appState = useAppContext();

  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  const { billing } = useBillingStatus(getApi);
  const planLabel = getPlanLabel(billing);

  const currentTier = billing?.tier || 'free';
  const planLink = (() => {
    if (currentTier === 'forever') {
      return { label: 'My Plan →', route: `/settings?from=${spaceId}&section=billing` };
    }
    if (currentTier === 'premium') {
      return { label: 'Change Plan →', route: `/settings/upgrade?from=${spaceId}` };
    }
    return { label: 'Upgrade →', route: `/settings/upgrade?from=${spaceId}` };
  })();

  const [space, setSpace] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memoryCount, setMemoryCount] = useState(0);
  const [ownerMemoryCount, setOwnerMemoryCount] = useState(0);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSoftGate, setShowSoftGate] = useState(false);
  const [softGateResource, setSoftGateResource] = useState('memories');

  // v2.17: Space photo — resolved CloudFront signed URL for header avatar
  const [spacePhotoUrl, setSpacePhotoUrl] = useState(null);

  // v2.17: Sidebar photo URL cache — keyed by spaceId, avoids re-fetching
  const sidebarPhotoCache = useRef({});
  const [sidebarPhotos, setSidebarPhotos] = useState({});

  // v2.18: Collapsible prompt — ref-only, no React state.
  // promptCollapsedRef tracks collapse for the scroll handler.
  // promptSectionRef is the DOM element to toggle data attribute on.
  // No useState for collapse = no re-renders on scroll.
  const promptCollapsedRef = useRef(false);
  const cumulativeUpRef = useRef(0);
  const promptSectionRef = useRef(null);
  const mainRef = useRef(null);
  const lastScrollY = useRef(0);

  /* ─── Load space + prompt + owner memory count ─── */

  useEffect(() => {
    async function load() {
      const cachedSpace = getCached(`space:${spaceId}`);
      const cachedPrompt = getCached(`prompt:${spaceId}`);

      if (cachedSpace.hit && cachedPrompt.hit) {
        setSpace(cachedSpace.value);
        setPrompt(cachedPrompt.value);
        try {
          const api = getApi();
          const countData = await api.get(`/spaces/${spaceId}/memories/count`).catch(() => ({ count: 0 }));
          setOwnerMemoryCount(countData?.count ?? 0);
        } catch { /* count is non-critical */ }
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const api = getApi();
        const [spaceData, promptData, countData] = await Promise.all([
          api.get(`/spaces/${spaceId}`),
          api.get(`/spaces/${spaceId}/prompt`).catch(() => null),
          api.get(`/spaces/${spaceId}/memories/count`).catch(() => ({ count: 0 })),
        ]);
        setCache(`space:${spaceId}`, spaceData, SPACE_DETAIL_CACHE_TTL);
        setCache(`prompt:${spaceId}`, promptData, PROMPT_CACHE_TTL);

        setSpace(spaceData);
        setPrompt(promptData);
        setOwnerMemoryCount(countData?.count ?? 0);
      } catch (err) {
        console.error('SpacePage load error:', err);
        setError('Could not load this space.');
      } finally {
        setLoading(false);
      }
    }
    load();
    // v2.18: Reset collapse state on space change
    promptCollapsedRef.current = false;
    cumulativeUpRef.current = 0;
    lastScrollY.current = 0;
    if (promptSectionRef.current) {
      promptSectionRef.current.removeAttribute('data-collapsed');
    }
  }, [spaceId, getApi]);

  /* ─── v2.17: Resolve space photo S3 key to CloudFront signed URL ─── */
  /* v2.17.1: Removed encodeURIComponent — {key+} accepts raw slashes */

  useEffect(() => {
    if (!space?.photoUrl) {
      setSpacePhotoUrl(null);
      return;
    }
    let cancelled = false;
    async function resolve() {
      try {
        const api = getApi();
        const data = await api.get(`/media/playback/${space.photoUrl}`);
        if (!cancelled && data?.playbackUrl) {
          setSpacePhotoUrl(data.playbackUrl);
        }
      } catch (err) {
        console.error('Failed to resolve space photo:', err);
        if (!cancelled) setSpacePhotoUrl(null);
      }
    }
    resolve();
    return () => { cancelled = true; };
  }, [space?.photoUrl, getApi]);

  /* ─── v2.17: Resolve sidebar space photos ─── */
  /* v2.17.1: Removed encodeURIComponent — {key+} accepts raw slashes */

  useEffect(() => {
    if (!sidebarOpen || !appState?.spaces) return;
    let cancelled = false;

    async function resolvePhotos() {
      const spacesWithPhotos = appState.spaces.filter(
        (s) => s.photoUrl && !sidebarPhotoCache.current[s.id]
      );
      if (spacesWithPhotos.length === 0) return;

      const api = getApi();
      const results = {};

      await Promise.all(
        spacesWithPhotos.map(async (s) => {
          try {
            const data = await api.get(`/media/playback/${s.photoUrl}`);
            if (data?.playbackUrl) {
              results[s.id] = data.playbackUrl;
              sidebarPhotoCache.current[s.id] = data.playbackUrl;
            }
          } catch {
            // Photo resolution failure is non-critical — fall back to initial
          }
        })
      );

      if (!cancelled && Object.keys(results).length > 0) {
        setSidebarPhotos((prev) => ({ ...prev, ...results }));
      }
    }
    resolvePhotos();
    return () => { cancelled = true; };
  }, [sidebarOpen, appState?.spaces, getApi]);

  /* ─── v2.18: Scroll direction tracking for collapsible prompt ─── */
  /* The prompt section is OUTSIDE the scroll container (.main), so
     changing its height does not affect main.scrollTop — no oscillation.
     Uses a ref + data attribute toggle instead of React state to avoid
     re-renders on every scroll event. Dependency is [loading] so the
     listener attaches once mainRef.current exists after initial render. */

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    function handleScroll() {
      const currentY = el.scrollTop;
      const delta = currentY - lastScrollY.current;

      if (delta > 0) {
        // Scrolling down — reset cumulative up counter
        cumulativeUpRef.current = 0;

        if (currentY > 50 && !promptCollapsedRef.current) {
          promptCollapsedRef.current = true;
          if (promptSectionRef.current) {
            promptSectionRef.current.setAttribute('data-collapsed', '');
          }
        }
      } else if (delta < 0 && promptCollapsedRef.current) {
        // Scrolling up — accumulate distance
        cumulativeUpRef.current += Math.abs(delta);

        if (cumulativeUpRef.current > 50 || currentY < 10) {
          promptCollapsedRef.current = false;
          cumulativeUpRef.current = 0;
          if (promptSectionRef.current) {
            promptSectionRef.current.removeAttribute('data-collapsed');
          }
        }
      }

      if (delta > 0) cumulativeUpRef.current = 0;
      lastScrollY.current = currentY;
    }

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [loading]);

  /* ─── Load spaces list for sidebar (A-4: fallback only) ─── */

  const loadSpaces = useCallback(async () => {
    if ((appState?.spaces?.length || 0) > 0) return;
    try {
      const api = getApi();
      const data = await api.get('/spaces');
      const fetched = data.spaces || [];
      if (appState?.updateSpaces) appState.updateSpaces(fetched);
    } catch (err) {
      console.error('Spaces list fallback error:', err);
    }
  }, [getApi, appState]);

  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
    loadSpaces();
  }, [loadSpaces]);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    setShowUserMenu(false);
  }, []);

  const switchSpace = useCallback((id) => {
    closeSidebar();
    navigate(`/spaces/${id}`);
  }, [navigate, closeSidebar]);

  /* ─── v2.17: Pin/unpin space (optimistic update) ─── */

  const handleTogglePin = useCallback(async (e, targetSpace) => {
    e.stopPropagation();
    const newPinned = !targetSpace.isPinned;

    if (appState?.updateSpaces && appState?.spaces) {
      const updated = appState.spaces.map((s) =>
        s.id === targetSpace.id
          ? { ...s, isPinned: newPinned, pinnedAt: newPinned ? new Date().toISOString() : null }
          : s
      );
      appState.updateSpaces(sortSpaces(updated));
    }

    try {
      const api = getApi();
      await api.patch(`/spaces/${targetSpace.id}`, { isPinned: newPinned });
    } catch (err) {
      console.error('Pin toggle failed:', err);
      try {
        const api = getApi();
        const data = await api.get('/spaces');
        if (appState?.updateSpaces) appState.updateSpaces(data.spaces || []);
      } catch { /* revert best-effort */ }
    }
  }, [appState, getApi]);

  function handleRecord() {
    if (billing?.tier === 'free' && billing?.limits?.memoriesPerSpace) {
      if (ownerMemoryCount >= billing.limits.memoriesPerSpace) {
        setSoftGateResource('memories');
        setShowSoftGate(true);
        return;
      }
    }
    navigate(`/spaces/${spaceId}/record`, {
      state: { promptId: prompt?.promptId || null },
    });
  }

  const handleSkipPrompt = useCallback(async () => {
    try {
      const api = getApi();
      const nextPrompt = await api.post(`/spaces/${spaceId}/prompt/advance`);
      if (nextPrompt) {
        setPrompt(nextPrompt);
        setCache(`prompt:${spaceId}`, nextPrompt, PROMPT_CACHE_TTL);
      }
    } catch (err) {
      console.error('Skip prompt error:', err);
    }
  }, [getApi, spaceId]);

  function handleCreateSpace() {
    if (billing?.tier === 'free' && billing?.limits?.spaces) {
      if ((appState?.spaces?.length || 0) >= billing.limits.spaces) {
        setSoftGateResource('spaces');
        setShowSoftGate(true);
        return;
      }
    }
    setShowCreateModal(true);
  }

  const handleMemoryCount = useCallback((count) => {
    setMemoryCount(count);
  }, []);

  if (error) {
    return (
      <div className="app-error">
        <h2>Something went wrong</h2>
        <p>{error}</p>
        <button className="app-error-btn" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (loading || !space) {
    return null;
  }

  const isShared = space.privacyMode === 'shared';
  const initial = (space.name || '?').charAt(0).toUpperCase();

  const sortedSpaces = sortSpaces(appState?.spaces || []);
  const pinnedSpaces = sortedSpaces.filter((s) => s.isPinned);
  const unpinnedSpaces = sortedSpaces.filter((s) => !s.isPinned);

  return (
    <div className={styles.page}>

      {/* ═══════════════════════════════════════
          HEADER BAR
          ═══════════════════════════════════════ */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            className={styles.headerBtn}
            onClick={openSidebar}
            aria-label="Open space menu"
          >
            <HamburgerIcon />
          </button>

          <div className={styles.headerAvatar}>
            {spacePhotoUrl ? (
              <img src={spacePhotoUrl} alt="" className={styles.avatarImg} />
            ) : (
              <span className={styles.avatarInitial}>{initial}</span>
            )}
          </div>

          <div className={styles.headerInfo}>
            <h1 className={styles.headerName}>{space.name}</h1>
            <p className={styles.headerSub}>
              {isShared ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  {' '}Shared
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  {' '}Private
                </>
              )}
              {' · '}{memoryCount} {memoryCount === 1 ? 'memory' : 'memories'}
            </p>
          </div>
        </div>

        <button
          className={styles.headerBtn}
          onClick={handleCreateSpace}
          aria-label="Create new space"
        >
          <PlusIcon />
        </button>
      </header>

      {/* ═══════════════════════════════════════
          PROMPT SECTION (outside scroll container)
          v2.18: Sits between header and main in the flex column.
          Collapse/expand changes this element's height without
          affecting main.scrollTop — eliminates oscillation.
          Both full prompt and mini bar rendered; CSS toggles visibility
          via data-collapsed attribute. No React state on scroll.
          ═══════════════════════════════════════ */}
      <div className={styles.promptSection} ref={promptSectionRef}>
        {/* Full prompt — hidden when collapsed */}
        <div className={styles.promptFull}>
          <div className={styles.promptArea}>
            {prompt ? (
              <PromptCard
                prompt={prompt}
                spaceName={space.name}
                onRecord={handleRecord}
                onSkip={handleSkipPrompt}
              />
            ) : (
              <div className={styles.noPromptCta}>
                <button className={styles.recordBtn} onClick={handleRecord}>
                  <span className={styles.recordBtnIcon}>
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" strokeLinecap="round" strokeLinejoin="round">
                      <path className={styles.recordBtnFill} d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                      <path d="M18 10.5v.5a6 6 0 0 1-12 0v-.5" strokeWidth="1.5" stroke="white" />
                      <path d="M12 17v4" strokeWidth="1.5" stroke="white" />
                    </svg>
                  </span>
                  Record a voice note
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mini prompt bar — shown when collapsed */}
        <div className={styles.promptMini}>
          <MiniPromptBar
            prompt={prompt}
            spaceName={space.name}
            onRecord={handleRecord}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════
          MAIN CONTENT (scroll container)
          v2.18: Only contains MemoryFeed (tabs + masonry).
          Prompt is above, outside this scroll container.
          ═══════════════════════════════════════ */}
      <main className={styles.main} ref={mainRef}>
        {/* Memory feed — full width masonry */}
        <MemoryFeed
          spaceId={spaceId}
          getApi={getApi}
          onMemoryCount={handleMemoryCount}
          voiceCardTheme={space?.voiceCardTheme || 'warm'}
        />
      </main>

      <BottomNav spaceId={spaceId} activeTab="record" />

      {/* ═══════════════════════════════════════
          SIDEBAR DRAWER
          ═══════════════════════════════════════ */}
      {sidebarOpen && (
        <>
          <div className={styles.sidebarBackdrop} onClick={closeSidebar} />
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <h2 className={styles.sidebarTitle}>Your Memory Spaces</h2>
              <button
                className={styles.sidebarClose}
                onClick={closeSidebar}
                aria-label="Close menu"
              >
                <CloseIcon />
              </button>
            </div>

            <div className={styles.sidebarSection}>
              <p className={styles.sidebarSectionTitle}>SWITCH SPACE</p>

              {/* Pinned spaces */}
              {pinnedSpaces.length > 0 && (
                <>
                  {pinnedSpaces.map((s) => {
                    const sInitial = (s.name || '?').charAt(0).toUpperCase();
                    const isActive = s.id === spaceId;
                    const photoSrc = sidebarPhotos[s.id] || sidebarPhotoCache.current[s.id] || null;
                    return (
                      <button
                        key={s.id}
                        className={`${styles.sidebarSpace} ${isActive ? styles.sidebarSpaceActive : ''}`}
                        onClick={() => switchSpace(s.id)}
                      >
                        <span className={`${styles.sidebarAvatar} ${isActive ? styles.sidebarAvatarActive : ''}`}>
                          {photoSrc ? (
                            <img src={photoSrc} alt="" className={styles.sidebarAvatarImg} />
                          ) : (
                            sInitial
                          )}
                        </span>
                        <span className={styles.sidebarSpaceName}>{s.name}</span>
                        <span
                          className={`${styles.pinBtn} ${styles.pinBtnPinned}`}
                          onClick={(e) => handleTogglePin(e, s)}
                          title="Unpin space"
                          role="button"
                          tabIndex={0}
                        >
                          <PinIcon filled />
                        </span>
                      </button>
                    );
                  })}
                  {unpinnedSpaces.length > 0 && (
                    <div className={styles.pinDivider} />
                  )}
                </>
              )}

              {/* Un-pinned spaces */}
              {unpinnedSpaces.map((s) => {
                const sInitial = (s.name || '?').charAt(0).toUpperCase();
                const isActive = s.id === spaceId;
                const photoSrc = sidebarPhotos[s.id] || sidebarPhotoCache.current[s.id] || null;
                return (
                  <button
                    key={s.id}
                    className={`${styles.sidebarSpace} ${isActive ? styles.sidebarSpaceActive : ''}`}
                    onClick={() => switchSpace(s.id)}
                  >
                    <span className={`${styles.sidebarAvatar} ${isActive ? styles.sidebarAvatarActive : ''}`}>
                      {photoSrc ? (
                        <img src={photoSrc} alt="" className={styles.sidebarAvatarImg} />
                      ) : (
                        sInitial
                      )}
                    </span>
                    <span className={styles.sidebarSpaceName}>{s.name}</span>
                    {s.privacyMode === 'private' && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="1.5" strokeLinecap="round" style={{ marginLeft: 'auto', opacity: 0.5, flexShrink: 0 }}>
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    )}
                    <span
                      className={styles.pinBtn}
                      onClick={(e) => handleTogglePin(e, s)}
                      title="Pin to top"
                      role="button"
                      tabIndex={0}
                    >
                      <PinIcon filled={false} />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className={styles.sidebarFooterNav}>
              {appState?.pilotRole === 'leader' && (
                <button
                  className={styles.sidebarNavBtn}
                  onClick={() => { closeSidebar(); navigate('/leader'); }}
                >
                  <DashboardIcon />
                  Group Dashboard
                </button>
              )}
            </div>

            {user && (
              <div className={styles.sidebarUserWrapper}>

                {showUserMenu && (
                  <div className={styles.userMenu}>
                    <div className={styles.userMenuPlan}>
                      <span className={styles.userMenuPlanBadge}>{planLabel}</span>
                      <button
                        className={styles.userMenuUpgradeLink}
                        onClick={() => {
                          closeSidebar();
                          navigate(planLink.route);
                        }}
                      >
                        {planLink.label}
                      </button>
                    </div>

                    <div className={styles.userMenuDivider} />

                    <button
                      className={styles.userMenuItem}
                      onClick={() => {
                        closeSidebar();
                        navigate(`/settings?from=${spaceId}`);
                      }}
                    >
                      <SettingsIcon />
                      Settings
                    </button>

                    <button
                      className={`${styles.userMenuItem} ${styles.userMenuItemSignOut}`}
                      onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                    >
                      <SignOutIcon />
                      Sign out
                    </button>
                  </div>
                )}

                <button
                  className={`${styles.sidebarUser} ${showUserMenu ? styles.sidebarUserOpen : ''}`}
                  onClick={() => setShowUserMenu((v) => !v)}
                  aria-expanded={showUserMenu}
                  aria-label="Profile and settings"
                >
                  <div className={styles.sidebarUserAvatar}>
                    {(appState?.displayName || user.name || user.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.sidebarUserInfo}>
                    <span className={styles.sidebarUserName}>{appState?.displayName || user.name || 'User'}</span>
                    <span className={styles.sidebarUserEmail}>{planLabel}</span>
                  </div>
                  <span className={`${styles.sidebarUserChevron} ${showUserMenu ? styles.sidebarUserChevronUp : ''}`}>
                    <ChevronUpIcon />
                  </span>
                </button>

              </div>
            )}
          </aside>
        </>
      )}

      {showCreateModal && (
        <CreateSpaceModal
          getApi={getApi}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {showSoftGate && (
        <SoftGateModal
          isOpen={showSoftGate}
          onClose={() => setShowSoftGate(false)}
          resource={softGateResource}
          billing={billing}
          spaceId={spaceId}
        />
      )}

    </div>
  );
}
