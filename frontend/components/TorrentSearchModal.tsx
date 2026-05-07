'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowDown, Loader2, Plus, X } from 'lucide-react';
import { api, fmtBytes } from '@/lib/api';
import { toast } from '@/lib/toast';
import styles from './TorrentSearchModal.module.scss';

interface TorrentResult {
  name: string;
  size: number;
  seeders: number;
  leechers: number;
  info_hash: string;
}

export default function TorrentSearchModal({
  query,
  onClose,
  category,
}: {
  query: string;
  onClose: () => void;
  category?: string;
}) {
  const [results, setResults] = useState<TorrentResult[] | null>(null);
  const [searching, setSearching] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function search() {
      setSearching(true);
      const r = await api<TorrentResult[]>(
        `/api/torrent-search?q=${encodeURIComponent(query)}`
      );
      if (cancelled) return;
      setSearching(false);
      if (r.error || !Array.isArray(r.data)) {
        setResults([]);
      } else {
        setResults(r.data);
      }
    }
    search();
    return () => {
      cancelled = true;
    };
  }, [query]);

  // Close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function addTorrent(hash: string, name: string) {
    const magnet = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}`;
    const r = await api('/api/torrent-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magnet, category: category || '' }),
    });
    toast(r.error ? r.error : `Added: ${name.substring(0, 50)}`, r.error ? 'error' : 'success');
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Torrents for: {query}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className={styles.modalBody}>
          {searching ? (
            <div className={styles.loadingState}>
              <Loader2 size={20} className={styles.spinner} /> Searching...
            </div>
          ) : results && results.length === 0 ? (
            <div className="empty-state" style={{ padding: 16 }}>
              No torrents found
            </div>
          ) : (
            results && (
              <div className="stagger-children">
                {results.map((r, i) => (
                  <div key={i} className={styles.torrentResult}>
                    <span className={styles.torrentName} title={r.name}>
                      {r.name}
                    </span>
                    <span className={styles.torrentMeta}>{fmtBytes(r.size)}</span>
                    <span className={styles.torrentSeeds}>
                      <ArrowUp size={10} />
                      {r.seeders}
                    </span>
                    <span className={styles.torrentMeta}>
                      <ArrowDown size={10} />
                      {r.leechers}
                    </span>
                    <button
                      className={`btn btn-sm ${styles.addBtn}`}
                      onClick={() => addTorrent(r.info_hash, r.name)}
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
