// api/client.js — Anamoria SPA
// v1.1 — April 14, 2026
// Changes from v1.0:
//   - Added put() method for authenticated JSON PUT requests
//     (needed for PUT /billing/subscription and PUT /billing/payment-method)
//
// Fetch wrapper that handles:
//   - Authenticated requests: injects JWT from Auth0 via getAccessToken()
//   - Unauthenticated requests: injects x-api-key header
//   - All requests: Content-Type, CORS mode, JSON parse
//   - Error responses: throws { error, status, message } for component handling
//
// Usage:
//   import { createApiClient } from './client';
//   const api = createApiClient(getAccessTokenSilently);
//   const data = await api.get('/spaces');
//   const result = await api.post('/spaces', { name: 'Grandma Rose' });
//   const result = await api.put('/billing/subscription', { priceId: 'price_xxx' });
//   const result = await api.postPublic('/pilot/validate-code', { accessCode: 'ABC123' });

import config from '../config';

/**
 * Factory that returns an API client bound to a token-getter function.
 * Call this inside components/hooks that have access to Auth0's
 * getAccessTokenSilently().
 *
 * @param {Function} getAccessTokenSilently - from useAuth0()
 */
export function createApiClient(getAccessTokenSilently) {
  /**
   * Core authenticated fetch.
   * Injects Authorization: Bearer {jwt} on every call.
   */
  async function authFetch(path, options = {}) {
    let token;
    try {
      token = await getAccessTokenSilently({
        authorizationParams: { audience: config.auth0Audience },
      });
    } catch (err) {
      // Token refresh failed — Auth0 SDK will trigger re-login on next navigation.
      // Surface as a consistent error shape so callers can handle uniformly.
      throw { error: 'AUTH_TOKEN_FAILED', status: 401, message: err.message };
    }

    return coreFetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  }

  /**
   * Unauthenticated fetch for public routes:
   *   POST /pilot/validate-code
   *   POST /errors
   * Uses x-api-key instead of JWT.
   */
  async function publicFetch(path, options = {}) {
    return coreFetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        ...(options.headers || {}),
      },
    });
  }

  // ─── Public surface ───────────────────────────────────────────────────────

  return {
    /** GET with JWT */
    get(path) {
      return authFetch(path, { method: 'GET' });
    },

    /** POST with JWT */
    post(path, body) {
      return authFetch(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    /** PUT with JWT */
    put(path, body) {
      return authFetch(path, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    },

    /** PATCH with JWT */
    patch(path, body) {
      return authFetch(path, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },

    /** DELETE with JWT */
    delete(path) {
      return authFetch(path, { method: 'DELETE' });
    },

    /** POST without JWT — uses API key (validate-code, errors) */
    postPublic(path, body) {
      return publicFetch(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    /**
     * Direct S3 PUT for audio blob upload.
     * The uploadUrl is a pre-signed S3 URL from POST /media/upload-url.
     * No Authorization or API key headers — the pre-signed URL is self-authorizing.
     */
    async putS3(uploadUrl, blob, mimeType) {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: blob,
      });
      if (!res.ok) {
        throw { error: 'S3_UPLOAD_FAILED', status: res.status, message: 'S3 upload failed' };
      }
      return true;
    },
  };
}

// ─── Core fetch (shared by auth and public paths) ──────────────────────────

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
