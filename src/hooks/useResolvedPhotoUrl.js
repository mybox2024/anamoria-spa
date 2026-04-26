// hooks/useResolvedPhotoUrl.js — Anamoria SPA
// v1.0 — Shared hook to resolve space photo S3 key to CloudFront signed URL
//         (April 26, 2026)
//
// Problem: space.photoUrl is an S3 key (e.g. "spaces/abc/photo.jpg"), not a
// loadable URL. SpacePage has its own resolution effect (v2.17), but capture
// and edit pages (RecordPage, WritePage, PhotoPage, MemoryDetailPage) were
// passing the raw S3 key to LovedOneBar, causing the avatar to show the
// initial fallback instead of the photo.
//
// This hook encapsulates the resolution pattern from SpacePage v2.17/v2.17.1:
//   1. If space.photoUrl is falsy, return null
//   2. Otherwise, call GET /media/playback/{s3Key} to get a signed CloudFront URL
//   3. Return the signed URL (or null on error)
//
// Usage:
//   const resolvedPhotoUrl = useResolvedPhotoUrl(space, getAccessTokenSilently);
//   <LovedOneBar spacePhotoUrl={resolvedPhotoUrl} ... />
//
// The hook is keyed on space?.photoUrl — it only re-fetches when the S3 key
// changes. Cancellation-safe (aborts on unmount or key change).

import { useState, useEffect } from 'react';
import { createApiClient } from '../api/client';

export function useResolvedPhotoUrl(space, getAccessTokenSilently) {
  const [resolvedUrl, setResolvedUrl] = useState(null);

  useEffect(() => {
    if (!space?.photoUrl) {
      setResolvedUrl(null);
      return;
    }

    let cancelled = false;

    async function resolve() {
      try {
        const api = createApiClient(getAccessTokenSilently);
        // v2.17.1 pattern: no encodeURIComponent — {key+} accepts raw slashes
        const data = await api.get(`/media/playback/${space.photoUrl}`);
        if (!cancelled && data?.playbackUrl) {
          setResolvedUrl(data.playbackUrl);
        }
      } catch (err) {
        console.error('Failed to resolve space photo:', err);
        if (!cancelled) setResolvedUrl(null);
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [space?.photoUrl, getAccessTokenSilently]);

  return resolvedUrl;
}
