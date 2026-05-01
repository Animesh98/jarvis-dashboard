'use client';

export function toast(msg: string, type: 'success' | 'error' = 'success') {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}
