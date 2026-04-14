// pages/UpgradePage.jsx — Anamoria SPA
// v1.2 — Live tier detection from billing API (April 14, 2026)
//
// Changes from v1.1:
//   - On mount, calls GET /billing/subscription to get current tier
//   - Marks actual current plan (not always Free)
//   - Premium users see "Switch to Annual/Monthly" instead of "Choose"
//   - Forever users see "Lifetime Member" message, all CTAs disabled
//   - Loading state while fetching tier
//   - Uses shared useBillingStatus hook
//
// URL: /settings/upgrade?from={spaceId}
//
// ⚠️  PLACEHOLDER: Feature lists and limits are indicative.
//     Confirm against billing spec before launch.

import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import { useBillingStatus } from '../hooks/useBillingStatus';
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

/* ─── Plan definitions (unchanged) ─── */

const FREE_FEATURES = [
  'Up to 5 memories',
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
  const [isAnnual, setIsAnnual] = useState(true);

  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  const { billing, loading } = useBillingStatus(getApi);

  function goBack() {
    const q = spaceId ? `?from=${spaceId}` : '';
    navigate(`/settings${q}`);
  }

  function handleSelect(planId) {
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

  // Determine CTA text and disabled state based on current tier
  function getFreePlanState() {
    const isCurrent = currentTier === 'free';
    return {
      cta: isCurrent ? 'Current plan' : 'Downgrade',
      disabled: true, // Can't select Free from upgrade page
      isCurrent,
    };
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

    </div>
  );
}
