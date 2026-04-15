// pages/SettingsPage.jsx — Anamoria SPA
// v2.4 — Auto-open CancelModal from URL param (April 15, 2026)
// Changes from v2.3:
//   - Fix 1: BillingPanel reads ?action=cancel from URL params.
//     When present, auto-opens CancelModal (B6) on mount.
//     Used by UpgradePage "Downgrade" button to route Premium→Free
//     through the existing cancel flow (pause-first → confirm).
//     Clears the param from URL after reading to prevent re-trigger on refresh.
//   - All other panels (Account, SpaceInfo, Contributors, Reminders, NeedHelp) UNCHANGED
//   - All modal components, handlers, and wiring UNCHANGED
//
// Previous changes (v2.3):
//   - Premium plan card: added "Change plan" text link → /settings/upgrade
//   - "Update payment method" moved from Manage subscription to Payment method section
//   - Manage subscription section now contains only: Switch, Pause, Cancel
//   - goUpgrade: replaces history entry with section=billing before navigating
//
// URL: /settings?from={spaceId}&section={sectionId}&action={action}

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import { useBillingStatus, getPlanLabel } from '../hooks/useBillingStatus';
import SpaceInfoPanel from '../components/settings/SpaceInfoPanel';
import ContributorsPanel from '../components/settings/ContributorsPanel';
import RemindersPanel from '../components/settings/RemindersPanel';
import NeedHelpPanel from '../components/settings/NeedHelpPanel';
import UpdatePaymentModal from '../components/billing/UpdatePaymentModal';
import CancelModal from '../components/billing/CancelModal';
import PauseModal from '../components/billing/PauseModal';
import SwitchPlanModal from '../components/billing/SwitchPlanModal';
import styles from './SettingsPage.module.css';

/* ─── Icons (unchanged from v2.0) ─── */

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
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/* ═══════════════════════════════════════
   ACCOUNT PANEL (unchanged from v2.0)
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
   BILLING PANEL — v2.4 (auto-open CancelModal from URL param)
   ═══════════════════════════════════════ */

