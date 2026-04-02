// App.jsx — Anamoria SPA
// Step 3: Session bootstrap wired.
//
// Boot sequence (runs after every Auth0 login):
//   1. Auth0 checks session → isAuthenticated
//   2. POST /pilot/activate (groupId from localStorage) → userId, isNewUser, pilotRole
//   3. GET /spaces → spaces[]
//   4. Route:
//      - no consent yet (isNewUser) → /consent
//      - no spaces            → /spaces/new
//      - has space            → /spaces/:id
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
// Calls activate + spaces, then navigates to the correct screen.

function useSessionBootstrap(isAuthenticated, getAccessTokenSilently) {
  const navigate = useNavigate();
  const [appState, setAppState] = useState({
    bootstrapped: false,   // true after activate + spaces calls complete
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

    // Read groupId stored by JoinPage before Auth0 redirect
    const groupId = localStorage.getItem('ana_groupId');
    const groupName = localStorage.getItem('ana_groupName');

    try {
      // Step 1: activate — creates or links user in DB
      const activateBody = { groupId, displayName: '' };
      const activateData = await api.post('/pilot/activate', activateBody);

      // Step 2: list spaces
      const spacesData = await api.get('/spaces');
      const spaces = spacesData.spaces || [];
      const currentSpace = spaces[0] || null;

      setAppState({
        bootstrapped: true,
        bootstrapError: null,
        userId: activateData.userId,
        pilotRole: activateData.pilotRole,
        groupId: activateData.groupId,
        groupName: activateData.groupName || groupName,
        spaces,
        currentSpace,
      });

      // Step 3: route based on state
      if (activateData.isNewUser) {
        navigate('/consent', { replace: true });
      } else if (spaces.length === 0) {
        navigate('/spaces/new', { replace: true });
      } else {
        navigate(`/spaces/${currentSpace.id}`, { replace: true });
      }

    } catch (err) {
      console.error('Bootstrap error:', err);

      // If activate fails because no groupId (returning user direct login),
      // still try to load spaces and route accordingly
      if (err.error === 'MISSING_GROUP_ID' || !groupId) {
        try {
          const spacesData = await api.get('/spaces');
          const spaces = spacesData.spaces || [];
          const currentSpace = spaces[0] || null;

          setAppState(prev => ({
            ...prev,
            bootstrapped: true,
            bootstrapError: null,
            spaces,
            currentSpace,
          }));

          if (spaces.length === 0) {
            navigate('/spaces/new', { replace: true });
          } else {
            navigate(`/spaces/${currentSpace.id}`, { replace: true });
          }
          return;
        } catch (spacesErr) {
          console.error('Spaces fallback error:', spacesErr);
        }
      }

      setAppState(prev => ({
        ...prev,
        bootstrapped: true,
        bootstrapError: err.error || 'BOOTSTRAP_FAILED',
      }));
    }
  }, [getAccessTokenSilently, navigate]);

  useEffect(() => {
    if (isAuthenticated && !appState.bootstrapped) {
      bootstrap();
    }
  }, [isAuthenticated, appState.bootstrapped, bootstrap]);

  return appState;
}

// ─── Inner app (inside BrowserRouter + AuthProvider) ─────────────────────

function AppRoutes() {
  const { isLoading, isAuthenticated, getAccessTokenSilently } = useAuth0();
  const appState = useSessionBootstrap(isAuthenticated, getAccessTokenSilently);

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

        {/* ── Public (no auth) ────────────────────────────────── */}
        <Route path="/invite/:token" element={<ContributorLandingPage />} />
        <Route path="/contribute/:spaceId" element={<ContributorFeedPage />} />

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
