// config.js — Anamoria SPA
// v1.1 — April 14, 2026
// Changes from v1.0:
//   - Added stripePublishableKey for Stripe Elements integration
//   - Added 3 Stripe Price ID env vars for billing subscribe flow
//
// Single source of truth for all environment-driven configuration.
// Values are injected by Vite at build time via import.meta.env.
// See .env.example for required variables.

const config = {
  apiUrl: import.meta.env.VITE_API_URL,
  auth0Domain: import.meta.env.VITE_AUTH0_DOMAIN,
  auth0ClientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
  auth0Audience: import.meta.env.VITE_AUTH0_AUDIENCE,
  // API key for unauthenticated routes: POST /pilot/validate-code and POST /errors.
  // Not a secret — intentionally visible in browser dev tools (ADR-009).
  apiKey: import.meta.env.VITE_API_KEY,
  // Stripe publishable key — used by @stripe/stripe-js to load Stripe Elements.
  // Not a secret — this is the public key from Stripe Dashboard → Developers → API Keys.
  stripePublishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
  // Stripe Price IDs — map plan names to Stripe price objects.
  // Values from Stripe Dashboard → Products → each price.
  stripePriceMonthly: import.meta.env.VITE_STRIPE_PRICE_MONTHLY,
  stripePriceAnnual: import.meta.env.VITE_STRIPE_PRICE_ANNUAL,
  stripePriceForever: import.meta.env.VITE_STRIPE_PRICE_FOREVER,
};

// Validate that all required values are present at startup.
// This catches missing .env entries during local development before they
// cause cryptic runtime errors deeper in the auth or API layers.
const REQUIRED = [
  'apiUrl',
  'auth0Domain',
  'auth0ClientId',
  'auth0Audience',
  'apiKey',
  'stripePublishableKey',
  'stripePriceMonthly',
  'stripePriceAnnual',
  'stripePriceForever',
];

REQUIRED.forEach((key) => {
  if (!config[key]) {
    console.error(
      `[config] Missing required environment variable for "${key}". ` +
        'Check your .env file against .env.example.'
    );
  }
});

export default config;
