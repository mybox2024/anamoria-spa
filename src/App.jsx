// App.jsx — Anamoria SPA
// v1.15 — Tier A Frontend Optimizations (April 22, 2026)
// Changes from v1.14:
//   - A-1: Parallelize bootstrap — /pilot/me + /spaces via Promise.all
//     (~600-1,000ms cold, ~200ms warm savings vs serial awaits)
//   - A-4: Added updateSpaces callback to AppContext so SpacePage sidebar
//     and CreateSpaceModal can update the spaces list without re-fetching.
//   - Zero route changes, zero auth changes.
//
// Previous changes (v1.14):
//   - Added MyRequestsPage import and /settings/my-requests protected route
//   - Zero bootstrap or context changes
//
// Previous changes (v1.12):
//   - useSessionBootstrap returns { appState, setAppState }
//   - updateProfile callback in context
//
// Previous changes (v1.11):
//   - Added 4 static imports for new contributor pages:
//     ContributorHomePage, ContributorRecordPage, ContributorWritePage,
//     ContributorPhotoPage (all in pages/).
//   - Restructured contributor routing to match LWC axr_MemoryVaultV2
//     two-screen flow + three capture pages:
//       /contribute/:spaceId            → ContributorHomePage   (CHANGED
//         from ContributorFeedPage — landing page with "You've been
//         invited to contribute" CTAs)
//       /contribute/:spaceId/memories   → ContributorFeedPage   (NEW route
//         — feed screen reached via "View shared memories →" link from
//         HomePage; back chevron on feed returns to HomePage)
//       /contribute/:spaceId/record     → ContributorRecordPage (NEW)
//       /contribute/:spaceId/write      → ContributorWritePage  (NEW)
//       /contribute/:spaceId/photo      → ContributorPhotoPage  (NEW)
//     All 5 contributor routes remain in the "Public (no auth)" block
//     because contributors authenticate via session token (in sessionStorage,
//     set by ContributorLandingPage.jsx on claim), not Auth0 JWT.
//     ProtectedRoute would require a JWT and reject contributors.
//   - No other changes: no bootstrap logic changes, no changes to any other
//     route, no context changes, no hook changes, no component changes
//     outside imports and the contributor route block.
//
// React Router v6 matches routes by specificity, not declaration order, so
// /contribute/:spaceId/memories is correctly distinguished from
// /contribute/:spaceId without path ordering gymnastics. The ordering below
// is purely hierarchical for readability.
//
// Auth strategy for contributor routes (unchanged pattern from v1.10):
//   - No ProtectedRoute wrapper.
//   - Each contributor page component reads ana_sessionToken from
//     sessionStorage via getSessionToken() helper on mount.
//   - If no token present, page renders "session expired" state with
//     guidance to re-use invite link.
//   - API calls flow through createContributorApiClient (api/contributorApi.js)
//     which injects x-session-token + x-api-key headers.
//
// Previous changes (v1.10):
//   - Added FeedbackPage route + sessionTag context (Session 2).
//
// Previous changes (v1.9):
//   - Added ReminderPage route (Session 1A).
//
// [Earlier change history unchanged from v1.10 header.]

