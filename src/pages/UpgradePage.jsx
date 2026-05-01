// pages/UpgradePage.jsx — Anamoria SPA
// v1.7 — BUX-4: Free plan "5 memories" → "15 memories" (May 1, 2026)
//
// Changes from v1.6:
//   - FREE_FEATURES[0]: "Up to 5 memories" → "Up to 15 memories"
//     Backend enforces FREE_TIER_MEMORY_LIMIT=15 (env var on anamoria-memories).
//     Frontend was showing the old pre-BG-3 value.
//
// v1.6 — Premium → Lifetime upgrade opens UpgradeToLifetimeModal inline (April 30, 2026)
//
// Changes from v1.5:
//   - Fix 6: Premium subscribers clicking "Choose Lifetime" now opens
//     UpgradeToLifetimeModal inline instead of navigating to CheckoutPage.
//     Modal shows proration preview (credit from current plan), existing card,
//     and calls POST /billing/forever-upgrade. Backend charges existing card,
//     cancels subscription, upgrades tier to forever.
//     CheckoutPage now only handles free→paid flows.
//
// Previous changes (v1.5):
//   - Fix 5 (now unchanged): Monthly↔Annual switch opens SwitchPlanModal inline.
//
// Changes from v1.3 (carried forward):
//   - goBack() uses navigate(-1) to return to actual previous page
//   - Fallback to /settings if no history (direct URL visit)
//
// Previous changes (v1.2):
//   - Live tier detection from billing API
//   - Marks actual current plan (not always Free)
//   - Premium users see "Switch to Annual/Monthly" instead of "Choose"
//   - Forever users see "Lifetime Member" message, all CTAs disabled
//   - Uses shared useBillingStatus hook
//
// URL: /settings/upgrade?from={spaceId}
//
// ⚠️  PLACEHOLDER: Feature lists and limits are indicative.
//     Confirm against billing spec before launch.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import { useBillingStatus } from '../hooks/useBillingStatus';
import SwitchPlanModal from '../components/billing/SwitchPlanModal';
import UpgradeToLifetimeModal from '../components/billing/UpgradeToLifetimeModal';
import styles from './UpgradePage.module.css';

/* ─── Icons (unchanged) ─── */

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/* ─── Plan definitions (v1.7: BUX-4 fix — 5→15 memories) ─── */

const FREE_FEATURES = [
  'Up to 15 memories',
  '1 space',
  'Voice, photo & text memories',
  'Up to 2 contributors',
];

const PREMIUM_FEATURES = [
  'Everything in Free, and:',
  'Unlimited memories',
  'Multiple spaces',
  'Unlimited contributors',
  'Invoice downloads',
];

const FOREVER_FEATURES = [
  'Everything in Premium, and:',
  'No recurring charges, ever',
  'Lifetime access',
  'Early access to new features',
];

/* ═══════════════════════════════════════
   BILLING TOGGLE (unchanged)
   ═══════════════════════════════════════ */

