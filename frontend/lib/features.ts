'use client';

import { useEffect, useState } from 'react';

// Keys must match what backend's config.py reports.
// 'discover' is always on server-side; frontend treats it the same.
export type Feature =
  | 'system'
  | 'docker'
  | 'torrents'
  | 'media'
  | 'discover'
  | 'files'
  | 'tasks'
  | 'notes';

const ALL: Feature[] = [
  'system',
  'docker',
  'torrents',
  'media',
  'discover',
  'files',
  'tasks',
  'notes',
];

let cache: Set<Feature> | null = null;
let inflight: Promise<Set<Feature>> | null = null;

async function fetchFeatures(): Promise<Set<Feature>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/config/features', { cache: 'no-store' });
      if (!res.ok) throw new Error('features fetch failed');
      const data = await res.json();
      const list: Feature[] = Array.isArray(data?.features) ? data.features : ALL;
      cache = new Set(list);
    } catch {
      // Fail open — if the endpoint isn't reachable, show every tab so the
      // dashboard behaves like it did before feature flags existed.
      cache = new Set(ALL);
    }
    return cache!;
  })();
  return inflight;
}

export function useEnabledFeatures(): Set<Feature> | null {
  const [features, setFeatures] = useState<Set<Feature> | null>(cache);
  useEffect(() => {
    if (cache) {
      setFeatures(cache);
      return;
    }
    let cancelled = false;
    fetchFeatures().then((f) => {
      if (!cancelled) setFeatures(f);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return features;
}
