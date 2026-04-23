// hooks/useBillingStatus.js — Anamoria SPA
// v1.1 — April 22, 2026
// Changes from v1.0:
//   - A-2: Module-level cache for billing status via apiCache.js.
//     Cache hit returns immediately — no loading flash, no network cost.
//     Eliminates ~400ms warm / ~1,500ms cold per space navigation.
//   - refetch() now bypasses cache (bypassCache = true) to force fresh data
//     after payment, plan switch, or cancel.
//
// v1.0 — April 14, 2026
//   - Initial shared hook for GET /billing/subscription.
//
// Used by: SettingsPage (B4), UpgradePage (B1), SpacePage (profile menu).
// Will also be used by: B5, B6, B7, B11 (Session B).
//
// Returns: { billing, loading, error, refetch }
//   billing — response from GET /billing/subscription (null until loaded)
//   loading — true while fetch is in progress
//   error   — error object if fetch failed (null on success)
//   refetch — call to re-fetch with cache bypass (e.g., after successful payment)
//
// Response shape (from get-subscription.mjs):
//   {
//     tier: 'free' | 'premium' | 'forever',
//     billingPeriod: 'monthly' | 'annual' | null,
//     currentPeriodEnd: ISO string | null,
//     cancelAtPeriodEnd: boolean,
//     cardBrand: string | null,
//     cardLast4: string | null,
//     foreverPurchasedAt: ISO string | null,
//     pauseCollectionUntil: ISO string | null,
//     paymentFailed: boolean,
//     showPaymentFailedBanner: boolean,
//     paymentFailedUrgent: boolean,
//     stripeCustomerId: string | null,
//   }

import { useState, useEffect, useCallback } from 'react';
import { getCached, setCache, BILLING_CACHE_TTL } from '../utils/apiCache';

export function useBillingStatus(getApi) {
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchBilling = useCallback(async (bypassCache = false) => {
    // A-2: Check module-level cache before making network call.
    // Cache hit returns immediately — no loading flash, no network cost.
    if (!bypassCache) {
      const cached = getCached('billing');
      if (cached.hit) {
        setBilling(cached.value);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const api = getApi();
      const data = await api.get('/billing/subscription');
      setCache('billing', data, BILLING_CACHE_TTL);
      setBilling(data);
    } catch (err) {
      console.error('useBillingStatus: fetch failed:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [getApi]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  // refetch bypasses cache — used after payment, plan switch, or cancel
  // to ensure the UI immediately reflects the new subscription state.
  return { billing, loading, error, refetch: () => fetchBilling(true) };
}

/**
 * Utility: compute a human-readable plan label from billing data.
 * Used by SpacePage profile menu, SettingsPage billing panel, UpgradePage.
 */
export function getPlanLabel(billing) {
  if (!billing || billing.tier === 'free') return 'Free plan';
  if (billing.tier === 'forever') return 'Lifetime Member';
  if (billing.tier === 'premium') {
    if (billing.billingPeriod === 'annual') return 'Premium Annual';
    return 'Premium Monthly';
  }
  return 'Free plan';
}
