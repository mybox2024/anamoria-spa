// App.jsx — Anamoria SPA
// v1.7 — Read ana_displayName from sessionStorage for new user join (April 15, 2026)
// Changes from v1.6:
//   - New user join now reads ana_displayName from sessionStorage (set by JoinPage v1.3
//     name collection step) and uses it as the displayName for POST /pilot/join.
//     Fallback: if ana_displayName is absent (e.g. user skipped name step), falls back
//     to auth0User.name || auth0User.nickname (previous behavior).
//   - ana_displayName cleared from sessionStorage alongside ana_groupId and ana_groupName.
//   - No route changes. No returning-user flow changes.
//
// Previous changes (v1.6):
//   - Added displayName and email to appState shape.
//     GET /pilot/me and POST /pilot/join both return these fields but they
//     were not being captured in appState. SpacePage and SettingsPage now
//     read appState.displayName for the sidebar/account display name
//     (fixes Auth0 passwordless OTP showing email instead of name).
//
// Previous changes (v1.5):
//   - Fix 4: CheckoutPage is now lazy-loaded via React.lazy() + Suspense.
//     Previously, importing CheckoutPage at the top of App.jsx caused the
//     @stripe/stripe-js module to evaluate on app startup, which injected
//     Stripe's global badge element ("Powered by Stripe") into the DOM on
//     every page — not just the checkout page. Lazy-loading defers the
//     module evaluation until the user navigates to /settings/upgrade/checkout.
//   - Added React.lazy and Suspense imports
//   - Added LoadingFallback component for Suspense boundary
//   - All routes and route paths UNCHANGED
//   - Boot sequence, AppContext, and all other components UNCHANGED
//
// Previous changes (v1.4):
//   - Bootstrap refactored: GET /pilot/me replaces POST /pilot/activate
//   - New user flow: 404 from /me → POST /pilot/join (if groupId in sessionStorage)
//   - sessionStorage used for groupId/groupName
//
// Boot sequence (runs after every Auth0 login):
//   1. Auth0 checks session → isAuthenticated
//   2. GET /pilot/me → 200 (returning user) or 404 (new user)
//   3. If 200: GET /spaces → route normally
//   4. If 404 + groupId in sessionStorage: POST /pilot/join → /consent
//   5. If 404 + no groupId: redirect to /join

