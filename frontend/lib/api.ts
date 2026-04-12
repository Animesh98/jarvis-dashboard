const API_BASE = '';

export async function api<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (data && data.error) return { data: null, error: data.error };
    return { data, error: null };
  } catch (e: any) {
    return { data: null, error: e.message || 'Failed' };
  }
}

export function fmtBytes(b: number, d = 1): string {
  if (!b || b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(b)) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(d) + ' ' + units[i];
}

export function fmtSpeed(bps: number): string {
  return bps ? fmtBytes(bps) + '/s' : '0 B/s';
}

export function fmtETA(s: number): string {
  if (!s || s < 0 || s >= 8640000) return '∞';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

export function timeAgo(d: string): string {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export function colorForPercent(p: number): string {
  if (p < 60) return '#30d158';
  if (p < 85) return '#ff9f0a';
  return '#ff453a';
}
