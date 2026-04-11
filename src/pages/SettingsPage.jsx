// pages/SettingsPage.jsx — Anamoria SPA
// v1.4 — Clean up dead code (April 8, 2026)
// Changes from v1.3:
//   - onClose no-op on inline SpaceSettings replaced with noop function + comment
//   - TODO flag added: assess SpaceSettings modal retention for in-feed quick-edit
//
// URL: /settings?from={spaceId}

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import SpaceSettings from '../components/SpaceSettings';
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

  /* ─── Active nav section — driven by ?section= param, then spaceId, then account ─── */
  const [activeSection, setActiveSection] = useState(
    searchParams.get('section') || (spaceId ? 'space' : 'account')
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

  const handleSpaceSettingsSave = useCallback((updatedSpace) => {
    setSpace((prev) => ({ ...prev, ...updatedSpace }));
  }, []);

  /* ─── Navigation ─── */

  function goBack() {
    if (spaceId) navigate(`/spaces/${spaceId}`);
    else navigate('/spaces');
  }

  /* ─── Nav items (Space Settings only shown if spaceId present) ─── */
  const navItems = [
    { id: 'account', label: 'Account',        icon: <AccountIcon /> },
    ...(spaceId
      ? [{ id: 'space', label: 'Space Settings', icon: <SpaceIcon /> }]
      : []),
    { id: 'billing', label: 'Plan & Billing', icon: <BillingIcon /> },
  ];

  /* ─── Right panel content ─── */

  function renderPanel() {
    switch (activeSection) {
      case 'account':
        return <AccountPanel user={user} />;

      case 'space':
        if (loadingSpace) {
          return (
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Space Settings</h2>
              <p className={styles.panelLoading}>Loading…</p>
            </div>
          );
        }
        if (!space) {
          return (
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Space Settings</h2>
              <p className={styles.panelLoading}>Could not load space.</p>
            </div>
          );
        }
        return (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Space Settings</h2>
            {/* TODO: assess SpaceSettings modal retention for in-feed quick-edit use case
                 before retiring SpaceSettings.jsx — modal is currently unused in routing */}
            <SpaceSettings
              space={space}
              getApi={getApi}
              onClose={() => {/* no-op: inline mode has no close action */}}
              onSave={handleSpaceSettingsSave}
              inline
            />
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
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`${styles.navItem} ${activeSection === item.id ? styles.navItemActive : ''}`}
              onClick={() => setActiveSection(item.id)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
              <span className={styles.navChevron}><ChevronIcon /></span>
            </button>
          ))}
        </nav>

        {/* ─── Right content panel ─── */}
        <div className={styles.rightPanel}>
          {renderPanel()}
        </div>

      </div>
    </div>
  );
}
