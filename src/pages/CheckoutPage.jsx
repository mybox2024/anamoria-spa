// pages/CheckoutPage.jsx — Anamoria SPA
// v1.0 — B2: Checkout / Payment screen (April 6, 2026)
//
// Reads ?plan= from URL to show the correct plan summary.
// Payment Element is a MOCK (styled placeholder only — no Stripe.js loaded).
// Replace mock fields with <PaymentElement /> when Stripe is wired.
//
// URL: /settings/upgrade/checkout?plan={monthly|annual|forever}&from={spaceId}
//   ?plan — selected plan id from UpgradePage
//   ?from — spaceId for back/success navigation
//
// On "Complete Purchase" → navigates to /settings/upgrade/success?plan=X&from=Y
// Cancel → back to /settings/upgrade?from=Y

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './CheckoutPage.module.css';

/* ─── Icons ─── */

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/* ─── Plan meta (mirrors UpgradePage PLANS — keep in sync) ─── */

const PLAN_META = {
  monthly: {
    label: 'Premium Monthly',
    price: '$12.99',
    billing: 'Billed monthly. Cancel any time.',
    summary: 'Premium Monthly — $12.99 / month',
  },
  annual: {
    label: 'Premium Annual',
    price: '$99.99',
    billing: 'Billed annually. Cancel any time.',
    summary: 'Premium Annual — $99.99 / year',
  },
  forever: {
    label: 'Lifetime',
    price: '$189.99',
    billing: 'One-time payment. No recurring charges.',
    summary: 'Lifetime — $189.99 once',
  },
};

/* ═══════════════════════════════════════
   MOCK STRIPE PAYMENT ELEMENT
   ─────────────────────────────────────
   Visual placeholder only.
   When Stripe is wired:
     1. npm install @stripe/react-stripe-js @stripe/stripe-js
     2. Wrap page in <Elements stripe={stripePromise} options={...}>
     3. Replace this component with <PaymentElement />
   ═══════════════════════════════════════ */

function MockPaymentElement() {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry]         = useState('');
  const [cvc, setCvc]               = useState('');
  const [name, setName]             = useState('');

  /* ─── Basic input formatters ─── */

  function formatCardNumber(val) {
    const digits = val.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  }

  function formatExpiry(val) {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
    return digits;
  }

  return (
    <div className={styles.stripeElement}>
      <p className={styles.stripeLabel}>CARD DETAILS</p>

      {/* Card number */}
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Card number</label>
        <input
          className={styles.fieldInput}
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 5678 9012 3456"
          value={cardNumber}
          onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
          maxLength={19}
        />
      </div>

      {/* Expiry + CVC */}
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Expiry</label>
          <input
            className={styles.fieldInput}
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM / YY"
            value={expiry}
            onChange={(e) => setExpiry(formatExpiry(e.target.value))}
            maxLength={7}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>CVC</label>
          <input
            className={styles.fieldInput}
            type="text"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            value={cvc}
            onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
            maxLength={4}
          />
        </div>
      </div>

      {/* Name on card */}
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Name on card</label>
        <input
          className={styles.fieldInput}
          type="text"
          autoComplete="cc-name"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Mock badge */}
      <p className={styles.mockNote}>
        ⚠️ UI preview — payment not processed
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════
   CHECKOUT PAGE
   ═══════════════════════════════════════ */

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planId  = searchParams.get('plan') || 'monthly';
  const spaceId = searchParams.get('from');

  const plan = PLAN_META[planId] || PLAN_META.monthly;

  const [submitting, setSubmitting] = useState(false);

  function goBack() {
    const q = spaceId ? `?from=${spaceId}` : '';
    navigate(`/settings/upgrade${q}`);
  }

  function handleSubmit() {
    // Mock submit: animate briefly then navigate to success
    setSubmitting(true);
    setTimeout(() => {
      const fromParam = spaceId ? `&from=${spaceId}` : '';
      navigate(`/settings/upgrade/success?plan=${planId}${fromParam}`);
    }, 800);
  }

  return (
    <div className={styles.page}>

      {/* ─── Header ─── */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={goBack} aria-label="Go back"
          disabled={submitting}>
          <BackIcon />
        </button>
        <h1 className={styles.title}>Complete your order</h1>
        <div className={styles.headerSpacer} aria-hidden="true" />
      </header>

      <div className={styles.content}>

        {/* ─── Plan summary pill ─── */}
        <div className={styles.planSummary}>
          <span className={styles.planSummaryText}>{plan.summary}</span>
        </div>

        {/* ─── Mock Stripe Payment Element ─── */}
        <MockPaymentElement />

        {/* ─── Billing note ─── */}
        <p className={styles.billingNote}>{plan.billing}</p>

        {/* ─── Submit ─── */}
        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Processing…' : `Pay ${plan.price}`}
        </button>

        {/* ─── Security note ─── */}
        <p className={styles.secureNote}>
          <LockIcon />
          Payments secured by Stripe. Your card details are never stored by Anamoria.
        </p>

        {/* ─── Cancel link ─── */}
        <button className={styles.cancelLink} onClick={goBack} disabled={submitting}>
          Cancel and go back
        </button>

      </div>
    </div>
  );
}