function BillingToggle({ isAnnual, onChange }) {
  return (
    <div className={styles.toggleWrap}>
      <button
        className={`${styles.toggleOption} ${!isAnnual ? styles.toggleOptionActive : ''}`}
        onClick={() => onChange(false)}
      >
        Monthly
      </button>
      <button
        className={`${styles.toggleOption} ${isAnnual ? styles.toggleOptionActive : ''}`}
        onClick={() => onChange(true)}
      >
        Yearly
        <span className={styles.toggleSaveBadge}>Save 36%</span>
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════
   PLAN CARD (unchanged)
   ═══════════════════════════════════════ */

function PlanCard({ plan, onSelect }) {
  const cardClass = [
    styles.card,
    plan.highlighted ? styles.cardHighlighted : '',
    plan.isFree      ? styles.cardFree      : '',
    plan.isForever   ? styles.cardForever   : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClass}>

      {plan.badge && (
        <span className={plan.isForever ? styles.badgeForever : styles.badgeHighlighted}>
          {plan.badge}
        </span>
      )}

      <div className={styles.cardTop}>
        <h2 className={styles.planName}>{plan.label}</h2>
        <p className={styles.planTagline}>{plan.tagline}</p>
      </div>

      <div className={styles.priceBlock}>
        <div className={styles.priceRow}>
          <span className={styles.price}>{plan.price}</span>
          {plan.period && <span className={styles.period}>{plan.period}</span>}
        </div>
        {plan.priceNote && (
          <p className={styles.priceNote}>{plan.priceNote}</p>
        )}
      </div>

      <button
        className={
          plan.isCurrent  ? styles.ctaCurrent  :
          plan.isForever  ? styles.ctaForever  :
                            styles.ctaPrimary
        }
        onClick={() => !plan.disabled && onSelect(plan.id)}
        disabled={plan.disabled}
      >
        {plan.cta}
      </button>
      {plan.ctaNote && (
        <p className={styles.ctaNote}>{plan.ctaNote}</p>
      )}

      <div className={styles.featureDivider} />

      <ul className={styles.features}>
        {plan.features.map((f, i) => (
          <li key={i} className={`${styles.feature} ${f.startsWith('Everything') ? styles.featureHeading : ''}`}>
            {!f.startsWith('Everything') && (
              <span className={styles.featureCheck}><CheckIcon /></span>
            )}
            {f}
          </li>
        ))}
      </ul>

    </div>
  );
}

/* ═══════════════════════════════════════
   UPGRADE PAGE
   ═══════════════════════════════════════ */

export default function UpgradePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const spaceId = searchParams.get('from');
  const { getAccessTokenSilently } = useAuth0();

  // v1.4: Default to annual; sync to user's billing period once loaded (Fix 2)
  const [isAnnual, setIsAnnual] = useState(true);

  // v1.5 (Fix 5): State for inline SwitchPlanModal
  const [showSwitchPlan, setShowSwitchPlan] = useState(false);

  // v1.6 (Fix 6): State for inline UpgradeToLifetimeModal
  const [showLifetimeUpgrade, setShowLifetimeUpgrade] = useState(false);

  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  const { billing, loading, refetch } = useBillingStatus(getApi);

  // v1.4 (Fix 2): Sync toggle to user's actual billing period once billing loads.
  // Monthly subscribers land on the Monthly tab and see "Current plan" in focus.
  // Free/Forever/Annual users keep the Annual default (best-value conversion view).
  // Runs once when billingPeriod first becomes available — does not override
  // subsequent user interaction with the toggle.
  useEffect(() => {
    if (billing?.billingPeriod === 'monthly') {
      setIsAnnual(false);
    }
  }, [billing?.billingPeriod]);

  // v1.3: Use browser history so back returns to actual previous page
  function goBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      // Fallback for direct URL visit — no history to go back to
      const q = spaceId ? `?from=${spaceId}&section=billing` : '?section=billing';
      navigate(`/settings${q}`);
    }
  }

  function handleSelect(planId) {
    // v1.4 (Fix 1): "Downgrade" (free card) routes to Settings with action=cancel
    // to auto-open the CancelModal (B6), which uses the existing pause-first → cancel flow.
    if (planId === 'free') {
      const q = spaceId
        ? `?from=${spaceId}&section=billing&action=cancel`
        : '?section=billing&action=cancel';
      navigate(`/settings${q}`);
      return;
    }

    // v1.5 (Fix 5): Plan switch — existing Premium subscriber clicking the opposite
    // billing period. Opens SwitchPlanModal inline with proration preview instead of
    // navigating to CheckoutPage (which only handles new subscriptions).
    if (currentTier === 'premium' && (planId === 'monthly' || planId === 'annual') && planId !== currentPeriod) {
      setShowSwitchPlan(true);
      return;
    }

    // v1.6 (Fix 6): Forever upgrade — existing Premium subscriber buying Lifetime.
    // Opens UpgradeToLifetimeModal with proration preview, charges existing card,
    // cancels subscription, upgrades tier. Does NOT route to CheckoutPage.
    if (currentTier === 'premium' && planId === 'forever') {
      setShowLifetimeUpgrade(true);
      return;
    }

    // New subscription (free → paid) — route to CheckoutPage
    const fromParam = spaceId ? `&from=${spaceId}` : '';
    navigate(`/settings/upgrade/checkout?plan=${planId}${fromParam}`);
  }

  // ─── Derive current plan state from billing ───

  const currentTier = billing?.tier || 'free';
  const currentPeriod = billing?.billingPeriod || null;

  // ─── Build plan list from toggle state + billing ───

  const premiumId    = isAnnual ? 'annual' : 'monthly';
  const premiumPrice = isAnnual ? '$99.99' : '$12.99';
  const premiumPeriod = isAnnual ? '/ year' : '/ month';
  const premiumNote  = isAnnual ? '$8.33 / month · billed annually' : 'Billed monthly';

  // v1.4 (Fix 1): Determine CTA text and state for the Free card.
  // Premium/Forever users see a "Downgrade" button that routes to the cancel flow.
  // Free users see "Current plan" (disabled). No user can "select" Free as a checkout.
  function getFreePlanState() {
    const isCurrent = currentTier === 'free';
    if (isCurrent) {
      return { cta: 'Current plan', disabled: true, isCurrent: true };
    }
    if (currentTier === 'forever') {
      // Forever users can't downgrade — they have lifetime access
      return { cta: 'You have Lifetime', disabled: true, isCurrent: false };
    }
    // Premium user — "Downgrade" routes to cancel flow via handleSelect('free')
    return { cta: 'Downgrade', disabled: false, isCurrent: false };
  }

  function getPremiumPlanState() {
    if (currentTier === 'forever') {
      return { cta: 'You have Lifetime', disabled: true, isCurrent: false };
    }
    if (currentTier === 'premium') {
      const isCurrentPeriod = currentPeriod === premiumId;
      if (isCurrentPeriod) {
        return { cta: 'Current plan', disabled: true, isCurrent: true };
      }
      // User is on the other period — show switch CTA
      return {
        cta: `Switch to ${isAnnual ? 'Annual' : 'Monthly'}`,
        disabled: false,
        isCurrent: false,
      };
    }
    // Free tier — standard upgrade
    return {
      cta: `Choose ${isAnnual ? 'Annual' : 'Monthly'}`,
      disabled: false,
      isCurrent: false,
    };
  }

  function getForeverPlanState() {
    if (currentTier === 'forever') {
      return { cta: 'Current plan', disabled: true, isCurrent: true };
    }
    return { cta: 'Choose Lifetime', disabled: false, isCurrent: false };
  }

  const freePlan = getFreePlanState();
  const premiumPlan = getPremiumPlanState();
  const foreverPlan = getForeverPlanState();

  const PLANS = [
    {
      id: 'free',
      label: 'Free',
      tagline: 'Get started',
      price: '$0',
      period: '',
      priceNote: 'Always free',
      badge: null,
      features: FREE_FEATURES,
      cta: freePlan.cta,
      ctaNote: null,
      disabled: freePlan.disabled,
      isFree: true,
      isCurrent: freePlan.isCurrent,
      highlighted: false,
      isForever: false,
    },
    {
      id: premiumId,
      label: 'Premium',
      tagline: 'Unlimited memories',
      price: premiumPrice,
      period: premiumPeriod,
      priceNote: premiumNote,
      badge: isAnnual ? 'Best value' : null,
      features: PREMIUM_FEATURES,
      cta: premiumPlan.cta,
      ctaNote: premiumPlan.disabled ? null : 'Cancel any time',
      disabled: premiumPlan.disabled,
      isFree: false,
      isCurrent: premiumPlan.isCurrent,
      highlighted: !premiumPlan.isCurrent && currentTier !== 'forever',
      isForever: false,
    },
    {
      id: 'forever',
      label: 'Lifetime',
      tagline: 'Pay once, yours forever',
      price: '$189.99',
      period: '',
      priceNote: 'One-time payment',
      badge: 'Forever',
      features: FOREVER_FEATURES,
      cta: foreverPlan.cta,
      ctaNote: null,
      disabled: foreverPlan.disabled,
      isFree: false,
      isCurrent: foreverPlan.isCurrent,
      highlighted: false,
      isForever: true,
    },
  ];

  return (
    <div className={styles.page}>

      {/* ─── Header ─── */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={goBack} aria-label="Go back">
          <BackIcon />
        </button>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Choose a plan</h1>
          <p className={styles.subtitle}>Your memories are always kept, whatever you choose.</p>
        </div>
      </header>

      {/* ─── Loading state ─── */}
      {loading ? (
        <div className={styles.toggleArea}>
          <p style={{ textAlign: 'center', color: '#737373', fontSize: 14, fontFamily: 'var(--font-sans)' }}>
            Loading your plan…
          </p>
        </div>
      ) : (
        <>
          {/* ─── Forever member message ─── */}
          {currentTier === 'forever' && (
            <div className={styles.toggleArea}>
              <p style={{ textAlign: 'center', color: '#5b7a65', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
                You're a Lifetime Member — no further upgrades needed.
              </p>
            </div>
          )}

          {/* ─── Billing period toggle ─── */}
          {currentTier !== 'forever' && (
            <div className={styles.toggleArea}>
              <BillingToggle isAnnual={isAnnual} onChange={setIsAnnual} />
            </div>
          )}

          {/* ─── Plan cards ─── */}
          <div className={styles.cards}>
            {PLANS.map((plan) => (
              <PlanCard key={plan.id} plan={plan} onSelect={handleSelect} />
            ))}
          </div>

          <p className={styles.footerNote}>
            Cancel or change your plan any time. Memories are never deleted on downgrade.
          </p>
        </>
      )}

      {/* v1.5 (Fix 5): SwitchPlanModal — opens inline for Premium plan switches */}
      {showSwitchPlan && (
        <SwitchPlanModal
          isOpen
          onClose={() => setShowSwitchPlan(false)}
          billing={billing}
          getApi={getApi}
          onSuccess={() => { refetch(); setShowSwitchPlan(false); }}
        />
      )}

      {/* v1.6 (Fix 6): UpgradeToLifetimeModal — opens inline for Premium → Lifetime */}
      {showLifetimeUpgrade && (
        <UpgradeToLifetimeModal
          isOpen
          onClose={() => setShowLifetimeUpgrade(false)}
          billing={billing}
          getApi={getApi}
          onSuccess={() => { refetch(); setShowLifetimeUpgrade(false); }}
        />
      )}

    </div>
  );
}
