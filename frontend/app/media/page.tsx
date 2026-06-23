'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { api, timeAgo, fmtBytes } from '@/lib/api';
import { toast } from '@/lib/toast';
import {
  Film,
  Tv,
  Clapperboard,
  MonitorPlay,
  Play,
  Clock,
  Star,
  Eye,
  EyeOff,
  CheckCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Library,
  BarChart3,
  Trash2,
  X,
} from 'lucide-react';
import styles from './page.module.scss';

interface LibItem {
  id: string;
  name: string;
  type: string;
  year: string;
  rating: number | null;
  official_rating: string;
  runtime_min: number | null;
  genres: string[];
  overview: string;
  poster: string;
  played: boolean;
  favorite: boolean;
  tmdb_id: string;
  jellyfin_id: string;
  season_count: number | null;
  progress: number | null;
  episode_title?: string;
  date_played?: string;
}

interface NowPlaying {
  user: string;
  client: string;
  device: string;
  title: string;
  type: string;
  progress: number;
  poster: string;
  is_paused: boolean;
  jellyfin_id: string;
}

interface NextUp {
  id: string;
  series_name: string;
  season: number;
  episode: number;
  name: string;
  overview: string;
  runtime_min: number;
  poster: string;
  jellyfin_id: string;
}

function jellyfinPlayUrl(jellyfinId: string): string {
  if (typeof window === 'undefined') return '#';
  return `http://${window.location.hostname}:8096/web/#/details?id=${jellyfinId}`;
}

interface MediaOverview {
  counts: { MovieCount: number; SeriesCount: number; EpisodeCount: number } | null;
  continue_watching: LibItem[];
  now_playing: NowPlaying[];
  next_up: NextUp[];
  unwatched: LibItem[];
  watch_history: LibItem[];
  library: LibItem[];
  genres: { name: string; count: number }[];
  total_runtime_hours: number;
}

function ScrollRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const isPointerDown = useRef(false);
  const hasDragged = useRef(false);
  const startX = useRef(0);
  const scrollStart = useRef(0);

  const checkArrows = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 10);
    setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    checkArrows();
    el.addEventListener('scroll', checkArrows, { passive: true });
    const ro = new ResizeObserver(checkArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkArrows);
      ro.disconnect();
    };
  }, [checkArrows]);

  // Block clicks on child links when a real drag happened
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function blockClick(e: MouseEvent) {
      if (hasDragged.current) {
        e.preventDefault();
        e.stopPropagation();
        hasDragged.current = false;
      }
    }
    el.addEventListener('click', blockClick, true);
    return () => el.removeEventListener('click', blockClick, true);
  }, []);

  function scroll(dir: number) {
    ref.current?.scrollBy({ left: dir * 400, behavior: 'smooth' });
  }

  function onPointerDown(e: React.PointerEvent) {
    isPointerDown.current = true;
    hasDragged.current = false;
    startX.current = e.clientX;
    scrollStart.current = ref.current?.scrollLeft || 0;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isPointerDown.current) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 5) {
      hasDragged.current = true;
      if (ref.current) ref.current.style.cursor = 'grabbing';
    }
    if (hasDragged.current && ref.current) {
      ref.current.scrollLeft = scrollStart.current - dx;
    }
  }

  function onPointerUp() {
    isPointerDown.current = false;
    if (ref.current) ref.current.style.cursor = '';
  }

  return (
    <div className={styles.scrollContainer}>
      {showLeft && (
        <button className={`${styles.scrollArrow} ${styles.scrollLeft}`} onClick={() => scroll(-1)}>
          <ChevronLeft size={20} />
        </button>
      )}
      <div
        ref={ref}
        className={styles.scrollRow}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {children}
      </div>
      {showRight && (
        <button className={`${styles.scrollArrow} ${styles.scrollRight}`} onClick={() => scroll(1)}>
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
}

function PosterCard({
  item,
  showProgress,
  subtitle,
  onDelete,
}: {
  item: LibItem;
  showProgress?: boolean;
  subtitle?: string;
  onDelete?: (item: LibItem) => void;
}) {
  const isMovie = item.type === 'Movie';
  const detailHref = item.tmdb_id ? `/discover/${isMovie ? 'movie' : 'tv'}/${item.tmdb_id}` : '#';

  return (
    <div className={styles.posterCard}>
      {onDelete && (
        <button
          className={styles.deleteBtn}
          title={`Delete ${item.name}`}
          aria-label={`Delete ${item.name}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(item);
          }}
        >
          <Trash2 size={13} />
        </button>
      )}
      <Link href={detailHref} className={styles.posterWrap}>
        {item.poster ? (
          <img src={item.poster} alt={item.name} className={styles.posterImg} loading="lazy" />
        ) : (
          <div className={styles.posterEmpty}>
            {isMovie ? <Film size={24} /> : <Tv size={24} />}
          </div>
        )}
        {showProgress && item.progress != null && item.progress > 0 && (
          <div className={styles.posterProgress}>
            <div className={styles.posterProgressFill} style={{ width: `${item.progress}%` }} />
          </div>
        )}
        {item.played && !showProgress && (
          <div className={styles.watchedBadge}>
            <CheckCircle size={14} />
          </div>
        )}
        {item.rating && (
          <div className={styles.ratingBadge}>
            <Star size={9} /> {item.rating.toFixed(1)}
          </div>
        )}
      </Link>
      <Link href={detailHref} className={styles.posterTitle}>
        {item.name}
      </Link>
      <span className={styles.posterMeta}>
        {subtitle || (showProgress && item.progress != null ? `${item.progress}%` : item.year)}
      </span>
    </div>
  );
}

export default function MediaPage() {
  const [data, setData] = useState<MediaOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'movie' | 'series' | 'unwatched'>(
    'all'
  );
  const [deleteTarget, setDeleteTarget] = useState<LibItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const r = await api<MediaOverview>('/api/jellyfin-media/overview');
      setLoading(false);
      if (r.data) setData(r.data);
    }
    load();
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const r = await api<{ ok: boolean; freed_bytes?: number }>(
      `/api/jellyfin-media/item/${deleteTarget.id}`,
      { method: 'DELETE' }
    );
    setDeleting(false);
    if (r.error) {
      toast(r.error, 'error');
      return;
    }
    const isSeries = deleteTarget.type === 'Series';
    const freed = r.data?.freed_bytes ? ` · freed ${fmtBytes(r.data.freed_bytes)}` : '';
    // Drop it from every list it could appear in, and fix the counts.
    setData((prev) => {
      if (!prev) return prev;
      const gone = (i: LibItem) => i.id !== deleteTarget.id;
      return {
        ...prev,
        library: prev.library.filter(gone),
        unwatched: prev.unwatched.filter(gone),
        continue_watching: prev.continue_watching.filter(gone),
        watch_history: prev.watch_history.filter(gone),
        counts: prev.counts
          ? {
              ...prev.counts,
              MovieCount: prev.counts.MovieCount - (isSeries ? 0 : 1),
              SeriesCount: prev.counts.SeriesCount - (isSeries ? 1 : 0),
            }
          : prev.counts,
      };
    });
    toast(`Deleted ${deleteTarget.name}${freed}`, 'success');
    setDeleteTarget(null);
  }

  if (loading) {
    return (
      <>
        <header className="page-header">
          <h1 className="page-title">Media</h1>
        </header>
        <div className="page-body">
          <div className={styles.loadingState}>
            <Loader2 size={20} className={styles.spinner} /> Loading library...
          </div>
        </div>
      </>
    );
  }

  if (!data || !data.counts) {
    return (
      <>
        <header className="page-header">
          <h1 className="page-title">Media</h1>
        </header>
        <div className="page-body">
          <div className="empty-state">Jellyfin unavailable</div>
        </div>
      </>
    );
  }

  const {
    counts,
    continue_watching,
    now_playing,
    next_up,
    unwatched,
    watch_history,
    library,
    genres,
    total_runtime_hours,
  } = data;
  const topGenres = genres.slice(0, 8);
  const maxGenreCount = topGenres[0]?.count || 1;

  const filteredLibrary = library.filter((item) => {
    if (libraryFilter === 'movie') return item.type === 'Movie';
    if (libraryFilter === 'series') return item.type === 'Series';
    if (libraryFilter === 'unwatched') return !item.played;
    return true;
  });

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Media</h1>
        <div className="page-meta">
          {now_playing.length > 0 && (
            <span className="badge green">
              <MonitorPlay size={12} /> {now_playing.length} streaming
            </span>
          )}
        </div>
      </header>

      <div className="page-body">
        {/* Stats bar */}
        <div className={styles.statsBar}>
          <div className={styles.stat}>
            <Film size={16} className={styles.statIcon} style={{ color: '#0a84ff' }} />
            <span className={styles.statNum}>{counts.MovieCount}</span>
            <span className={styles.statLabel}>Movies</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <Tv size={16} className={styles.statIcon} style={{ color: '#30d158' }} />
            <span className={styles.statNum}>{counts.SeriesCount}</span>
            <span className={styles.statLabel}>Series</span>
            <span className={styles.statSub}>{counts.EpisodeCount} eps</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <Clock size={16} className={styles.statIcon} style={{ color: '#bf5af2' }} />
            <span className={styles.statNum}>{total_runtime_hours}</span>
            <span className={styles.statLabel}>Hours</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <Eye size={16} className={styles.statIcon} style={{ color: '#ff9f0a' }} />
            <span className={styles.statNum}>{library.filter((i) => i.played).length}</span>
            <span className={styles.statLabel}>Watched</span>
          </div>
        </div>

        {/* Now Playing */}
        {now_playing.length > 0 && (
          <div className="section">
            <h3 className="section-title">
              <MonitorPlay size={16} style={{ marginRight: 6, verticalAlign: -3 }} /> Now Playing
            </h3>
            <div className={styles.npList}>
              {now_playing.map((s, i) => (
                <a
                  key={i}
                  href={jellyfinPlayUrl(s.jellyfin_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.npCard}
                >
                  {s.poster ? (
                    <img src={s.poster} alt={s.title} className={styles.npPoster} />
                  ) : (
                    <div className={styles.npPosterEmpty}>
                      <Film size={20} />
                    </div>
                  )}
                  <div className={styles.npInfo}>
                    <span className={styles.npTitle}>{s.title}</span>
                    <span className={styles.npDevice}>
                      {s.user} on {s.device}
                    </span>
                    <div className={styles.npProgressRow}>
                      <div className="progress" style={{ flex: 1 }}>
                        <div className="progress-fill green" style={{ width: `${s.progress}%` }} />
                      </div>
                      <span className={styles.npPct}>{s.progress}%</span>
                      {s.is_paused && <span className="badge gray">Paused</span>}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Continue Watching */}
        {continue_watching.length > 0 && (
          <div className="section">
            <h3 className="section-title">
              <Play size={16} style={{ marginRight: 6, verticalAlign: -3 }} /> Continue Watching
            </h3>
            <ScrollRow>
              {continue_watching.map((item, i) => (
                <PosterCard
                  key={i}
                  item={item}
                  showProgress
                  subtitle={item.episode_title || `${item.progress}% · ${item.runtime_min}m`}
                />
              ))}
            </ScrollRow>
          </div>
        )}

        {/* Next Up */}
        {next_up.length > 0 && (
          <div className="section">
            <h3 className="section-title">
              <ChevronRight size={16} style={{ marginRight: 6, verticalAlign: -3 }} /> Next Up
            </h3>
            <ScrollRow>
              {next_up.map((item, i) => (
                <div key={i} className={styles.posterCard}>
                  <a
                    href={jellyfinPlayUrl(item.jellyfin_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.posterWrap}
                  >
                    {item.poster ? (
                      <img
                        src={item.poster}
                        alt={item.name}
                        className={styles.posterImg}
                        loading="lazy"
                      />
                    ) : (
                      <div className={styles.posterEmpty}>
                        <Tv size={24} />
                      </div>
                    )}
                    <div className={styles.playOverlay}>
                      <Play size={28} />
                    </div>
                  </a>
                  <span className={styles.posterTitle}>{item.series_name}</span>
                  <span className={styles.posterMeta}>
                    S{item.season}E{item.episode} · {item.name}
                  </span>
                </div>
              ))}
            </ScrollRow>
          </div>
        )}

        {/* Unwatched */}
        {unwatched.length > 0 && (
          <div className="section">
            <h3 className="section-title">
              <EyeOff size={16} style={{ marginRight: 6, verticalAlign: -3 }} /> Unwatched (
              {unwatched.length})
            </h3>
            <ScrollRow>
              {unwatched.slice(0, 15).map((item, i) => (
                <PosterCard key={i} item={item} />
              ))}
            </ScrollRow>
          </div>
        )}

        {/* Watch History */}
        {watch_history.length > 0 && (
          <div className="section">
            <h3 className="section-title">
              <Eye size={16} style={{ marginRight: 6, verticalAlign: -3 }} /> Recently Watched
            </h3>
            <ScrollRow>
              {watch_history.map((item, i) => (
                <PosterCard
                  key={i}
                  item={item}
                  subtitle={item.date_played ? timeAgo(item.date_played) : ''}
                />
              ))}
            </ScrollRow>
          </div>
        )}

        {/* Full Library */}
        <div className="section">
          <div className={styles.libHeader}>
            <h3 className="section-title" style={{ margin: 0 }}>
              <Library size={16} style={{ marginRight: 6, verticalAlign: -3 }} /> Library
            </h3>
            <div className="segment-control" style={{ fontSize: '0.8rem' }}>
              {[
                { id: 'all' as const, label: 'All' },
                { id: 'movie' as const, label: 'Movies' },
                { id: 'series' as const, label: 'Series' },
                { id: 'unwatched' as const, label: 'Unwatched' },
              ].map((f) => (
                <button
                  key={f.id}
                  className={`segment-btn ${libraryFilter === f.id ? 'active' : ''}`}
                  onClick={() => setLibraryFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.libraryGrid}>
            {filteredLibrary.map((item, i) => (
              <PosterCard key={i} item={item} onDelete={setDeleteTarget} />
            ))}
          </div>
          {filteredLibrary.length === 0 && (
            <div className="empty-state" style={{ padding: 24 }}>
              No items match this filter
            </div>
          )}
        </div>

        {/* Genre Breakdown */}
        {topGenres.length > 0 && (
          <div className="section">
            <h3 className="section-title">
              <BarChart3 size={16} style={{ marginRight: 6, verticalAlign: -3 }} /> Genres
            </h3>
            <div className={styles.genreChart}>
              {topGenres.map((g) => (
                <div key={g.name} className={styles.genreRow}>
                  <span className={styles.genreName}>{g.name}</span>
                  <div className={styles.genreBarWrap}>
                    <div
                      className={styles.genreBar}
                      style={{ width: `${(g.count / maxGenreCount) * 100}%` }}
                    />
                  </div>
                  <span className={styles.genreCount}>{g.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={() => !deleting && setDeleteTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Delete {deleteTarget.type === 'Series' ? 'Series' : 'Movie'}</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                <X size={16} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.modalText}>
                Permanently delete <strong>{deleteTarget.name}</strong>
                {deleteTarget.type === 'Series' ? ' and all its episodes' : ''} from disk?
              </p>
              <p className={styles.deleteWarning}>
                This removes the media files from the server. It cannot be undone.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button
                className="btn btn-ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? (
                  <>
                    <Loader2 size={14} className={styles.spinner} /> Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 size={14} /> Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
