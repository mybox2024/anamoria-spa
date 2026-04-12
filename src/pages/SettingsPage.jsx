// pages/SettingsPage.jsx — Anamoria SPA
// v2.0 — SpaceSettings split into 4 independent panels (April 11, 2026)
// Changes from v1.4:
//   - Replaced monolithic <SpaceSettings inline /> with 4 extracted panel components
//   - Added space name back link at top of left nav (Option B — Notion pattern)
//   - Added "SPACE" section header in nav for 4 space sub-items
//   - Nav order: Account → Plan & Billing → SPACE items (account-level grouped at top)
//   - Each panel saves independently (PATCH /spaces/:id with own fields)
//   - Inline "Saved ✓" fade confirmation per panel
//   - Backward-compatible: ?section=space maps to 'space-info'
//   - Removed SpaceSettings import (file preserved for modal assessment)
//   - Removed onClose no-op (panels don't have close behavior)
//
// URL: /settings?from={spaceId}&section={sectionId}

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import SpaceInfoPanel from '../components/settings/SpaceInfoPanel';
import ContributorsPanel from '../components/settings/ContributorsPanel';
import RemindersPanel from '../components/settings/RemindersPanel';
import NeedHelpPanel from '../components/settings/NeedHelpPanel';
import styles from './SettingsPage.module.css';

/* ─── Icons ─── */

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

function BillingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M2 10h20" />
    </svg>
  );
}

function SpaceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ContributorsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ReminderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

/* ═══════════════════════════════════════
   ACCOUNT PANEL
   ═══════════════════════════════════════ */

