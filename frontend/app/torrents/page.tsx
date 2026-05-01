'use client';

import { useState, memo } from 'react';
import { useData } from '@/lib/DataContext';
import { api, fmtBytes, fmtSpeed, fmtETA } from '@/lib/api';
import { toast } from '@/lib/toast';
import {
  Search,
  X,
  Plus,
  Pause,
  Play,
  ArrowDown,
  ArrowUp,
  Clock,
  Trash2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import styles from './page.module.scss';

function isCompleted(t: any): boolean {
  return Math.round((t.progress || 0) * 100) >= 100;
}

const TorrentItem = memo(function TorrentItem({
  t,
  onToggle,
  onRemove,
  onClean,
}: {
  t: any;
  onToggle: (hash: string, paused: boolean) => void;
  onRemove: (hash: string, name: string) => void;
  onClean: (hash: string, name: string) => void;
}) {
  const pct = Math.round((t.progress || 0) * 100);
  const cat = t.category || '';
  const isPaused = t.state?.startsWith('paused') || t.state?.startsWith('stopped');
  const completed = pct >= 100;

  function getCatClass(c: string) {
    const lc = c.toLowerCase();
    if (lc === 'movies') return 'blue';
    if (lc === 'tv') return 'green';
    if (lc === 'anime') return 'purple';
    if (lc === 'music') return 'orange';
    return 'gray';
  }

  function getProgressColor(state: string) {
    if (state?.includes('DL') || state === 'downloading') return 'green';
    if (state?.includes('UP') || state === 'uploading' || state === 'seeding') return 'blue';
    if (state === 'error') return 'red';
    return 'gray';
  }

  if (completed) {
    return (
      <div className={`${styles.torrent} ${styles.torrentCompleted}`}>
        <div className={styles.torrentTop}>
          <CheckCircle size={14} className={styles.completedIcon} />
          <span className={styles.torrentName} title={t.name}>
            {t.name || '?'}
          </span>
          {cat && <span className={`badge ${getCatClass(cat)}`}>{cat}</span>}
          <span className={styles.torrentMeta}>{fmtBytes(t.size)}</span>
          <button
            className={`btn btn-sm ${styles.cleanBtn}`}
            onClick={() => onClean(t.hash, t.name)}
          >
            <XCircle size={12} /> Clean
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.torrent}>
      <div className={styles.torrentTop}>
        <span className={styles.torrentName} title={t.name}>
          {t.name || '?'}
        </span>
        {cat && <span className={`badge ${getCatClass(cat)}`}>{cat}</span>}
        <button className="btn btn-ghost btn-sm" onClick={() => onToggle(t.hash, isPaused)}>
          {isPaused ? (
            <>
              <Play size={12} /> Resume
            </>
          ) : (
            <>
              <Pause size={12} /> Pause
            </>
          )}
        </button>
        <button
          className={`btn btn-ghost btn-sm ${styles.removeBtn}`}
          onClick={() => onRemove(t.hash, t.name)}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className={styles.torrentBottom}>
        <span className={styles.pctLabel}>{pct}%</span>
        <div className="progress" style={{ flex: 1 }}>
          <div
            className={`progress-fill ${getProgressColor(t.state)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={styles.torrentMeta}>{fmtBytes(t.size)}</span>
        {t.dlspeed > 0 && (
          <span className={styles.torrentSpeed}>
            <ArrowDown size={10} /> {fmtSpeed(t.dlspeed)}
          </span>
        )}
        {t.eta > 0 && t.eta < 8640000 && (
          <span className={styles.torrentEta}>
            <Clock size={10} /> {fmtETA(t.eta)}
          </span>
        )}
        <span className={styles.torrentState}>{t.state}</span>
      </div>
    </div>
  );
});

export default function TorrentsPage() {
  const { data, refreshFast } = useData();
  const { torrents, transfer } = data;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ hash: string; name: string } | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [hiddenHashes, setHiddenHashes] = useState<Set<string>>(new Set());

  const allTorrents = (Array.isArray(torrents) ? torrents : []).filter(
    (t) => !hiddenHashes.has(t.hash)
  );
  const active = allTorrents
    .filter((t) => !isCompleted(t))
    .sort((a, b) => {
      const order: Record<string, number> = {
        downloading: 0,
        stalledDL: 1,
        forcedDL: 0,
        uploading: 2,
        stalledUP: 3,
        pausedDL: 4,
        stoppedDL: 4,
      };
      return (order[a.state] ?? 6) - (order[b.state] ?? 6) || a.progress - b.progress;
    });
  const completed = allTorrents.filter((t) => isCompleted(t));

  async function doSearch() {
    if (!query.trim()) return;
    setSearching(true);
    const r = await api(`/api/torrent-search?q=${encodeURIComponent(query.trim())}`);
    setSearching(false);
    if (r.error || !Array.isArray(r.data) || !r.data.length) {
      setResults([]);
      setTimeout(() => setResults(null), 3000);
      return;
    }
    setResults(r.data);
  }

  async function addTorrent(hash: string, name: string) {
    const magnet = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}`;
    const isSeries = /\bS\d{1,2}|season\s*\d/i.test(name);
    const category = isSeries ? 'tv' : 'movies';
    const r = await api('/api/torrent-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magnet, category }),
    });
    toast(r.error ? r.error : `Added: ${name.substring(0, 50)}`, r.error ? 'error' : 'success');
    setResults(null);
    setQuery('');
    setTimeout(refreshFast, 1500);
  }

  async function toggleTorrent(hash: string, isPaused: boolean) {
    await api(`/api/torrents/${isPaused ? 'resume' : 'pause'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: [hash] }),
    });
    setTimeout(refreshFast, 800);
  }

  function promptRemove(hash: string, name: string) {
    setRemoveTarget({ hash, name });
    setDeleteFiles(false);
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    const r = await api(`/api/torrents/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: [removeTarget.hash], delete_files: deleteFiles }),
    });
    toast(
      r.error ? r.error : `Removed: ${removeTarget.name.substring(0, 50)}`,
      r.error ? 'error' : 'success'
    );
    setRemoveTarget(null);
    setTimeout(refreshFast, 800);
  }

  async function cleanOne(hash: string, name: string) {
    // Optimistic: hide immediately
    setHiddenHashes((prev) => new Set(prev).add(hash));
    const r = await api(`/api/torrents/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: [hash], delete_files: false }),
    });
    if (r.error) {
      // Restore on failure
      setHiddenHashes((prev) => {
        const s = new Set(prev);
        s.delete(hash);
        return s;
      });
      toast(`Failed to clean: ${name.substring(0, 40)}`, 'error');
    }
  }

  async function clearAllCompleted() {
    const items = [...completed];
    if (!items.length) return;
    // Optimistic: hide all immediately
    const hashes = items.map((t) => t.hash);
    setHiddenHashes((prev) => {
      const s = new Set(prev);
      hashes.forEach((h) => s.add(h));
      return s;
    });
    // Batch delete via API (all hashes in one call)
    const r = await api(`/api/torrents/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes, delete_files: false }),
    });
    if (r.error) {
      setHiddenHashes((prev) => {
        const s = new Set(prev);
        hashes.forEach((h) => s.delete(h));
        return s;
      });
      toast(r.error, 'error');
    } else {
      toast(`Cleared ${items.length} completed`, 'success');
    }
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Torrents</h1>
        <div className="page-meta">
          {completed.length > 0 && (
            <button className={`btn btn-sm ${styles.clearAllBtn}`} onClick={clearAllCompleted}>
              <CheckCircle size={12} /> Clear {completed.length} completed
            </button>
          )}
          {transfer && (
            <>
              <span
                style={{
                  color: '#30d158',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ArrowDown size={14} /> {fmtSpeed(transfer.dl_info_speed)}
              </span>
              <span
                style={{
                  color: '#0a84ff',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ArrowUp size={14} /> {fmtSpeed(transfer.up_info_speed)}
              </span>
            </>
          )}
        </div>
      </header>

      <div className="page-body">
        <div className="section">
          <div className={styles.searchBar}>
            <div className={styles.searchInputWrap}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                className={`input input-mono ${styles.searchInput}`}
                placeholder="Search torrents…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              />
            </div>
            <button className="btn btn-primary" onClick={doSearch} disabled={searching}>
              {searching ? 'Searching…' : 'Search'}
            </button>
            {results !== null && (
              <button className="btn btn-danger btn-sm" onClick={() => setResults(null)}>
                <X size={14} />
              </button>
            )}
          </div>

          {results !== null && (
            <div className={`${styles.results} stagger-children`}>
              {results.length === 0 ? (
                <div className="empty-state" style={{ padding: 16 }}>
                  No results
                </div>
              ) : (
                results.map((r, i) => (
                  <div key={i} className={styles.resultItem}>
                    <span className={styles.resultName} title={r.name}>
                      {r.name}
                    </span>
                    <span className={styles.resultMeta}>{fmtBytes(r.size)}</span>
                    <span className={styles.resultSeeds}>
                      <ArrowUp size={10} />
                      {r.seeders}
                    </span>
                    <span className={styles.resultMeta}>
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
                ))
              )}
            </div>
          )}
        </div>

        {/* Active downloads */}
        <div className="section">
          {active.length === 0 && completed.length === 0 ? (
            <div className="empty-state">No active torrents</div>
          ) : (
            <>
              {active.length > 0 && (
                <div className={`${styles.list} stagger-children`}>
                  {active.map((t) => (
                    <TorrentItem
                      key={t.hash}
                      t={t}
                      onToggle={toggleTorrent}
                      onRemove={promptRemove}
                      onClean={cleanOne}
                    />
                  ))}
                </div>
              )}

              {/* Completed */}
              {completed.length > 0 && (
                <>
                  {active.length > 0 && <div className={styles.sectionDivider} />}
                  <div className={styles.completedHeader}>
                    <span className={styles.completedLabel}>
                      <CheckCircle size={14} /> {completed.length} completed
                    </span>
                  </div>
                  <div className={`${styles.list}`}>
                    {completed.map((t) => (
                      <TorrentItem
                        key={t.hash}
                        t={t}
                        onToggle={toggleTorrent}
                        onRemove={promptRemove}
                        onClean={cleanOne}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Remove confirmation modal */}
      {removeTarget && (
        <div className={styles.modalOverlay} onClick={() => setRemoveTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Remove Torrent</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setRemoveTarget(null)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.modalText}>
                Remove <strong>{removeTarget.name}</strong>?
              </p>
              <label className={styles.deleteToggle}>
                <input
                  type="checkbox"
                  checked={deleteFiles}
                  onChange={(e) => setDeleteFiles(e.target.checked)}
                />
                <span className={styles.toggleTrack}>
                  <span className={styles.toggleThumb} />
                </span>
                <span className={styles.toggleLabel}>Also delete downloaded files</span>
              </label>
              {deleteFiles && (
                <p className={styles.deleteWarning}>
                  Downloaded files will be permanently deleted.
                </p>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className="btn btn-ghost" onClick={() => setRemoveTarget(null)}>
                Cancel
              </button>
              <button
                className={`btn ${deleteFiles ? 'btn-danger' : 'btn-primary'}`}
                onClick={confirmRemove}
              >
                <Trash2 size={14} /> {deleteFiles ? 'Remove & Delete Files' : 'Remove Torrent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
