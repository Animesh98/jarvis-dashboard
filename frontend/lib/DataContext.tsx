'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { api } from './api';

export interface DashboardData {
  sys: any;
  containers: any[];
  stats: any[];
  torrents: any[];
  transfer: any;
  counts: any;
  latest: any[];
  sessions: any[];
  procs: any;
  bw: any[];
  images: any[];
  storage: any;
  weather: any;
}

const empty: DashboardData = {
  sys: null,
  containers: [],
  stats: [],
  images: [],
  torrents: [],
  transfer: null,
  counts: null,
  latest: [],
  sessions: [],
  procs: null,
  bw: [],
  storage: null,
  weather: null,
};

interface Ctx {
  data: DashboardData;
  refreshFast: () => Promise<void>;
}

const DataContext = createContext<Ctx>({ data: empty, refreshFast: async () => {} });

export function useData() {
  return useContext(DataContext);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData>(empty);
  const mountedRef = useRef(true);
  const refreshFast = useCallback(async () => {
    const results = await Promise.allSettled([
      api('/api/system'),
      api('/api/docker/containers'),
      api('/api/docker/stats'),
      api('/api/torrents/list'),
      api('/api/torrents/transfer'),
      api('/api/jellyfin/items/counts'),
      api('/api/jellyfin/items/latest'),
      api('/api/jellyfin/sessions'),
      api('/api/processes'),
      api('/api/bandwidth/history'),
      api('/api/docker/images'),
    ]);
    if (!mountedRef.current) return;
    const v = (r: PromiseSettledResult<any>) => (r.status === 'fulfilled' ? r.value.data : null);
    setData((prev) => ({
      ...prev,
      sys: v(results[0]),
      containers: v(results[1]) || [],
      stats: v(results[2]) || [],
      torrents: v(results[3]) || [],
      transfer: v(results[4]),
      counts: v(results[5]),
      latest: v(results[6]) || [],
      sessions: v(results[7]) || [],
      procs: v(results[8]),
      bw: v(results[9]) || [],
      images: v(results[10]) || [],
    }));
  }, []);

  const refreshSlow = useCallback(async () => {
    const results = await Promise.allSettled([api('/api/storage'), api('/api/weather')]);
    if (!mountedRef.current) return;
    const v = (r: PromiseSettledResult<any>) => (r.status === 'fulfilled' ? r.value.data : null);
    setData((prev) => ({ ...prev, storage: v(results[0]), weather: v(results[1]) }));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshFast();
    refreshSlow();
    let fast = setInterval(refreshFast, 5000);
    let slow = setInterval(refreshSlow, 300000);

    // Pause polling when tab is hidden, resume when visible
    function handleVisibility() {
      if (document.hidden) {
        clearInterval(fast);
        clearInterval(slow);
      } else {
        refreshFast();
        fast = setInterval(refreshFast, 5000);
        slow = setInterval(refreshSlow, 300000);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      clearInterval(fast);
      clearInterval(slow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshFast, refreshSlow]);

  return <DataContext.Provider value={{ data, refreshFast }}>{children}</DataContext.Provider>;
}
