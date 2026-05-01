// App.jsx — Anamoria SPA
// v1.19 — May 1, 2026 — Surface consent record in appState
// Changes from v1.18:
//   - appState now includes consentDate and consentPolicyVersion. The Lambda's
//     GET /pilot/me has been returning these since pilotaccessindex.mjs v1.5
//     (LATERAL JOIN against consent_records), but the bootstrap was dropping
//     them on the floor. SettingsPage Account panel reads them — without this
//     fix it always shows "No consent record on file."
//   - Three setAppState blocks updated to capture the fields:
//       (1) Returning user — Promise.all(/pilot/me, /spaces) success
//       (2) New user post-join — joinData has no consent yet, set both null
//       (3) 409 retry — same as (1)
//   - NEW: updateConsent context callback — whitelists consentDate /
//     consentPolicyVersion. Called by ConsentPage v1.2 after successful
//     POST /pilot/consent so the Settings panel reflects the new consent
//     immediately, no hard refresh required. Uses createdAt from the Lambda
//     response (DB-authoritative, no client-side fabrication, no extra HTTP).
//   - Pattern mirrors existing updateProfile callback exactly.
//   - Zero route changes, zero auth changes, zero Lambda changes.
//
// Previous changes (v1.18): Personal invite token support
// Changes from v1.17:
//   - Bootstrap join flow passes ana_inviteToken from sessionStorage to
//     POST /pilot/join (inviteToken field). Token is claimed atomically
//     with user creation on the server.
//   - NEW error: EMAIL_MISMATCH — shown when Auth0 login email doesn't
//     match the invite token's email. Non-retryable, with "Start over" link.
//   - NEW route: /join/invite/:token → JoinPage (public, no auth)
//   - sessionStorage cleanup includes ana_inviteToken after successful join.
//
// Previous changes (v1.17): BP-1a Fix 5: Bootstrap join error recovery (April 27, 2026)
// Changes from v1.16:
//   - 409 USER_ALREADY_EXISTS recovery: retry GET /pilot/me + /spaces,
//     route normally instead of showing generic error screen.
//   - 403 join errors (GROUP_NOT_ACTIVE, EMAIL_NOT_ALLOWED, USER_DEACTIVATED):
//     show specific empathetic message + "Start over" link to /join.
//     These are non-retryable — retrying won't help.
//   - bootstrapError shape changed from string to object:
//     { code, message, retryable } — no downstream consumers affected
//     (only read by the error screen in AppRoutes).
//   - Generic bootstrap error screen updated:
//     "We couldn't open Anamoria just now." + "Your memories are safe."
//   - Zero route changes, zero import changes, zero context shape changes.
//
// Previous changes (v1.16):
//   - Added PWAUpdatePrompt import + render (shows "new version available" banner)
//   - Zero route changes, zero auth changes, zero bootstrap changes.
//
// Previous changes (v1.15):
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
import PWAUpdatePrompt from './components/PWAUpdatePrompt';

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
// v1.17 (Fix 5): Join error recovery:
//   - 409 USER_ALREADY_EXISTS → retry /me + /spaces → route normally
//   - 403 GROUP_NOT_ACTIVE / EMAIL_NOT_ALLOWED / USER_DEACTIVATED →
//     specific empathetic message, non-retryable, "Start over" link
//   - All other errors → generic retryable error screen
//   - bootstrapError shape: { code, message, retryable } (was string)
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
    consentDate: null,
    consentPolicyVersion: null,
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
        consentDate: meData.consentDate || null,
        consentPolicyVersion: meData.consentPolicyVersion || null,
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
          // v1.18: Include invite token if present (personal invite flow)
          const inviteToken = sessionStorage.getItem('ana_inviteToken');
          const joinPayload = {
            groupId,
            email: auth0User?.email || '',
            displayName: collectedName || auth0User?.name || auth0User?.nickname || '',
          };
          if (inviteToken) {
            joinPayload.inviteToken = inviteToken;
          }

          const joinData = await api.post('/pilot/join', joinPayload);

          sessionStorage.removeItem('ana_groupId');
          sessionStorage.removeItem('ana_groupName');
          sessionStorage.removeItem('ana_displayName');
          sessionStorage.removeItem('ana_inviteToken');

          setAppState({
            bootstrapped: true,
            bootstrapError: null,
            userId: joinData.userId,
            displayName: joinData.displayName || null,
            email: joinData.email || null,
            pilotRole: joinData.pilotRole,
            groupId: joinData.groupId,
            groupName: joinData.groupName,
            // v1.19: User has not consented yet — about to navigate to /consent.
            // ConsentPage v1.2 calls updateConsent() with DB-authoritative values
            // immediately after POST /pilot/consent succeeds, so these fill in
            // before the user can reach the Settings panel.
            consentDate: null,
            consentPolicyVersion: null,
            spaces: [],
            currentSpace: null,
          });

          navigate('/consent', { replace: true });
          return;
        } catch (joinErr) {
          console.error('Join error:', joinErr);

          // v1.17 Fix 5: 409 = user already exists (double-tap, race condition).
          // The first request created the user; retry /me to pick them up.
          if (joinErr.status === 409 && joinErr.error === 'USER_ALREADY_EXISTS') {
            try {
              const [retryMe, retrySpaces] = await Promise.all([
                api.get('/pilot/me'),
                api.get('/spaces'),
              ]);
              const spaces = retrySpaces.spaces || [];
              setAppState({
                bootstrapped: true,
                bootstrapError: null,
                userId: retryMe.userId,
                displayName: retryMe.displayName || null,
                email: retryMe.email || null,
                pilotRole: retryMe.pilotRole,
                groupId: retryMe.groupId,
                groupName: retryMe.groupName,
                consentDate: retryMe.consentDate || null,
                consentPolicyVersion: retryMe.consentPolicyVersion || null,
                spaces,
                currentSpace: spaces[0] || null,
              });
              if (spaces.length === 0) {
                navigate('/spaces/new', { replace: true });
              } else {
                navigate(`/spaces/${spaces[0].id}`, { replace: true });
              }
              return;
            } catch (retryErr) {
              console.error('409 retry failed:', retryErr);
              // Fall through to generic error below
            }
          }

          // v1.17 Fix 5: 403 = access denied. Show specific empathetic message.
          // These are NOT transient — retrying won't help.
          if (joinErr.status === 403) {
            const JOIN_403_MESSAGES = {
              GROUP_NOT_ACTIVE: "This space isn't open just yet. Your group leader will know when it's ready.",
              EMAIL_NOT_ALLOWED: "We couldn't find your email in this space. Your group leader can add you, or help sort it out.",
              USER_DEACTIVATED: "Your access to this space is paused. Your group leader can help you with next steps.",
              EMAIL_MISMATCH: "The email you signed in with doesn't match this invite. Please sign in with the email address your invite was sent to.",
            };
            const message = JOIN_403_MESSAGES[joinErr.error] || null;
            setAppState(prev => ({
              ...prev,
              bootstrapped: true,
              bootstrapError: {
                code: joinErr.error || 'ACCESS_DENIED',
                message: message || "We weren't able to set up your account. Your group leader can help.",
                retryable: false,
              },
            }));
            return;
          }

          // All other join errors — generic retryable
          setAppState(prev => ({
            ...prev,
            bootstrapped: true,
            bootstrapError: {
              code: joinErr.error || 'JOIN_FAILED',
              message: null,
              retryable: true,
            },
          }));
          return;
        }
      }

      // v1.17: All other bootstrap errors — generic retryable
      setAppState(prev => ({
        ...prev,
        bootstrapped: true,
        bootstrapError: {
          code: err.error || 'BOOTSTRAP_FAILED',
          message: null,
          retryable: true,
        },
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

  // v1.19: Narrow updateConsent action — whitelists consentDate and
  // consentPolicyVersion only. Consumed by ConsentPage v1.2 after a successful
  // POST /pilot/consent so the SettingsPage Account panel reflects the new
  // consent record immediately, no hard refresh required.
  //
  // Caller passes the createdAt value from the Lambda response (DB-authoritative
  // — comes from RETURNING created_at on the INSERT), and the policyVersion
  // the page just submitted. Same values the next /pilot/me fetch would return.
  //
  // Same intentional-friction whitelist pattern as updateProfile: any future
  // consent-related field must be explicitly added to ALLOWED here before it
  // can flow into context.
  const updateConsent = useCallback((updates) => {
    const ALLOWED = ['consentDate', 'consentPolicyVersion'];
    setAppState(prev => {
      const filtered = Object.fromEntries(
        Object.entries(updates).filter(([k, v]) => ALLOWED.includes(k) && v !== undefined)
      );
      if (Object.keys(filtered).length === 0) return prev;
      return { ...prev, ...filtered };
    });
  }, [setAppState]);

  const contextValue = useMemo(
    () => ({ ...appState, sessionTag, updateProfile, updateSpaces, updateConsent }),
    [appState, sessionTag, updateProfile, updateSpaces, updateConsent]
  );

  if (isLoading) {
    return <ButterflyLoader />;
  }

  if (isAuthenticated && !appState.bootstrapped) {
    return <ButterflyLoader />;
  }

  if (isAuthenticated && appState.bootstrapError) {
    const { message, retryable } = appState.bootstrapError;

    // v1.17 Fix 5: Non-retryable errors (403 join failures) —
    // show specific message + "Start over" link. No retry button.
    if (!retryable && message) {
      return (
        <div className="app-error">
          <p className="app-error-message">{message}</p>
          <a
            className="app-error-link"
            href="/join"
            onClick={(e) => {
              e.preventDefault();
              // Clear stale session data so the join flow starts fresh
              sessionStorage.removeItem('ana_groupId');
              sessionStorage.removeItem('ana_groupName');
              sessionStorage.removeItem('ana_displayName');
              sessionStorage.removeItem('ana_inviteToken');
              window.location.href = '/join';
            }}
          >
            Start over with a different code
          </a>
        </div>
      );
    }

    // v1.17 Fix 5: Retryable errors (500, network, unknown) —
    // updated copy per Error Message Catalog v1.0, Category 3.
    return (
      <div className="app-error">
        <h2>We couldn't open Anamoria just now.</h2>
        <p>Your memories are safe. Try once more, or come back in a few minutes.</p>
        <button
          className="app-error-btn"
          onClick={() => window.location.reload()}
        >
          Try once more
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
          {/* v1.18: Personal invite token route */}
          <Route path="/join/invite/:token" element={<JoinPage />} />

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
      {/* v1.16: PWA update banner — renders null unless new SW detected */}
      <PWAUpdatePrompt />
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
