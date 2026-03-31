// config.js — Anamoria SPA
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
};

// Validate that all required values are present at startup.
// This catches missing .env entries during local development before they
// cause cryptic runtime errors deeper in the auth or API layers.
const REQUIRED = ['apiUrl', 'auth0Domain', 'auth0ClientId', 'auth0Audience', 'apiKey'];

REQUIRED.forEach((key) => {
  if (!config[key]) {
    console.error(
      `[config] Missing required environment variable for "${key}". ` +
        'Check your .env file against .env.example.'
    );
  }
});

export default config;
