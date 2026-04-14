// hooks/useBillingStatus.js — Anamoria SPA
// v1.0 — April 14, 2026
//
// Shared hook for fetching billing status from GET /billing/subscription.
// Used by: SettingsPage (B4), UpgradePage (B1), SpacePage (profile menu).
// Will also be used by: B5, B6, B7, B11 (Session B).
//
// Returns: { billing, loading, error, refetch }
//   billing — response from GET /billing/subscription (null until loaded)
//   loading — true while fetch is in progress
//   error   — error object if fetch failed (null on success)
//   refetch — call to re-fetch (e.g., after successful payment)
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

export function useBillingStatus(getApi) {
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchBilling = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = getApi();
      const data = await api.get('/billing/subscription');
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

  return { billing, loading, error, refetch: fetchBilling };
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
