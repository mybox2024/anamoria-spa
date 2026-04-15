// components/billing/UpdatePaymentModal.jsx — Anamoria SPA
// v1.1 — Stripe DOM cleanup on modal close (April 15, 2026)
//
// Changes from v1.0:
//   - Added Stripe DOM cleanup when modal closes. Uses shared cleanupStripeDom
//     utility (utils/stripeCleanup.js) to remove all Stripe-injected iframes,
//     script tags, and floating UI elements (badge, Link popup) from the DOM.
//     Same pattern as CheckoutPage.jsx v1.3.
//   - Cleanup fires in the isOpen useEffect when isOpen transitions to false,
//     and also on component unmount. This covers both normal close and
//     parent unmount scenarios.
//   - All other behavior UNCHANGED from v1.0.
//
// Flow:
//   1. Modal opens → POST /billing/setup-intent → receive clientSecret
//   2. Render Stripe <Elements mode="setup"> wrapping <PaymentElement>
//   3. User enters new card → submit → stripe.confirmSetup({ redirect: 'if_required' })
//   4. On success: PUT /billing/payment-method with { paymentMethodId }
//   5. Close modal → cleanup Stripe DOM → refetch billing (card info updates in B4)
//
// Props:
//   isOpen    — boolean
//   onClose   — function
//   getApi    — function returning API client
//   onSuccess — function called after card update (triggers refetch)

import { useState, useEffect, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { cleanupStripeDom } from '../../utils/stripeCleanup';
import config from '../../config';
import styles from './UpdatePaymentModal.module.css';

/* ─── Stripe singleton (reuse from module level — same pattern as CheckoutPage) ─── */

let stripePromise = null;
function getStripePromise() {
  if (!stripePromise) {
    stripePromise = loadStripe(config.stripePublishableKey);
  }
  return stripePromise;
}

/* ═══════════════════════════════════════
   INNER FORM (inside <Elements>)
   ═══════════════════════════════════════ */

function UpdatePaymentForm({ getApi, onSuccess, onClose }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    try {
      // Step 1: Submit the Payment Element to validate
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message);
        setSubmitting(false);
        return;
      }

      // Step 2: Confirm the SetupIntent
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      });

      if (confirmError) {
        setError(confirmError.message);
        setSubmitting(false);
        return;
      }

      // Step 3: Extract paymentMethodId and send to our backend
      const paymentMethodId = setupIntent.payment_method;
      const api = getApi();
      await api.put('/billing/payment-method', { paymentMethodId });

      // Success
      onSuccess();
      onClose();

    } catch (err) {
      const msg = err.message || err.error || 'Could not update payment method. Please try again.';
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className={styles.stripeElement}>
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {error && (
        <div className={styles.error}>{error}</div>
      )}

      <button
        className={styles.submitBtn}
        type="submit"
        disabled={submitting || !stripe}
      >
        {submitting ? 'Updating…' : 'Update payment method'}
      </button>

      <button
        className={styles.cancelLink}
        type="button"
        onClick={onClose}
        disabled={submitting}
      >
        Cancel
      </button>
    </form>
  );
}

/* ═══════════════════════════════════════
   MODAL WRAPPER (manages SetupIntent + Elements)
   ═══════════════════════════════════════ */

export default function UpdatePaymentModal({ isOpen, onClose, getApi, onSuccess }) {
  const [clientSecret, setClientSecret] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState(null);

  // Create SetupIntent when modal opens; cleanup Stripe DOM when modal closes.
  useEffect(() => {
    if (!isOpen) {
      setClientSecret(null);
      setInitError(null);

      // v1.1: Clean up Stripe DOM artifacts when the modal closes.
      // This removes the persistent badge/iframes that Stripe injects.
      cleanupStripeDom(() => { stripePromise = null; });
      return;
    }
    setLoading(true);
    setInitError(null);

    async function createSetupIntent() {
      try {
        const api = getApi();
        const data = await api.post('/billing/setup-intent');
        setClientSecret(data.clientSecret);
      } catch (err) {
        const msg = err.message || err.error || 'Could not initialize payment form.';
        setInitError(msg);
      } finally {
        setLoading(false);
      }
    }
    createSetupIntent();

    // v1.1: Also cleanup on unmount (covers parent component unmounting while modal is open)
    return () => {
      cleanupStripeDom(() => { stripePromise = null; });
    };
  }, [isOpen, getApi]);

  // Close on Escape (only when not in Stripe form submission)
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const elementsOptions = clientSecret ? {
    clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#5b7a65',
        borderRadius: '10px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      },
    },
  } : null;

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Update payment method">

        <h2 className={styles.heading}>Update payment method</h2>

        {/* Loading */}
        {loading && (
          <p className={styles.loading}>Setting up secure form…</p>
        )}

        {/* Init error */}
        {initError && (
          <div className={styles.error}>
            {initError}
            <button className={styles.retryLink} onClick={() => { setInitError(null); setLoading(true); }}>
              Try again
            </button>
          </div>
        )}

        {/* Stripe Elements form */}
        {clientSecret && elementsOptions && (
          <Elements stripe={getStripePromise()} options={elementsOptions}>
            <UpdatePaymentForm
              getApi={getApi}
              onSuccess={onSuccess}
              onClose={onClose}
            />
          </Elements>
        )}

        {/* Security note */}
        <p className={styles.secureNote}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {' '}Secured by Stripe. Card details never stored by Anamoria.
        </p>

      </div>
    </div>
  );
}
