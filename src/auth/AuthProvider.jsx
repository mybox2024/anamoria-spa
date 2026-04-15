// auth/AuthProvider.jsx — Anamoria SPA
// Wraps the app in @auth0/auth0-react's Auth0Provider.
// All Auth0 configuration comes from config.js.
// Children gain access to useAuth0() throughout the tree.

import { Auth0Provider } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import config from '../config';

/**
 * AuthProvider must be rendered inside BrowserRouter so it can
 * call useNavigate() to handle the post-login redirect.
 *
 * Callback URL strategy:
 *   - In development: http://localhost:5173
 *   - In production:  https://app.anamoria.org
 * Both are registered in Auth0 dashboard (Callback URLs).
 *
 * After the Auth0 redirect, the SDK handles the code exchange internally.
 * onRedirectCallback navigates to the returnTo path (or '/' if none).
 */
export default function AuthProvider({ children }) {
  const navigate = useNavigate();

  function onRedirectCallback(appState) {
    navigate(appState?.returnTo || '/', { replace: true });
  }

  return (
    <Auth0Provider
      domain={config.auth0Domain}
      clientId={config.auth0ClientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: config.auth0Audience,
      }}
      onRedirectCallback={onRedirectCallback}
      // cacheLocation: 'memory' is the Auth0 SDK default for SPAs.
      // Tokens are NOT stored in localStorage — intentional (ADR-003).
      cacheLocation="memory"
      useRefreshTokens={true}
    >
      {children}
    </Auth0Provider>
  );
}