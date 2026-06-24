const API_BASE = '';

const KEY_STORAGE = 'jarvis-api-key';

export function getApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string) {
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch {
    // localStorage unavailable (private mode) — key just won't persist
  }
}

/** Append the API key to a URL used outside fetch (window.open downloads). */
export function withApiKey(url: string): string {
  const key = getApiKey();
  if (!key) return url;
  return url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key);
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const key = getApiKey();
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...(key ? { 'X-API-Key': key } : {}), ...(options.headers || {}) },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('jarvis:unauthorized'));
      return { data: null, error: 'Unauthorized — API key required' };
    }
    const data = await res.json();
    if (data && data.error) return { data: null, error: data.error };
    if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
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

/**
 * Copy text to the clipboard, working even on plain HTTP (where
 * navigator.clipboard is unavailable because it's not a secure context).
 * Falls back to a hidden <textarea> + execCommand('copy').
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
