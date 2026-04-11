// pages/UpgradePage.jsx — Anamoria SPA
// v1.1 — Monthly/Yearly toggle, Claude-style card layout (April 7, 2026)
//
// Changes from v1.0:
//   - Monthly / Annual toggle at top (single toggle, not per-card)
//   - Three cards: Free | Premium | Lifetime
//   - Premium price updates with toggle ($12.99/mo or $99.99/yr)
//   - CTA above features list (Claude pattern)
//   - Features use "Everything in [previous] and:" hierarchy
//   - planId passed to checkout: 'monthly' or 'annual' based on toggle
//
// URL: /settings/upgrade?from={spaceId}
//
// ⚠️  PLACEHOLDER: Feature lists and limits are indicative.
//     Confirm against billing spec before launch.

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './UpgradePage.module.css';

/* ─── Icons ─── */

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

/* ─── Plan definitions ─── */
// ⚠️ Confirm limits with product before launch.

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
   BILLING TOGGLE
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
   PLAN CARD
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

      {/* Name + tagline */}
      <div className={styles.cardTop}>
        <h2 className={styles.planName}>{plan.label}</h2>
        <p className={styles.planTagline}>{plan.tagline}</p>
      </div>

      {/* Price */}
      <div className={styles.priceBlock}>
        <div className={styles.priceRow}>
          <span className={styles.price}>{plan.price}</span>
          {plan.period && <span className={styles.period}>{plan.period}</span>}
        </div>
        {plan.priceNote && (
          <p className={styles.priceNote}>{plan.priceNote}</p>
        )}
      </div>

      {/* CTA — above features, per Claude pattern */}
      <button
        className={
          plan.isFree     ? styles.ctaCurrent  :
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

      {/* Divider */}
      <div className={styles.featureDivider} />

      {/* Features */}
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
  const [isAnnual, setIsAnnual] = useState(true); // default to annual (best value)

  function goBack() {
    const q = spaceId ? `?from=${spaceId}` : '';
    navigate(`/settings${q}`);
  }

  function handleSelect(planId) {
    const fromParam = spaceId ? `&from=${spaceId}` : '';
    navigate(`/settings/upgrade/checkout?plan=${planId}${fromParam}`);
  }

  /* ─── Build plan list from toggle state ─── */

  const premiumId    = isAnnual ? 'annual' : 'monthly';
  const premiumPrice = isAnnual ? '$99.99' : '$12.99';
  const premiumPeriod = isAnnual ? '/ year' : '/ month';
  const premiumNote  = isAnnual ? '$8.33 / month · billed annually' : 'Billed monthly';

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
      cta: 'Current plan',
      ctaNote: null,
      disabled: true,
      isFree: true,
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
      cta: `Choose ${isAnnual ? 'Annual' : 'Monthly'}`,
      ctaNote: 'Cancel any time',
      disabled: false,
      isFree: false,
      highlighted: true,
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
      cta: 'Choose Lifetime',
      ctaNote: null,
      disabled: false,
      isFree: false,
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

      {/* ─── Billing period toggle ─── */}
      <div className={styles.toggleArea}>
        <BillingToggle isAnnual={isAnnual} onChange={setIsAnnual} />
      </div>

      {/* ─── Plan cards ─── */}
      <div className={styles.cards}>
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} onSelect={handleSelect} />
        ))}
      </div>

      <p className={styles.footerNote}>
        Cancel or change your plan any time. Memories are never deleted on downgrade.
      </p>

    </div>
  );
}
