// pages/CreateSpacePage.jsx — Anamoria SPA
// Route: /spaces/new (protected — JWT required)
//
// v2.0 — May 1, 2026 — full rewrite
//   Replaces v1.0's bespoke form (which asked for date of birth and date of
//   passing on the onboarding screen) with the same form body the
//   CreateSpaceModal renders. Now consumes the shared <CreateSpaceForm/>
//   component so this page and the modal show identical UI and behavior.
//
//   What was removed:
//     - "ANAMORIA" eyebrow
//     - "Create a memory space" title
//     - "A space holds all the voice notes and memories for one person." subtitle
//     - "Optional — helps personalize prompts" card with date_of_birth and
//       date_of_passing inputs (both columns remain in the spaces table —
//       no migration; these can be added via Space Settings later if needed)
//     - The explicit "Who is this space for? *" label + asterisk
//
//   What was added (via <CreateSpaceForm/>):
//     - Centered serif "Who is this space for?" prompt
//     - "Their name" placeholder (matches modal exactly)
//     - Photo upload (dashed circle / preview + change-photo)
//     - "Create space" CTA (full-width sage)
//     - "🔒 This space will be private" footer
//
//   API change: POST /spaces no longer sends birthdate or dateOfLoss from this
//   page. Both fields are nullable in the spaces schema — no backend change
//   required. Lambda continues to accept those fields for any future caller.
//
//   Page chrome (background, safe-area padding, responsive container width)
//   remains owned here. The form component owns body + CTA only.
//
// v1.0 — Initial implementation (pre-launch).
//
// Flow:
//   1. CreateSpaceForm collects name + optional photo
//   2. CreateSpaceForm calls POST /spaces, optionally PATCHes photo
//   3. CreateSpaceForm fires onSuccess(newSpaceId)
//   4. Page navigates to /spaces/:id

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { createApiClient } from '../api/client';
import CreateSpaceForm from '../components/CreateSpaceForm';
import styles from './CreateSpacePage.module.css';

export default function CreateSpacePage() {
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();

  // CreateSpaceForm calls getApi() once at create time. Returning a fresh
  // client each call mirrors how the modal is invoked (modal's caller passes
  // the same shape). Keeps the form decoupled from the auth library.
  const getApi = useCallback(
    () => createApiClient(getAccessTokenSilently),
    [getAccessTokenSilently],
  );

  const handleSuccess = useCallback(
    (newSpaceId) => {
      navigate(`/spaces/${newSpaceId}`, { replace: true });
    },
    [navigate],
  );

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.formCard}>
          <CreateSpaceForm
            getApi={getApi}
            onSuccess={handleSuccess}
            ctaLabel="Create space"
          />
        </div>
      </div>
    </div>
  );
}
