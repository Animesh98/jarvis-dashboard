'use client';

import { useEffect, useState } from 'react';
import { setApiKey } from '@/lib/api';

/**
 * Shown when the backend rejects a request with 401. Asks for the dashboard
 * API key (the API_KEY value from .env), verifies it, stores it in
 * localStorage and reloads. lib/api.ts attaches it to every request.
 */
export default function ApiKeyGate() {
  const [show, setShow] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onUnauthorized = () => setShow(true);
    window.addEventListener('jarvis:unauthorized', onUnauthorized);
    return () => window.removeEventListener('jarvis:unauthorized', onUnauthorized);
  }, []);

  if (!show) return null;

  async function submit() {
    const key = value.trim();
    if (!key || busy) return;
    setBusy(true);
    setError('');
    try {
      // watchlist router is always mounted, so it works for any feature set
      const res = await fetch('/api/watchlist', { headers: { 'X-API-Key': key } });
      if (res.status === 401) {
        setError('Invalid key — check API_KEY in .env');
        setBusy(false);
        return;
      }
      setApiKey(key);
      window.location.reload();
    } catch {
      setError('Could not reach the backend');
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div className="card" style={{ width: 'min(380px, 90vw)', padding: 24 }}>
        <h3 style={{ margin: '0 0 8px' }}>Unlock Jarvis</h3>
        <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: 14 }}>
          Enter the dashboard API key (<code>API_KEY</code> in <code>.env</code>).
        </p>
        <input
          type="password"
          className="input"
          placeholder="API key"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          aria-label="Dashboard API key"
        />
        {error && (
          <p style={{ margin: '8px 0 0', color: 'var(--red, #ff453a)', fontSize: 13 }}>{error}</p>
        )}
        <button
          className="btn btn-primary"
          style={{ marginTop: 16, width: '100%' }}
          onClick={submit}
          disabled={busy || !value.trim()}
        >
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </div>
    </div>
  );
}
