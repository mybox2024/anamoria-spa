// pages/CheckoutPage.jsx — Anamoria SPA
// v1.1 — Real Stripe Payment Element integration (April 14, 2026)
//
// Changes from v1.0:
//   - Removed MockPaymentElement entirely
//   - Integrated @stripe/react-stripe-js with PaymentElement
//   - On submit: createPaymentMethod → POST /billing/subscribe → handle 3DS
//   - Stripe Price IDs from config (env vars)
//   - Loading states for Stripe Element initialization + payment processing
//   - Error display for failed payments
//   - Handles both recurring (monthly/annual) and one-time (forever) flows
//
// URL: /settings/upgrade/checkout?plan={monthly|annual|forever}&from={spaceId}

import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { createApiClient } from '../api/client';
import config from '../config';
import styles from './CheckoutPage.module.css';

/* ─── Initialize Stripe (once at module level — best practice) ─── */

let stripePromise = null;
function getStripePromise() {
  if (!stripePromise) {
    stripePromise = loadStripe(config.stripePublishableKey);
  }
  return stripePromise;
}

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

/* ─── Plan meta + price ID mapping ─── */

const PLAN_META = {
  monthly: {
    label: 'Premium Monthly',
    price: '$12.99',
    billing: 'Billed monthly. Cancel any time.',
    summary: 'Premium Monthly — $12.99 / month',
    stripePriceId: config.stripePriceMonthly,
  },
  annual: {
    label: 'Premium Annual',
    price: '$99.99',
    billing: 'Billed annually. Cancel any time.',
    summary: 'Premium Annual — $99.99 / year',
    stripePriceId: config.stripePriceAnnual,
  },
  forever: {
    label: 'Lifetime',
    price: '$189.99',
    billing: 'One-time payment. No recurring charges.',
    summary: 'Lifetime — $189.99 once',
    stripePriceId: config.stripePriceForever,
  },
};

/* ═══════════════════════════════════════
   CHECKOUT FORM (inside <Elements>)
   ═══════════════════════════════════════ */

function CheckoutForm({ plan, planId, spaceId }) {
  const navigate = useNavigate();
  const stripe = useStripe();
  const elements = useElements();
  const { getAccessTokenSilently } = useAuth0();

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently]
  );

  function goBack() {
    const q = spaceId ? `?from=${spaceId}` : '';
    navigate(`/settings/upgrade${q}`);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js hasn't loaded yet
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      // Step 1: Submit the Payment Element to validate card details
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setErrorMessage(submitError.message);
        setSubmitting(false);
        return;
      }

      // Step 2: Create a PaymentMethod from the Payment Element
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        elements,
      });

      if (pmError) {
        setErrorMessage(pmError.message);
        setSubmitting(false);
        return;
      }

      // Step 3: Call our backend to create the subscription/payment
      const api = getApi();
      const result = await api.post('/billing/subscribe', {
        priceId: plan.stripePriceId,
        paymentMethodId: paymentMethod.id,
      });

      // Step 4: Handle the response
      if (result.success) {
        // Payment succeeded immediately — navigate to success
        const fromParam = spaceId ? `&from=${spaceId}` : '';
        navigate(`/settings/upgrade/success?plan=${planId}${fromParam}`);
        return;
      }

      // Step 5: Handle 3D Secure / additional authentication
      if (result.clientSecret) {
        const confirmFn = result.subscriptionId
          ? stripe.confirmCardPayment  // Recurring subscription
          : stripe.confirmCardPayment; // One-time PaymentIntent — same function

        const { error: confirmError } = await confirmFn(result.clientSecret);

        if (confirmError) {
          setErrorMessage(confirmError.message);
          setSubmitting(false);
          return;
        }

        // 3DS confirmation succeeded
        const fromParam = spaceId ? `&from=${spaceId}` : '';
        navigate(`/settings/upgrade/success?plan=${planId}${fromParam}`);
        return;
      }

      // Unexpected response — shouldn't happen
      setErrorMessage('Something went wrong. Please try again.');
      setSubmitting(false);

    } catch (err) {
      // API or network error
      const msg = err.message || err.error || 'Payment failed. Please try again.';
      setErrorMessage(msg);
      setSubmitting(false);
    }
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

      <form className={styles.content} onSubmit={handleSubmit}>

        {/* ─── Plan summary pill ─── */}
        <div className={styles.planSummary}>
          <span className={styles.planSummaryText}>{plan.summary}</span>
        </div>

        {/* ─── Stripe Payment Element ─── */}
        <div className={styles.stripeElement}>
          <PaymentElement
            options={{
              layout: 'tabs',
            }}
          />
        </div>

        {/* ─── Error message ─── */}
        {errorMessage && (
          <div className={styles.errorMessage}>
            {errorMessage}
          </div>
        )}

        {/* ─── Billing note ─── */}
        <p className={styles.billingNote}>{plan.billing}</p>

        {/* ─── Submit ─── */}
        <button
          className={styles.submitBtn}
          type="submit"
          disabled={submitting || !stripe}
        >
          {submitting ? 'Processing…' : `Pay ${plan.price}`}
        </button>

        {/* ─── Security note ─── */}
        <p className={styles.secureNote}>
          <LockIcon />
          Payments secured by Stripe. Your card details are never stored by Anamoria.
        </p>

        {/* ─── Cancel link ─── */}
        <button
          className={styles.cancelLink}
          type="button"
          onClick={goBack}
          disabled={submitting}
        >
          Cancel and go back
        </button>

      </form>
    </div>
  );
}

/* ═══════════════════════════════════════
   CHECKOUT PAGE (wraps form in <Elements>)
   ═══════════════════════════════════════ */

export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const planId  = searchParams.get('plan') || 'monthly';
  const spaceId = searchParams.get('from');

  const plan = PLAN_META[planId] || PLAN_META.monthly;

  // Stripe Elements configuration
  // mode: 'subscription' for recurring, 'payment' for one-time
  const mode = planId === 'forever' ? 'payment' : 'subscription';

  // Amount in cents for the Elements appearance
  const amountMap = { monthly: 1299, annual: 9999, forever: 18999 };
  const amount = amountMap[planId] || 1299;

  const elementsOptions = {
    mode,
    amount,
    currency: 'usd',
    paymentMethodCreation: 'manual',
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#5b7a65',
        borderRadius: '10px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      },
    },
  };

  return (
    <Elements stripe={getStripePromise()} options={elementsOptions}>
      <CheckoutForm plan={plan} planId={planId} spaceId={spaceId} />
    </Elements>
  );
}
