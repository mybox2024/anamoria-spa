// App.jsx — Anamoria SPA
// v1.10 — Session 2: add FeedbackPage route + sessionTag context (April 19, 2026)
// Changes from v1.9:
//   - Added `useMemo` to the react import list (used to stabilize the
//     AppContext value so spreading appState + sessionTag doesn't break
//     downstream memoization; see D2 session decision).
//   - Added static import for FeedbackPage (pages/FeedbackPage.jsx v1.0).
//   - Added `sessionTag` state in AppRoutes via
//     `useState(() => crypto.randomUUID())`. Regenerates per page-load
//     (refresh / hard reload resets it). Per BP1 session decision.
//     Placed in AppRoutes, not in useSessionBootstrap, per D3.
//   - Wrapped AppContext.Provider value in useMemo, combining appState
//     and sessionTag into a single stable object. Per D2 (Option B+) —
//     spread + memoize so React.memo'd consumers don't thrash.
//   - Added one <Route> for /spaces/:spaceId/feedback wrapped in
//     <ProtectedRoute>, placed immediately after /spaces/:spaceId/reminder
//     and before /leader (matches the grouping convention of space-scoped
//     routes).
//   - No other changes: no bootstrap logic changes, no modifications to
//     existing routes or their order, no changes to any other component.
//
// Previous changes (v1.9):
//   - Added static import for ReminderPage (pages/ReminderPage.jsx v1.1).
//   - Added one <Route> for /spaces/:spaceId/reminder wrapped in
//     <ProtectedRoute>, placed immediately after /spaces/:spaceId/invite
//     and before /leader (matches the grouping convention of space-scoped
//     routes per Session 1A Plan v1.0 §3.4).
//   - No other changes: no logic changes, no bootstrap changes, no
//     modifications to existing routes or their order, no changes to any
//     other component.
//
// Previous changes (v1.8):
//   - Imported new ButterflyLoader shared component
//   - Replaced the 3 full-page loading states (Auth0 init, bootstrap pending,
//     Suspense LoadingFallback) with <ButterflyLoader />
//   - Removed the now-unused text "Anamoria" + CSS spinner markup from all
//     3 spots. Old `app-loading-*` CSS classes are left untouched — they may
//     still be referenced by other files.
//   - No route changes, no logic changes, no bootstrap changes.
//
// Previous changes (v1.7):
//   - New user join now reads ana_displayName from sessionStorage (set by
//     JoinPage v1.3 name collection step) and uses it as the displayName
//     for POST /pilot/join. Fallback to auth0User.name || auth0User.nickname.
//
// Previous changes (v1.6):
//   - Added displayName and email to appState shape.
//
// Previous changes (v1.5):
//   - CheckoutPage lazy-loaded via React.lazy() + Suspense to scope Stripe.js
//     evaluation to the checkout route only.
//
// Previous changes (v1.4):
//   - Bootstrap refactored: GET /pilot/me replaces POST /pilot/activate

// v1.10: useMemo added for stable AppContext value (D2 decision).
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
import ContributorFeedPage from './pages/ContributorFeedPage';
import LeaderPage from './pages/LeaderPage';
import SettingsPage from './pages/SettingsPage';
import UpgradePage from './pages/UpgradePage';
// v1.9: ReminderPage — opt-in screen shown after first memory save per
// Reminder/Feedback/ContributorFeed Master Plan v1.0 (Session 1A scope).
import ReminderPage from './pages/ReminderPage';
// v1.10: FeedbackPage — mood-selection screen shown on qualifying saves
// per Session 2 R3 gating rules. See pages/FeedbackPage.jsx v1.0.
import FeedbackPage from './pages/FeedbackPage';
// v1.5 (Fix 4): CheckoutPage lazy-loaded to prevent Stripe.js from evaluating
// on app startup. This scopes the Stripe badge to the checkout route only.
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
import UpgradeSuccessPage from './pages/UpgradeSuccessPage';

// v1.8: Shared butterfly loader for full-page brand loading moments
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

// v1.8: Loading fallback for lazy-loaded components (Suspense boundary)
// Replaces previous text + spinner with the butterfly brand loader.
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

  // v1.10: sessionTag — per-page-load UUID used by FeedbackPage to group
  // analytics events from a single visit. Lazy initializer runs exactly
  // once per component mount; refresh/hard-reload regenerates (correct per
  // BP1). Placed here rather than in useSessionBootstrap per D3 decision:
  // sessionTag is an app-level per-visit concern, not an identity concern,
  // so it lives next to the other AppRoutes-level state.
  const [sessionTag] = useState(() => crypto.randomUUID());

  const appState = useSessionBootstrap(isAuthenticated, getAccessTokenSilently, user);

  // v1.10: Stable context value per D2 (Option B+). useMemo recomputes only
  // when appState or sessionTag identity changes, so consumers wrapped in
  // React.memo keep their memoization working. Without useMemo, the spread
  // would produce a new object every render and defeat any downstream
  // memoization (per React.dev memo guidance + Kent C. Dodds optimize-context).
  const contextValue = useMemo(
    () => ({ ...appState, sessionTag }),
    [appState, sessionTag]
  );

  // v1.8: Auth0 initializing — butterfly loader
  if (isLoading) {
    return <ButterflyLoader />;
  }

  // v1.8: Authenticated but bootstrap not yet complete — butterfly loader
  if (isAuthenticated && !appState.bootstrapped) {
    return <ButterflyLoader />;
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
    <AppContext.Provider value={contextValue}>
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
          {/* v1.9: Reminder opt-in screen — Session 1A. Placed after /invite
              and before /leader to keep space-scoped routes grouped. */}
          <Route
            path="/spaces/:spaceId/reminder"
            element={
              <ProtectedRoute>
                <ReminderPage />
              </ProtectedRoute>
            }
          />
          {/* v1.10: Feedback opt-in screen — Session 2. Placed immediately
              after /reminder to keep space-scoped gating screens grouped. */}
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
