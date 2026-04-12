// App.jsx — Anamoria SPA
// v1.4 — April 11, 2026
// Changes from v1.3:
//   - Bootstrap refactored: GET /pilot/me replaces POST /pilot/activate
//     (Identity Bootstrap Plan v1.0)
//   - New user flow: 404 from /me → POST /pilot/join (if groupId in sessionStorage)
//   - localStorage no longer read or written for identity keys
//   - sessionStorage used for groupId/groupName (survives Auth0 redirect, cleared after join)
// Changes from v1.2:
//   - Added Settings shell route (/settings)
//   - Added B1 Pricing route (/settings/upgrade)
//   - Added B2 Checkout route (/settings/upgrade/checkout)
//   - Added B3 Success route (/settings/upgrade/success)
// Changes from v1.1:
//   - Bootstrap passes Auth0 user.email + user.name to POST /pilot/activate
//   - Fixes blank email/display_name bug in users table
// Added in v1.1: /leader route for pilot group leaders
//
// Boot sequence (runs after every Auth0 login):
//   1. Auth0 checks session → isAuthenticated
//   2. GET /pilot/me → 200 (returning user) or 404 (new user)
//   3. If 200: GET /spaces → route normally
//   4. If 404 + groupId in sessionStorage: POST /pilot/join → /consent
//   5. If 404 + no groupId: redirect to /join
//
// AppState stored in React context so all pages can read userId, currentSpace, etc.

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
import CheckoutPage from './pages/CheckoutPage';
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
            displayName: auth0User?.name || auth0User?.nickname || '',
          });

          // Clear sessionStorage after successful join
          sessionStorage.removeItem('ana_groupId');
          sessionStorage.removeItem('ana_groupName');

          setAppState({
            bootstrapped: true,
            bootstrapError: null,
            userId: joinData.userId,
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