import { createContext, useContext, useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
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
// v1.11: Session 3 — contributor landing page (Screen 1 per LWC
// axr_MemoryVaultV2 contributor-landing-screen block).
import ContributorHomePage from './pages/ContributorHomePage';
import ContributorFeedPage from './pages/ContributorFeedPage';
// v1.11: Session 3 — contributor capture pages.
import ContributorRecordPage from './pages/ContributorRecordPage';
import ContributorWritePage from './pages/ContributorWritePage';
import ContributorPhotoPage from './pages/ContributorPhotoPage';
import LeaderPage from './pages/LeaderPage';
import SettingsPage from './pages/SettingsPage';
import UpgradePage from './pages/UpgradePage';
import ReminderPage from './pages/ReminderPage';
import FeedbackPage from './pages/FeedbackPage';
// v1.14: Phase D — full request history page
import MyRequestsPage from './pages/MyRequestsPage';
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
import UpgradeSuccessPage from './pages/UpgradeSuccessPage';

import ButterflyLoader from './components/ButterflyLoader';

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

function LoadingFallback() {
  return <ButterflyLoader />;
}

// ─── Session bootstrap ────────────────────────────────────────────────────
// Runs once after Auth0 confirms the user is authenticated.
// Identity Bootstrap Plan v1.0:
//   - GET /pilot/me first (DB is source of truth)
//   - 200 = returning user → set appState, load spaces, route
//   - 404 = new user → check sessionStorage for groupId → POST /pilot/join
//   - localStorage is never read or written for identity keys
//
// v1.12: Returns { appState, setAppState } instead of appState alone.
// setAppState is consumed by AppRoutes to create the updateProfile callback.

function useSessionBootstrap(isAuthenticated, getAccessTokenSilently, auth0User) {
  const navigate = useNavigate();
  const [appState, setAppState] = useState({
    bootstrapped: false,
    bootstrapError: null,
    userId: null,
    displayName: null,
    email: null,
    pilotRole: null,
    groupId: null,
    groupName: null,
    spaces: [],
    currentSpace: null,
  });

  const bootstrap = useCallback(async () => {
    const api = createApiClient(getAccessTokenSilently);

    try {
      // A-1: Parallel bootstrap — /pilot/me and /spaces are independent.
      // Saves ~600-1,000ms cold, ~200ms warm vs serial awaits.
      const [meData, spacesData] = await Promise.all([
        api.get('/pilot/me'),
        api.get('/spaces'),
      ]);
      const spaces = spacesData.spaces || [];
      const currentSpace = spaces[0] || null;

      setAppState({
        bootstrapped: true,
        bootstrapError: null,
        userId: meData.userId,
        displayName: meData.displayName || null,
        email: meData.email || null,
        pilotRole: meData.pilotRole,
        groupId: meData.groupId,
        groupName: meData.groupName,
        spaces,
        currentSpace,
      });

      if (spaces.length === 0) {
        navigate('/spaces/new', { replace: true });
      } else {
        navigate(`/spaces/${currentSpace.id}`, { replace: true });
      }

    } catch (err) {
      console.error('Bootstrap error:', err);

      if (err.status === 404 && err.error === 'USER_NOT_FOUND') {
        const groupId = sessionStorage.getItem('ana_groupId');
        const groupName = sessionStorage.getItem('ana_groupName');
        const collectedName = sessionStorage.getItem('ana_displayName');

        if (!groupId) {
          navigate('/join', { replace: true });
          setAppState(prev => ({ ...prev, bootstrapped: true }));
          return;
        }

        try {
          const joinData = await api.post('/pilot/join', {
            groupId,
            email: auth0User?.email || '',
            displayName: collectedName || auth0User?.name || auth0User?.nickname || '',
          });

          sessionStorage.removeItem('ana_groupId');
          sessionStorage.removeItem('ana_groupName');
          sessionStorage.removeItem('ana_displayName');

          setAppState({
            bootstrapped: true,
            bootstrapError: null,
            userId: joinData.userId,
            displayName: joinData.displayName || null,
            email: joinData.email || null,
            pilotRole: joinData.pilotRole,
            groupId: joinData.groupId,
            groupName: joinData.groupName,
            spaces: [],
            currentSpace: null,
          });

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

  // v1.12: Return both appState and setAppState so AppRoutes can create
  // the updateProfile callback without exposing raw setAppState in context.
  return { appState, setAppState };
}

// ─── Inner app (inside BrowserRouter + AuthProvider) ─────────────────────

function AppRoutes() {
  const { isLoading, isAuthenticated, getAccessTokenSilently, user } = useAuth0();

  const [sessionTag] = useState(() => crypto.randomUUID());

  // v1.12: Destructure both appState and setAppState from hook
  const { appState, setAppState } = useSessionBootstrap(isAuthenticated, getAccessTokenSilently, user);

  // v1.12: Narrow updateProfile action — whitelists displayName and email only.
  // Consumed by SettingsPage v2.6 AccountPanel after successful PATCH /pilot/me.
  // If a future developer adds a new editable field, they must also add it to
  // ALLOWED here. This is intentional friction to prevent accidental context
  // pollution from an unvetted field.
  const updateProfile = useCallback((updates) => {
    const ALLOWED = ['displayName', 'email'];
    setAppState(prev => {
      const filtered = Object.fromEntries(
        Object.entries(updates).filter(([k, v]) => ALLOWED.includes(k) && v !== undefined)
      );
      if (Object.keys(filtered).length === 0) return prev;
      return { ...prev, ...filtered };
    });
  }, [setAppState]);

  // A-4: Callback for SpacePage/CreateSpaceModal to update the spaces list
  // in context after creating a new space. Avoids re-fetching /spaces.
  const updateSpaces = useCallback((newSpaces) => {
    setAppState(prev => ({ ...prev, spaces: newSpaces }));
  }, [setAppState]);

  const contextValue = useMemo(
    () => ({ ...appState, sessionTag, updateProfile, updateSpaces }),
    [appState, sessionTag, updateProfile, updateSpaces]
  );

  if (isLoading) {
    return <ButterflyLoader />;
  }

  if (isAuthenticated && !appState.bootstrapped) {
    return <ButterflyLoader />;
  }

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
    <AppContext.Provider value={contextValue}>
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
            path="/spaces/:spaceId/reminder"
            element={
              <ProtectedRoute>
                <ReminderPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/spaces/:spaceId/feedback"
            element={
              <ProtectedRoute>
                <FeedbackPage />
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

          {/* ── Contributor public routes (session token auth) ───── */}
          {/* v1.11 restructure per Session 3 (LWC axr_MemoryVaultV2 parity):
              Landing /invite/:token → claim → redirect to
              /contribute/:spaceId (ContributorHomePage).
              From there, "View shared memories →" → /memories feed,
              bottom nav → /record | /write | /photo capture pages.
              All 5 routes below remain public — session-token auth is
              handled by each page component via getSessionToken(). */}
          <Route path="/invite/:token" element={<ContributorLandingPage />} />
          <Route path="/contribute/:spaceId" element={<ContributorHomePage />} />
          <Route path="/contribute/:spaceId/memories" element={<ContributorFeedPage />} />
          <Route path="/contribute/:spaceId/record" element={<ContributorRecordPage />} />
          <Route path="/contribute/:spaceId/write" element={<ContributorWritePage />} />
          <Route path="/contribute/:spaceId/photo" element={<ContributorPhotoPage />} />

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
          {/* v1.14: Phase D — request history */}
          <Route
            path="/settings/my-requests"
            element={
              <ProtectedRoute>
                <MyRequestsPage />
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
