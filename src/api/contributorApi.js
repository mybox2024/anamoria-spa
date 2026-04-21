// api/contributorApi.js — Anamoria SPA
// v1.0 — Session 3 (April 19, 2026)
//
// Session-token API client for contributor pages. Mirrors the structure of
// api/client.js (owner JWT client) but swaps authentication:
//   - Owner client: Authorization: Bearer {JWT from Auth0}
//   - Contributor client: x-session-token: {session token from sessionStorage}
//
// Every contributor request also includes x-api-key because /contribute/*
// routes have api-key-required: true at the API Gateway level.
//
// NOTE ON INTENTIONAL DUPLICATION:
//   coreFetch() logic here (error normalization, CORS mode, JSON parsing) is
//   intentionally duplicated from api/client.js rather than shared via a helper
//   module. This preserves owner/contributor code-path isolation — contributor
//   changes cannot regress owner functionality, and vice versa. See Session 3
//   Plan v1.1 decision Cap-1 (capture page architecture: contributor pages
//   separate to eliminate owner regression risk).
//
//   If at some point this duplication becomes painful (e.g., error-handling
//   logic diverges or needs shared refactor), extract a shared fetch helper
//   then. For MVP pilot scope, ~30 lines of duplication is acceptable.
//
// Usage:
//   import { createContributorApiClient } from './contributorApi';
//   const api = createContributorApiClient();
//   const data = await api.get(`/contribute/${spaceId}`);
//   const feed = await api.get(`/contribute/${spaceId}/memories`);
//   const { id } = await api.post(`/contribute/${spaceId}/memories`, body);
//   const { uploadUrl, s3Key } = await api.post(
//     `/contribute/${spaceId}/upload-url`,
//     { mimeType, mediaType }
//   );
//   await api.putS3(uploadUrl, blob, mimeType);

import config from '../config';

/**
 * Session storage keys set by ContributorLandingPage on claim.
 * Centralized here so all contributor code references one source of truth.
 */
export const CONTRIBUTOR_SESSION_KEYS = {
  sessionToken: 'ana_sessionToken',
  contributorName: 'ana_contributorName',
  spaceId: 'ana_spaceId',
  spaceName: 'ana_spaceName',
};

/**
 * Read the current session token from sessionStorage.
 * Returns null if not set (contributor has not claimed invite or storage cleared).
 *
 * @returns {string|null}
 */
export function getSessionToken() {
  try {
    return sessionStorage.getItem(CONTRIBUTOR_SESSION_KEYS.sessionToken);
  } catch {
    // sessionStorage access can throw in some sandboxed contexts (e.g., private
    // browsing with strict settings). Treat as no token — caller will see
    // INVALID_SESSION from the server on first request.
    return null;
  }
}

/**
 * Factory returning an API client bound to the contributor session token.
 * Unlike the owner client, no token-getter function is needed — session tokens
 * are static strings in sessionStorage, not refreshed dynamically.
 *
 * The session token is re-read from sessionStorage on every call. This means
 * if the token gets cleared (e.g., sessionStorage purge), subsequent calls
 * will fail with INVALID_SESSION rather than using a stale cached token.
 *
 * @returns API client with get/post/patch/delete/putS3 methods
 */
export function createContributorApiClient() {
  /**
   * Core session-token fetch.
   * Injects both x-session-token and x-api-key on every call.
   */
  async function sessionFetch(path, options = {}) {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      // Fail fast with a consistent error shape — saves a round-trip to the
      // server when we already know there's no token.
      throw {
        error: 'NO_SESSION_TOKEN',
        status: 401,
        message: 'No contributor session token in storage',
      };
    }

    return coreFetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'x-session-token': sessionToken,
        ...(options.headers || {}),
      },
    });
  }

  // ─── Public surface ───────────────────────────────────────────────────────

  return {
    /** GET with session token */
    get(path) {
      return sessionFetch(path, { method: 'GET' });
    },

    /** POST with session token */
    post(path, body) {
      return sessionFetch(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    /** PATCH with session token */
    patch(path, body) {
      return sessionFetch(path, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },

    /** DELETE with session token */
    delete(path) {
      return sessionFetch(path, { method: 'DELETE' });
    },

    /**
     * Direct S3 PUT for voice/photo upload.
     * The uploadUrl is a pre-signed S3 URL from
     * POST /contribute/{spaceId}/upload-url (contributor route, session auth).
     * No Authorization, API key, or session-token headers — the pre-signed URL
     * is self-authorizing via X-Amz-Signature in the URL itself.
     *
     * Identical implementation to owner client putS3 — pre-signed URLs are
     * auth-agnostic once issued. Duplicated here only to keep contributor
     * client self-contained per Cap-1 isolation principle.
     */
    async putS3(uploadUrl, blob, mimeType) {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: blob,
      });
      if (!res.ok) {
        throw {
          error: 'S3_UPLOAD_FAILED',
          status: res.status,
          message: 'S3 upload failed',
        };
      }
      return true;
    },
  };
}

// ─── Core fetch (intentionally duplicated from client.js per Cap-1) ─────────
//
// Mirrors api/client.js coreFetch exactly. If you change error shape or CORS
// behavior here, also update the owner client to keep behavior consistent
// across owner and contributor pages.

async function coreFetch(path, options = {}) {
  const url = `${config.apiUrl}${path}`;

  let res;
  try {
    res = await fetch(url, {
      ...options,
      mode: 'cors',
    });
  } catch (networkErr) {
    throw {
      error: 'NETWORK_ERROR',
      status: 0,
      message: networkErr.message || 'Network request failed',
    };
  }

  // Parse JSON body regardless of status — error responses also return JSON.
  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = {};
    }
  } else {
    data = {};
  }

  if (!res.ok) {
    // Normalize error shape: { error, status, message }
    throw {
      error: data.error || 'REQUEST_FAILED',
      status: res.status,
      message: data.message || `Request failed with status ${res.status}`,
    };
  }

  return data;
}
