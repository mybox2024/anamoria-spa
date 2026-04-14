// pages/SpacePage.jsx — Anamoria SPA
// v2.9 — B7 Soft Gate integration (April 14, 2026)
// Changes from v2.8:
//   - Import SoftGateModal from components/billing
//   - Added state: showSoftGate, softGateResource
//   - handleRecord: checks memoryCount vs billing.limits.memoriesPerSpace before navigate
//   - handleCreateSpace: checks spaces.length vs billing.limits.spaces before opening modal
//   - Renders SoftGateModal at bottom of JSX (before closing </div>)
//   - All other code UNCHANGED from v2.8
//
// Route: /spaces/:spaceId (protected — JWT required)
//
// Previous changes (v2.8):
//   - Profile menu tier badge from GET /billing/subscription
//   - Uses shared useBillingStatus hook + getPlanLabel utility
//   - "Upgrade →" link hidden when Premium or Forever

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import { useAppContext } from '../App';
import { useBillingStatus, getPlanLabel } from '../hooks/useBillingStatus';
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

/* ═══════════════════════════════════════
   SPACE PAGE COMPONENT
   ═══════════════════════════════════════ */

export default function SpacePage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const { getAccessTokenSilently, logout, user } = useAuth0();
  const appState = useAppContext();

  // Stable getApi function for child components
  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  // Billing status — drives profile menu tier badge + B7 soft gate
  const { billing } = useBillingStatus(getApi);
  const planLabel = getPlanLabel(billing);
  const showUpgradeLink = !billing || billing.tier === 'free';

  const [space, setSpace] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memoryCount, setMemoryCount] = useState(0);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [spaces, setSpaces] = useState([]);
  const [loadingSpaces, setLoadingSpaces] = useState(false);

  // Create space modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Profile / user menu inside sidebar
  const [showUserMenu, setShowUserMenu] = useState(false);

  // v2.9: B7 Soft Gate state
  const [showSoftGate, setShowSoftGate] = useState(false);
  const [softGateResource, setSoftGateResource] = useState('memories');

  /* ─── Load space + prompt ─── */

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

  /* ─── Load spaces list for sidebar ─── */

  const loadSpaces = useCallback(async () => {
    if (spaces.length > 0) return; // already loaded
    setLoadingSpaces(true);
    try {
      const api = getApi();
      const data = await api.get('/spaces');
      setSpaces(data.spaces || []);
    } catch (err) {
      console.error('Spaces list error:', err);
    } finally {
      setLoadingSpaces(false);
    }
  }, [getApi, spaces.length]);

  /* ─── Sidebar toggle ─── */

  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
    loadSpaces();
  }, [loadSpaces]);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    setShowUserMenu(false);
  }, []);

  /* ─── Navigate to space ─── */

  const switchSpace = useCallback((id) => {
    closeSidebar();
    navigate(`/spaces/${id}`);
  }, [navigate, closeSidebar]);

  /* ─── Record (v2.9: B7 soft gate check) ─── */

  function handleRecord() {
    // B7: Check free tier memory limit before navigating to record
    if (billing?.tier === 'free' && billing?.limits?.memoriesPerSpace) {
      if (memoryCount >= billing.limits.memoriesPerSpace) {
        setSoftGateResource('memories');
        setShowSoftGate(true);
        return;
      }
    }
    navigate(`/spaces/${spaceId}/record`, {
      state: { promptId: prompt?.promptId || null },
    });
  }

  /* ─── Skip / advance prompt ─── */

  const handleSkipPrompt = useCallback(async () => {
    try {
      const api = getApi();
      const nextPrompt = await api.post(`/spaces/${spaceId}/prompt/advance`);
      if (nextPrompt) {
        setPrompt(nextPrompt);
      }
    } catch (err) {
      console.error('Skip prompt error:', err);
    }
  }, [getApi, spaceId]);

  /* ─── Create new space (v2.9: B7 soft gate check) ─── */

  function handleCreateSpace() {
    // B7: Check free tier space limit before opening create modal
    if (billing?.tier === 'free' && billing?.limits?.spaces) {
      if (spaces.length >= billing.limits.spaces) {
        setSoftGateResource('spaces');
        setShowSoftGate(true);
        return;
      }
    }
    setShowCreateModal(true);
  }

  /* ─── Memory count callback ─── */

  const handleMemoryCount = useCallback((count) => {
    setMemoryCount(count);
  }, []);

  /* ─── Loading state ─── */

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <div className="app-loading-spinner" />
      </div>
    );
  }

  /* ─── Error state ─── */

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

  const isShared = space.privacyMode === 'shared';
  const initial = (space.name || '?').charAt(0).toUpperCase();

  return (
    <div className={styles.page}>

      {/* ═══════════════════════════════════════
          HEADER BAR
          Matches LWC: hamburger | avatar + name + subtitle | + button
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
            {space.photoUrl ? (
              <img src={space.photoUrl} alt="" className={styles.avatarImg} />
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
          MAIN CONTENT
          ═══════════════════════════════════════ */}
      <main className={styles.main}>

        {/* Prompt card or standalone CTA */}
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

        {/* Memory feed — full width masonry */}
        <MemoryFeed
          spaceId={spaceId}
          getApi={getApi}
          onMemoryCount={handleMemoryCount}
        />
      </main>

      <BottomNav spaceId={spaceId} activeTab="record" />

      {/* ═══════════════════════════════════════
          SIDEBAR DRAWER
          Matches LWC: space list + settings + dashboard + user
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

              {loadingSpaces && (
                <div className={styles.sidebarLoading}>
                  <div className="app-loading-spinner" />
                </div>
              )}

              {!loadingSpaces && spaces.map((s) => {
                const sInitial = (s.name || '?').charAt(0).toUpperCase();
                const isActive = s.id === spaceId;
                return (
                  <button
                    key={s.id}
                    className={`${styles.sidebarSpace} ${isActive ? styles.sidebarSpaceActive : ''}`}
                    onClick={() => switchSpace(s.id)}
                  >
                    <span className={`${styles.sidebarAvatar} ${isActive ? styles.sidebarAvatarActive : ''}`}>
                      {sInitial}
                    </span>
                    <span className={styles.sidebarSpaceName}>{s.name}</span>
                    {s.privacyMode === 'private' && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="1.5" strokeLinecap="round" style={{ marginLeft: 'auto', opacity: 0.5 }}>
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    )}
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

                {/* ─── User menu (shown above profile button when open) ─── */}
                {showUserMenu && (
                  <div className={styles.userMenu}>

                    {/* Plan badge — driven by GET /billing/subscription */}
                    <div className={styles.userMenuPlan}>
                      <span className={styles.userMenuPlanBadge}>{planLabel}</span>
                      {showUpgradeLink && (
                        <button
                          className={styles.userMenuUpgradeLink}
                          onClick={() => {
                            closeSidebar();
                            navigate(`/settings/upgrade?from=${spaceId}`);
                          }}
                        >
                          Upgrade →
                        </button>
                      )}
                    </div>

                    <div className={styles.userMenuDivider} />

                    {/* Settings */}
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

                    {/* Sign out */}
                    <button
                      className={`${styles.userMenuItem} ${styles.userMenuItemSignOut}`}
                      onClick={() => logout({ logoutParams: { returnTo: window.location.origin + '/join' } })}
                    >
                      <SignOutIcon />
                      Sign out
                    </button>

                  </div>
                )}

                {/* ─── Profile button ─── */}
                <button
                  className={`${styles.sidebarUser} ${showUserMenu ? styles.sidebarUserOpen : ''}`}
                  onClick={() => setShowUserMenu((v) => !v)}
                  aria-expanded={showUserMenu}
                  aria-label="Profile and settings"
                >
                  <div className={styles.sidebarUserAvatar}>
                    {(user.name || user.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.sidebarUserInfo}>
                    <span className={styles.sidebarUserName}>{user.name || 'User'}</span>
                    {/* Plan label — driven by GET /billing/subscription */}
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

      {/* ═══════════════════════════════════════
          CREATE SPACE MODAL
          ═══════════════════════════════════════ */}
      {showCreateModal && (
        <CreateSpaceModal
          getApi={getApi}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* ═══════════════════════════════════════
          B7 SOFT GATE MODAL (v2.9)
          ═══════════════════════════════════════ */}
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
