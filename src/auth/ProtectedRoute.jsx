// auth/ProtectedRoute.jsx — Anamoria SPA
// Guards any route that requires authentication.
// Behavior:
//   - Auth0 loading: show nothing (avoids flash of login redirect)
//   - Not authenticated: trigger Auth0 loginWithRedirect
//   - Authenticated: render children

import { useAuth0 } from '@auth0/auth0-react';
import { useEffect } from 'react';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      loginWithRedirect({
        appState: { returnTo: window.location.pathname },
      });
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  // While Auth0 checks session state, render nothing.
  // App.jsx handles the global loading screen.
  if (isLoading || !isAuthenticated) {
    return null;
  }

  return children;
}