function BillingPanel({ spaceId, navigate, getApi, initialAction }) {
  const { billing, loading, error, refetch } = useBillingStatus(getApi);
  const [invoices, setInvoices]   = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // v2.2: Modal visibility state
  const [showUpdatePayment, setShowUpdatePayment] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const [showSwitchPlan, setShowSwitchPlan] = useState(false);
  const [pausePreselectedMonths, setPausePreselectedMonths] = useState(null);

  // v2.2: Reactivate / Resume loading states
  const [reactivating, setReactivating] = useState(false);
  const [resuming, setResuming] = useState(false);

  // v2.4 (Fix 1): Auto-open CancelModal when ?action=cancel is present.
  // This is triggered by UpgradePage "Downgrade" button routing here.
  // Only fires once — when billing data first loads and tier is premium.
  // Does not fire for free or forever users (nothing to cancel).
  useEffect(() => {
    if (initialAction === 'cancel' && billing && !loading) {
      if (billing.tier === 'premium' && !billing.cancelAtPeriodEnd) {
        setShowCancel(true);
      }
    }
  }, [initialAction, billing, loading]);

  // Fetch invoices when billing loads and tier is not free
  useEffect(() => {
    if (!billing || billing.tier === 'free') return;
    async function loadInvoices() {
      setInvoicesLoading(true);
      try {
        const api = getApi();
        const data = await api.get('/billing/invoices');
        setInvoices(data.invoices || []);
      } catch (err) {
        console.error('BillingPanel: invoices fetch failed:', err);
      } finally {
        setInvoicesLoading(false);
      }
    }
    loadInvoices();
  }, [billing, getApi]);

  // v2.3: Replace current history entry with billing-anchored URL before navigating
  // so that browser back from UpgradePage returns to Plan & Billing panel
  function goUpgrade() {
    const billingUrl = spaceId
      ? `/settings?from=${spaceId}&section=billing`
      : '/settings?section=billing';
    window.history.replaceState(null, '', billingUrl);
    const q = spaceId ? `?from=${spaceId}` : '';
    navigate(`/settings/upgrade${q}`);
  }

  function formatDate(isoString) {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  }

  function formatAmount(cents) {
    if (cents == null) return '—';
    return `$${(cents / 100).toFixed(2)}`;
  }

  function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // v2.2: Reactivate handler
  async function handleReactivate() {
    setReactivating(true);
    try {
      const api = getApi();
      await api.post('/billing/subscription/reactivate');
      refetch();
    } catch (err) {
      console.error('Reactivate error:', err);
    } finally {
      setReactivating(false);
    }
  }

  // v2.2: Resume Early handler
  async function handleResumeEarly() {
    setResuming(true);
    try {
      const api = getApi();
      await api.delete('/billing/subscription/pause');
      refetch();
    } catch (err) {
      console.error('Resume early error:', err);
    } finally {
      setResuming(false);
    }
  }

  // v2.2: B6→B11 coordination — CancelModal opens PauseModal with preselected duration
  function handleOpenPauseFromCancel(months) {
    setPausePreselectedMonths(months);
    setShowPause(true);
  }

  // ─── Loading state ───
  if (loading) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Plan &amp; Billing</h2>
        <p className={styles.panelLoading}>Loading billing info…</p>
      </div>
    );
  }

  // ─── Error state ───
  if (error) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Plan &amp; Billing</h2>
        <div className={styles.billingError}>
          <p>Couldn't load billing information.</p>
          <button className={styles.retryBtn} onClick={refetch}>Try again</button>
        </div>
      </div>
    );
  }

  const tier = billing?.tier || 'free';
  const planLabel = getPlanLabel(billing);

  // ─── Free tier (v2.2: updated limits text) ───
  if (tier === 'free') {
    return (
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Plan &amp; Billing</h2>

        <div className={styles.planCard}>
          <div className={styles.planCardLeft}>
            <span className={styles.planName}>{planLabel}</span>
            <span className={styles.planLimits}>Up to 15 memories · 1 space</span>
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

  // ─── Forever tier ───
  if (tier === 'forever') {
    return (
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Plan &amp; Billing</h2>

        <div className={styles.planCard}>
          <div className={styles.planCardLeft}>
            <span className={styles.planName}>Lifetime Member ♾</span>
            <span className={styles.planLimits}>
              Member since {formatDate(billing.foreverPurchasedAt)}
            </span>
          </div>
        </div>

        {/* Invoices */}
        {invoices.length > 0 && (
          <div className={styles.billingSection}>
            <h3 className={styles.billingSectionTitle}>Your invoice</h3>
            <div className={styles.invoiceList}>
              {invoices.slice(0, 1).map((inv) => (
                <div key={inv.id} className={styles.invoiceRow}>
                  <span className={styles.invoiceDate}>{formatDate(inv.date)}</span>
                  <span className={styles.invoiceAmount}>{formatAmount(inv.amount)}</span>
                  {inv.pdfUrl && (
                    <a
                      href={inv.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.invoiceLink}
                    >
                      <DownloadIcon /> PDF
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className={styles.panelHint}>
          You have lifetime access to Anamoria. No recurring charges.
        </p>
      </div>
    );
  }

  // ─── Premium tier (v2.2: management links enabled, modals wired) ───
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>Plan &amp; Billing</h2>

      {/* Payment failed warning banner */}
      {billing.paymentFailed && (
        <div className={`${styles.warningBanner} ${billing.paymentFailedUrgent ? styles.warningBannerUrgent : ''}`}>
          <p className={styles.warningText}>
            There's a problem with your payment — update your card to keep your access.
          </p>
          {/* v2.2: enabled — opens UpdatePaymentModal */}
          <button className={styles.warningAction} onClick={() => setShowUpdatePayment(true)}>
            Update card
          </button>
        </div>
      )}

      {/* Cancel at period end notice */}
      {billing.cancelAtPeriodEnd && (
        <div className={styles.cancelNotice}>
          <p className={styles.cancelNoticeText}>
            Your plan cancels on {formatDate(billing.currentPeriodEnd)}. You'll move to the Free plan after that date.
          </p>
          {/* v2.2: enabled — calls reactivate API */}
          <button
            className={styles.cancelNoticeAction}
            onClick={handleReactivate}
            disabled={reactivating}
          >
            {reactivating ? 'Reactivating…' : 'Reactivate'}
          </button>
        </div>
      )}

      {/* Pause notice */}
      {billing.pauseCollectionUntil && (
        <div className={styles.pauseNotice}>
          <p className={styles.pauseNoticeText}>
            Billing paused until {formatDate(billing.pauseCollectionUntil)}. Your memories stay accessible.
          </p>
          {/* v2.2: enabled — calls resume API */}
          <button
            className={styles.pauseNoticeAction}
            onClick={handleResumeEarly}
            disabled={resuming}
          >
            {resuming ? 'Resuming…' : 'Resume early'}
          </button>
        </div>
      )}

      {/* Plan card — v2.3: added Change plan link */}
      <div className={styles.planCard}>
        <div className={styles.planCardLeft}>
          <span className={styles.planName}>{planLabel}</span>
          <span className={styles.planLimits}>
            {billing.cancelAtPeriodEnd
              ? `Access until ${formatDate(billing.currentPeriodEnd)}`
              : `Renews ${formatDate(billing.currentPeriodEnd)}`
            }
          </span>
        </div>
        <button className={styles.changePlanLink} onClick={goUpgrade}>
          Change plan
        </button>
      </div>

      {/* Card info — v2.3: Update payment method moved here from Manage subscription */}
      {billing.cardBrand && billing.cardLast4 && (
        <div className={styles.billingSection}>
          <h3 className={styles.billingSectionTitle}>Payment method</h3>
          <div className={styles.cardInfo}>
            <span className={styles.cardBrand}>{capitalizeFirst(billing.cardBrand)}</span>
            <span className={styles.cardLast4}>ending in {billing.cardLast4}</span>
            <button
              className={styles.cardUpdateLink}
              onClick={() => setShowUpdatePayment(true)}
            >
              Update
            </button>
          </div>
        </div>
      )}

      {/* Management links — v2.3: Update payment method removed (moved to Payment method section) */}
      <div className={styles.billingSection}>
        <h3 className={styles.billingSectionTitle}>Manage subscription</h3>
        <div className={styles.managementLinks}>
          {/* Switch billing period */}
          <button className={styles.managementLink} onClick={() => setShowSwitchPlan(true)}>
            Switch to {billing.billingPeriod === 'monthly' ? 'Annual' : 'Monthly'}
          </button>
          {/* Pause — B11 */}
          {!billing.pauseCollectionUntil && !billing.cancelAtPeriodEnd && (
            <button className={styles.managementLink} onClick={() => { setPausePreselectedMonths(null); setShowPause(true); }}>
              Pause subscription
            </button>
          )}
          {/* Cancel — B6 */}
          {!billing.cancelAtPeriodEnd && (
            <button className={styles.managementLink} onClick={() => setShowCancel(true)}>
              Cancel subscription
            </button>
          )}
        </div>
        {/* v2.2: removed "These options will be available soon" hint */}
      </div>

      {/* Invoices */}
      {invoicesLoading ? (
        <div className={styles.billingSection}>
          <h3 className={styles.billingSectionTitle}>Your invoices</h3>
          <p className={styles.panelLoading}>Loading invoices…</p>
        </div>
      ) : invoices.length > 0 ? (
        <div className={styles.billingSection}>
          <h3 className={styles.billingSectionTitle}>Your invoices</h3>
          <div className={styles.invoiceList}>
            {invoices.map((inv) => (
              <div key={inv.id} className={styles.invoiceRow}>
                <span className={styles.invoiceDate}>{formatDate(inv.date)}</span>
                <span className={styles.invoiceAmount}>{formatAmount(inv.amount)}</span>
                <span className={styles.invoiceStatus}>{inv.status}</span>
                {inv.pdfUrl && (
                  <a
                    href={inv.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.invoiceLink}
                  >
                    <DownloadIcon /> PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className={styles.panelHint}>
        Your memories are always kept, whatever plan you're on.
      </p>

      {/* ═══════════════════════════════════════
          MODALS (v2.2)
          ═══════════════════════════════════════ */}

      {showUpdatePayment && (
        <UpdatePaymentModal
          isOpen
          onClose={() => setShowUpdatePayment(false)}
          getApi={getApi}
          onSuccess={refetch}
        />
      )}

      {showCancel && (
        <CancelModal
          isOpen
          onClose={() => setShowCancel(false)}
          billing={billing}
          getApi={getApi}
          onSuccess={refetch}
          onOpenPause={handleOpenPauseFromCancel}
        />
      )}

      {showPause && (
        <PauseModal
          isOpen
          onClose={() => { setShowPause(false); setPausePreselectedMonths(null); }}
          getApi={getApi}
          onSuccess={refetch}
          preselectedMonths={pausePreselectedMonths}
        />
      )}

      {showSwitchPlan && (
        <SwitchPlanModal
          isOpen
          onClose={() => setShowSwitchPlan(false)}
          billing={billing}
          getApi={getApi}
          onSuccess={refetch}
        />
      )}

    </div>
  );
}

/* ═══════════════════════════════════════
   SECTION PARAM MAPPING (backward compat — unchanged)
   ═══════════════════════════════════════ */

function resolveInitialSection(sectionParam, hasSpaceId) {
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

  // v2.4 (Fix 1): Read ?action= param and clear it from URL to prevent re-trigger.
  // The action param is a one-time trigger (e.g., action=cancel from UpgradePage "Downgrade").
  // We read it once, store it in state, and strip it from the URL.
  const [initialAction] = useState(() => {
    const action = searchParams.get('action');
    if (action) {
      // Strip action param from URL to prevent re-trigger on refresh.
      // Uses replaceState so it doesn't create a new history entry.
      const cleanParams = new URLSearchParams(searchParams);
      cleanParams.delete('action');
      const cleanUrl = cleanParams.toString()
        ? `${window.location.pathname}?${cleanParams.toString()}`
        : window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }
    return action;
  });

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
        // v2.4: Pass initialAction to BillingPanel for auto-open CancelModal
        return <BillingPanel spaceId={spaceId} navigate={navigate} getApi={getApi} initialAction={initialAction} />;

      default:
        return null;
    }
  }

  /* ─── Render (unchanged from v2.0) ─── */

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

          {spaceId && space && (
            <button className={styles.spaceBackLink} onClick={goToSpace}>
              <span className={styles.spaceBackArrow}>←</span>
              <span className={styles.spaceBackName}>{space.name}</span>
            </button>
          )}

          {navItems.map((item) => {
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