import { createContext, useContext, useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';

import AuthProvider from './auth/AuthProvider';
import ProtectedRoute from './auth/ProtectedRoute';
import { createApiClient } from './api/client';

import JoinPage from './pages/JoinPage';
import ConsentPage from './pages/ConsentPage';
import CreateSpacePage from './pages/CreateSpacePage';
import SpacePage from './pages/SpacePage';
import RecordPage from './pages/RecordPage';
import WritePage from './pages/WritePage';
import PhotoPage from './pages/PhotoPage';
import MemoryDetailPage from './pages/MemoryDetailPage';
import InvitePage from './pages/InvitePage';
import ContributorLandingPage from './pages/ContributorLandingPage';
import ContributorFeedPage from './pages/ContributorFeedPage';
import LeaderPage from './pages/LeaderPage';
import SettingsPage from './pages/SettingsPage';
import UpgradePage from './pages/UpgradePage';
// v1.5 (Fix 4): CheckoutPage lazy-loaded to prevent Stripe.js from evaluating
// on app startup. This scopes the Stripe badge to the checkout route only.
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
import UpgradeSuccessPage from './pages/UpgradeSuccessPage';

// ─── App context — shared state across all pages ──────────────────────────

const AppContext = createContext(null);
export function useAppContext() {
  return useContext(AppContext);
}

// ─── Placeholder pages (replaced step by step) ───────────────────────────

function PlaceholderPage({ name }) {
  return (
    <div style={{ padding: 32, fontFamily: 'sans-serif', color: '#2d3436' }}>
      <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7c9885' }}>
        Anamoria
      </p>
      <h2 style={{ marginTop: 8, fontSize: 20 }}>{name}</h2>
      <p style={{ marginTop: 8, fontSize: 14, color: '#737373' }}>
        This screen is built in a later step.
      </p>
    </div>
  );
}

// v1.5: Loading fallback for lazy-loaded components (Suspense boundary)
function LoadingFallback() {
  return (
    <div className="app-loading">
      <span className="app-loading-logo">Anamoria</span>
      <div className="app-loading-spinner" aria-label="Loading" />
    </div>
  );
}

// ─── Session bootstrap ────────────────────────────────────────────────────
// Runs once after Auth0 confirms the user is authenticated.
// Identity Bootstrap Plan v1.0:
//   - GET /pilot/me first (DB is source of truth)
//   - 200 = returning user → set appState, load spaces, route
//   - 404 = new user → check sessionStorage for groupId → POST /pilot/join
//   - localStorage is never read or written for identity keys

function useSessionBootstrap(isAuthenticated, getAccessTokenSilently, auth0User) {
  const navigate = useNavigate();
  const [appState, setAppState] = useState({
    bootstrapped: false,   // true after /me + spaces calls complete
    bootstrapError: null,  // error message if bootstrap fails
    userId: null,
    displayName: null,     // v1.6: from GET /pilot/me or POST /pilot/join (DB source of truth)
    email: null,           // v1.6: from GET /pilot/me or POST /pilot/join
    pilotRole: null,
    groupId: null,
    groupName: null,
    spaces: [],
    currentSpace: null,
  });

  const bootstrap = useCallback(async () => {
    const api = createApiClient(getAccessTokenSilently);

    try {
      // Step 1: GET /pilot/me — identity lookup by auth0_sub
      const meData = await api.get('/pilot/me');

      // Step 2: returning user — load spaces
      const spacesData = await api.get('/spaces');
      const spaces = spacesData.spaces || [];
      const currentSpace = spaces[0] || null;

      setAppState({
        bootstrapped: true,
        bootstrapError: null,
        userId: meData.userId,
        displayName: meData.displayName || null,  // v1.6
        email: meData.email || null,              // v1.6
        pilotRole: meData.pilotRole,
        groupId: meData.groupId,
        groupName: meData.groupName,
        spaces,
        currentSpace,
      });

      // Step 3: route based on state
      if (spaces.length === 0) {
        navigate('/spaces/new', { replace: true });
      } else {
        navigate(`/spaces/${currentSpace.id}`, { replace: true });
      }

    } catch (err) {
      console.error('Bootstrap error:', err);

      // 404 from GET /pilot/me = new user
      if (err.status === 404 && err.error === 'USER_NOT_FOUND') {
        // Check sessionStorage for groupId from validate-code flow
        const groupId = sessionStorage.getItem('ana_groupId');
        const groupName = sessionStorage.getItem('ana_groupName');
        // v1.7: Read display name collected by JoinPage v1.3 name step
        const collectedName = sessionStorage.getItem('ana_displayName');

        if (!groupId) {
          // No groupId — user reached app without completing access code flow
          navigate('/join', { replace: true });
          setAppState(prev => ({ ...prev, bootstrapped: true }));
          return;
        }

        // New user with groupId — register via POST /pilot/join
        try {
          const joinData = await api.post('/pilot/join', {
            groupId,
            email: auth0User?.email || '',
            // v1.7: Prefer name from JoinPage step 2, fall back to Auth0 profile
            displayName: collectedName || auth0User?.name || auth0User?.nickname || '',
          });

          // Clear sessionStorage after successful join
          sessionStorage.removeItem('ana_groupId');
          sessionStorage.removeItem('ana_groupName');
          sessionStorage.removeItem('ana_displayName');  // v1.7

          setAppState({
            bootstrapped: true,
            bootstrapError: null,
            userId: joinData.userId,
            displayName: joinData.displayName || null,  // v1.6
            email: joinData.email || null,              // v1.6
            pilotRole: joinData.pilotRole,
            groupId: joinData.groupId,
            groupName: joinData.groupName,
            spaces: [],
            currentSpace: null,
          });

          // New user always goes to consent
          navigate('/consent', { replace: true });
          return;
        } catch (joinErr) {
          console.error('Join error:', joinErr);
          setAppState(prev => ({
            ...prev,
            bootstrapped: true,
            bootstrapError: joinErr.error || 'JOIN_FAILED',
          }));
          return;
        }
      }

      // Any other error (500, network failure) — show error screen
      setAppState(prev => ({
        ...prev,
        bootstrapped: true,
        bootstrapError: err.error || 'BOOTSTRAP_FAILED',
      }));
    }
  }, [getAccessTokenSilently, navigate, auth0User]);

  useEffect(() => {
    if (isAuthenticated && !appState.bootstrapped) {
      bootstrap();
    }
  }, [isAuthenticated, appState.bootstrapped, bootstrap]);

  return appState;
}

// ─── Inner app (inside BrowserRouter + AuthProvider) ─────────────────────

function AppRoutes() {
  const { isLoading, isAuthenticated, getAccessTokenSilently, user } = useAuth0();
  const appState = useSessionBootstrap(isAuthenticated, getAccessTokenSilently, user);

  // Auth0 initializing
  if (isLoading) {
    return (
      <div className="app-loading">
        <span className="app-loading-logo">Anamoria</span>
        <div className="app-loading-spinner" aria-label="Loading" />
      </div>
    );
  }

  // Authenticated but bootstrap not yet complete — show loading
  if (isAuthenticated && !appState.bootstrapped) {
    return (
      <div className="app-loading">
        <span className="app-loading-logo">Anamoria</span>
        <div className="app-loading-spinner" aria-label="Loading" />
      </div>
    );
  }

  // Bootstrap failed
  if (isAuthenticated && appState.bootstrapError) {
    return (
      <div className="app-error">
        <h2>Something went wrong</h2>
        <p>We couldn't load your account. Please try again.</p>
        <button
          className="app-error-btn"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <AppContext.Provider value={appState}>
      {/* v1.5: Suspense boundary wraps Routes for lazy-loaded CheckoutPage */}
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* ── Public ───────────────────────────────────────────── */}
          <Route path="/join" element={<JoinPage />} />

          {/* ── Protected ─────────────────────────────────────────── */}
          <Route
            path="/consent"
            element={
              <ProtectedRoute>
                <ConsentPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/spaces/new"
            element={
              <ProtectedRoute>
                <CreateSpacePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/spaces/:spaceId"
            element={
              <ProtectedRoute>
                <SpacePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/spaces/:spaceId/record"
            element={
              <ProtectedRoute>
                <RecordPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/spaces/:spaceId/write"
            element={
              <ProtectedRoute>
                <WritePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/spaces/:spaceId/photo"
            element={
              <ProtectedRoute>
                <PhotoPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/spaces/:spaceId/memories/:memId"
            element={
              <ProtectedRoute>
                <MemoryDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/spaces/:spaceId/invite"
            element={
              <ProtectedRoute>
                <InvitePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leader"
            element={
              <ProtectedRoute>
                <LeaderPage />
              </ProtectedRoute>
            }
          />

          {/* ── Public (no auth) ────────────────────────────────── */}
          <Route path="/invite/:token" element={<ContributorLandingPage />} />
          <Route path="/contribute/:spaceId" element={<ContributorFeedPage />} />

          {/* ── Settings + Billing (B1–B3) ───────────────────────── */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/upgrade"
            element={
              <ProtectedRoute>
                <UpgradePage />
              </ProtectedRoute>
            }
          />
          {/* v1.5: CheckoutPage is lazy-loaded — Suspense boundary above handles fallback */}
          <Route
            path="/settings/upgrade/checkout"
            element={
              <ProtectedRoute>
                <CheckoutPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/upgrade/success"
            element={
              <ProtectedRoute>
                <UpgradeSuccessPage />
              </ProtectedRoute>
            }
          />

          {/* ── Fallback ──────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/join" replace />} />
        </Routes>
      </Suspense>
    </AppContext.Provider>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
