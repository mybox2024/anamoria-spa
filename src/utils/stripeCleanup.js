// utils/stripeCleanup.js — Anamoria SPA
// v1.0 — Shared Stripe DOM cleanup utility (April 15, 2026)
//
// Stripe.js injects iframes, script tags, and floating UI elements (badge, Link popup)
// into the document body when loadStripe() is called. These persist after React components
// unmount because Stripe does not provide an official teardown/destroy API.
// See: github.com/stripe/react-stripe-js/issues/28
//
// This utility removes all Stripe-injected DOM artifacts and resets state so a fresh
// Stripe instance is created on next use. Called by:
//   - CheckoutPage.jsx (on unmount)
//   - UpdatePaymentModal.jsx (on modal close)
//
// Safe to call multiple times — all operations are idempotent.
// Only call AFTER the Stripe-using component has unmounted or closed.

/**
 * Remove all Stripe-injected DOM elements and reset global state.
 * @param {function} resetPromise — callback to set the module-level stripePromise to null
 */
export function cleanupStripeDom(resetPromise) {
  // Remove Stripe-injected iframes (controller frames, Link popup, etc.)
  document.querySelectorAll('iframe[src*="js.stripe.com"], iframe[src*="stripe.com"]')
    .forEach(el => el.remove());

  // Remove Stripe script tag injected by loadStripe()
  document.querySelectorAll('script[src*="js.stripe.com"]')
    .forEach(el => el.remove());

  // Remove Stripe floating UI elements (badge, Link authentication popup)
  // Stripe uses __PrivateStripe prefix for its injected container divs
  document.querySelectorAll('[class*="__PrivateStripe"], [class*="__stripe"]')
    .forEach(el => el.remove());

  // Reset the stripePromise singleton via callback so the calling module's
  // module-level variable is cleared (each file has its own singleton)
  if (typeof resetPromise === 'function') {
    resetPromise();
  }

  // Remove global Stripe constructor to ensure clean re-initialization
  if (window.Stripe) {
    delete window.Stripe;
  }
}