function AccountPanel({ user }) {
  const userName  = user?.name  || 'Your account';
  const userEmail = user?.email || '';

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Account</h2>

      <div className={styles.accountCard}>
        <div className={styles.accountAvatar}>
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className={styles.accountInfo}>
          <span className={styles.accountName}>{userName}</span>
          <span className={styles.accountEmail}>{userEmail}</span>
        </div>
      </div>

      <p className={styles.panelHint}>
        Your name and email are managed through your login provider.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════
   BILLING PANEL
   ═══════════════════════════════════════ */

function BillingPanel({ spaceId, navigate }) {
  function goUpgrade() {
    const q = spaceId ? `?from=${spaceId}` : '';
    navigate(`/settings/upgrade${q}`);
  }

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Plan &amp; Billing</h2>

      <div className={styles.planCard}>
        <div className={styles.planCardLeft}>
          {/* TODO: replace static copy with live tier from GET /billing/subscription */}
          <span className={styles.planName}>Free plan</span>
          <span className={styles.planLimits}>Up to 5 memories · 1 space</span>
        </div>
        <button className={styles.upgradeBtn} onClick={goUpgrade}>
          Upgrade
        </button>
      </div>

      <p className={styles.panelHint}>
        Your memories are always kept, whatever plan you're on.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════
   SECTION PARAM MAPPING (backward compat)
   ═══════════════════════════════════════ */

function resolveInitialSection(sectionParam, hasSpaceId) {
  // Backward compatibility: ?section=space → space-info
  if (sectionParam === 'space') return 'space-info';
  if (sectionParam) return sectionParam;
  return hasSpaceId ? 'space-info' : 'account';
}

/* ═══════════════════════════════════════
   SETTINGS PAGE
   ═══════════════════════════════════════ */

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const spaceId = searchParams.get('from');
  const { getAccessTokenSilently, user } = useAuth0();

  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  /* ─── Active nav section ─── */
  const [activeSection, setActiveSection] = useState(
    resolveInitialSection(searchParams.get('section'), !!spaceId)
  );

  /* ─── Space data ─── */
  const [space, setSpace]               = useState(null);
  const [loadingSpace, setLoadingSpace] = useState(false);

  useEffect(() => {
    if (!spaceId) return;
    async function loadSpace() {
      setLoadingSpace(true);
      try {
        const api = getApi();
        const data = await api.get(`/spaces/${spaceId}`);
        setSpace(data);
      } catch (err) {
        console.error('SettingsPage: failed to load space:', err);
      } finally {
        setLoadingSpace(false);
      }
    }
    loadSpace();
  }, [spaceId, getApi]);

  /* ─── Shared save handler — merges updated space from any panel ─── */
  const handlePanelSave = useCallback((updatedSpace) => {
    setSpace((prev) => ({ ...prev, ...updatedSpace }));
  }, []);

  /* ─── Navigation ─── */

  function goBack() {
    if (spaceId) navigate(`/spaces/${spaceId}`);
    else navigate('/spaces');
  }

  function goToSpace() {
    if (spaceId) navigate(`/spaces/${spaceId}`);
  }

  /* ─── Nav items ─── */

  // Space sub-items (only shown when spaceId present)
  const spaceNavItems = spaceId ? [
    { id: 'space-info',    label: 'Space',        icon: <SpaceIcon /> },
    { id: 'contributors',  label: 'Contributors', icon: <ContributorsIcon /> },
    { id: 'reminders',     label: 'Reminders',    icon: <ReminderIcon /> },
    { id: 'need-help',     label: 'Need Help',    icon: <HelpIcon /> },
  ] : [];

  const navItems = [
    { id: 'account', label: 'Account', icon: <AccountIcon /> },
    { id: 'billing', label: 'Plan & Billing', icon: <BillingIcon /> },
    ...spaceNavItems,
  ];

  /* ─── Right panel content ─── */

  function renderPanel() {
    // Space panels need loaded space data
    const isSpacePanel = ['space-info', 'contributors', 'reminders', 'need-help'].includes(activeSection);

    if (isSpacePanel) {
      if (loadingSpace) {
        return (
          <div className={styles.panel}>
            <p className={styles.panelLoading}>Loading…</p>
          </div>
        );
      }
      if (!space) {
        return (
          <div className={styles.panel}>
            <p className={styles.panelLoading}>Could not load space.</p>
          </div>
        );
      }
    }

    switch (activeSection) {
      case 'account':
        return <AccountPanel user={user} />;

      case 'space-info':
        return (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Space</h2>
            <SpaceInfoPanel
              space={space}
              getApi={getApi}
              onSave={handlePanelSave}
            />
          </div>
        );

      case 'contributors':
        return (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Contributors</h2>
            <ContributorsPanel
              space={space}
              getApi={getApi}
              onSave={handlePanelSave}
            />
          </div>
        );

      case 'reminders':
        return (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Reminders</h2>
            <RemindersPanel
              space={space}
              getApi={getApi}
              onSave={handlePanelSave}
            />
          </div>
        );

      case 'need-help':
        return (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Need Help</h2>
            <NeedHelpPanel space={space} />
          </div>
        );

      case 'billing':
        return <BillingPanel spaceId={spaceId} navigate={navigate} />;

      default:
        return null;
    }
  }

  /* ─── Render ─── */

  return (
    <div className={styles.page}>

      {/* ─── Header ─── */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={goBack} aria-label="Go back">
          <BackIcon />
        </button>
        <h1 className={styles.title}>Settings</h1>
        <div className={styles.headerSpacer} aria-hidden="true" />
      </header>

      {/* ─── Two-panel body ─── */}
      <div className={styles.body}>

        {/* ─── Left nav ─── */}
        <nav className={styles.leftNav} aria-label="Settings sections">

          {/* ─── Space name back link (top of nav, only when spaceId present) ─── */}
          {spaceId && space && (
            <button className={styles.spaceBackLink} onClick={goToSpace}>
              <span className={styles.spaceBackArrow}>←</span>
              <span className={styles.spaceBackName}>{space.name}</span>
            </button>
          )}

          {navItems.map((item, index) => {
            // Insert SPACE section label before first space nav item
            const isFirstSpaceItem = item.id === 'space-info';
            return (
              <div key={item.id}>
                {isFirstSpaceItem && (
                  <div className={styles.navSectionLabel}>SPACE</div>
                )}
                <button
                  className={`${styles.navItem} ${activeSection === item.id ? styles.navItemActive : ''}`}
                  onClick={() => setActiveSection(item.id)}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span className={styles.navLabel}>{item.label}</span>
                  <span className={styles.navChevron}><ChevronIcon /></span>
                </button>
              </div>
            );
          })}
        </nav>

        {/* ─── Right content panel ─── */}
        <div className={styles.rightPanel}>
          {renderPanel()}
        </div>

      </div>
    </div>
  );
}
