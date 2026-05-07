'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import TorrentSearchModal from '@/components/TorrentSearchModal';
import {
  Sparkles,
  Search,
  Library,
  TrendingUp,
  Plus,
  Film,
  Tv,
  Heart,
  Zap,
  Brain,
  Sofa,
  Skull,
  Laugh,
  Drama,
  Swords,
  Rocket,
  Ghost,
  Clapperboard,
  Palette,
  X,
  Loader2,
  Bookmark,
  BookmarkCheck,
} from 'lucide-react';
import styles from './page.module.scss';

interface Recommendation {
  title: string;
  year: string;
  type: string;
  description: string;
  rating: string;
  poster: string;
  torrent_query: string;
  tmdb_id?: string;
  genre_ids?: number[];
  genres?: string[];
}

interface AutocompleteResult {
  title: string;
  year: string;
  tmdb_id: string;
  type: string;
}

interface SearchResult {
  title: string;
  year: string;
  tmdb_id: string;
  type: string;
  poster: string;
  rating: number;
  overview: string;
}

const MOODS = [
  { id: 'feel-good', label: 'Feel Good', icon: Heart, color: '#ff375f' },
  { id: 'thriller', label: 'Thriller', icon: Zap, color: '#ff9f0a' },
  { id: 'mind-bending', label: 'Mind-Bending', icon: Brain, color: '#bf5af2' },
  { id: 'comfort', label: 'Comfort', icon: Sofa, color: '#64d2ff' },
  { id: 'dark', label: 'Dark', icon: Skull, color: '#636366' },
  { id: 'funny', label: 'Funny', icon: Laugh, color: '#ffd60a' },
  { id: 'romantic', label: 'Romantic', icon: Drama, color: '#ff375f' },
  { id: 'action-packed', label: 'Action', icon: Swords, color: '#ff453a' },
  { id: 'sci-fi', label: 'Sci-Fi', icon: Rocket, color: '#0a84ff' },
  { id: 'horror', label: 'Horror', icon: Ghost, color: '#30d158' },
  { id: 'documentary', label: 'Documentary', icon: Clapperboard, color: '#ff9f0a' },
  { id: 'animated', label: 'Animated', icon: Palette, color: '#5e5ce6' },
];

function getDetailHref(rec: Recommendation): string | null {
  if (!rec.tmdb_id) return null;
  const type = rec.type === 'series' ? 'tv' : rec.type === 'tv' ? 'tv' : 'movie';
  return `/discover/${type}/${rec.tmdb_id}`;
}

function RecommendationCard({
  rec,
  onAddTorrent,
}: {
  rec: Recommendation;
  onAddTorrent: (rec: Recommendation) => void;
}) {
  const href = getDetailHref(rec);
  const cardContent = (
    <div className={styles.recCardInner}>
      {rec.poster ? (
        <img src={rec.poster} alt={rec.title} className={styles.recPoster} loading="lazy" />
      ) : (
        <div className={styles.recPosterEmpty}>
          <Film size={24} />
        </div>
      )}
      <div className={styles.recContent}>
        <span className={styles.recTitle}>{rec.title}</span>
        <div className={styles.recBadges}>
          {rec.year && <span className="badge gray">{rec.year}</span>}
          <span
            className={`badge ${rec.type === 'series' || rec.type === 'tv' ? 'purple' : 'blue'}`}
          >
            {rec.type === 'series' || rec.type === 'tv' ? (
              <>
                <Tv size={10} /> Series
              </>
            ) : (
              <>
                <Film size={10} /> Movie
              </>
            )}
          </span>
          {rec.rating && Number(rec.rating) > 0 && (
            <span className={styles.recRatingBadge}>&#9733; {rec.rating}</span>
          )}
        </div>
        {rec.description && <div className={styles.recDesc}>{rec.description}</div>}
        <div className={styles.recActions}>
          <button
            className={`btn btn-sm ${styles.torrentBtn}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddTorrent(rec);
            }}
          >
            <Plus size={12} /> Find Torrent
          </button>
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={styles.recCard}
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        {cardContent}
      </Link>
    );
  }

  return <div className={styles.recCard}>{cardContent}</div>;
}

interface SeasonInfo {
  season_number: number;
  name: string;
  episode_count: number;
  existing_episodes: number[];
  existing_count: number;
  complete: boolean;
  torrent_query: string;
  poster: string;
}

function SeriesSeasonModal({ rec, onClose }: { rec: Recommendation; onClose: () => void }) {
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState(rec.title);
  const [torrentQuery, setTorrentQuery] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const r = await api<{ title: string; seasons: SeasonInfo[] }>(
        `/api/recommendations/series-seasons?tmdb_id=${rec.tmdb_id}&title=${encodeURIComponent(rec.title)}`
      );
      setLoading(false);
      if (r.data) {
        setSeasons(r.data.seasons || []);
        setTitle(r.data.title || rec.title);
      }
    }
    load();
  }, [rec.tmdb_id, rec.title]);

  if (torrentQuery) {
    return (
      <TorrentSearchModal
        query={torrentQuery}
        onClose={() => setTorrentQuery(null)}
        category="tv"
      />
    );
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className={styles.modalHeader}>
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className={styles.modalBody}>
          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={20} className={styles.spinner} /> Loading seasons...
            </div>
          ) : seasons.length === 0 ? (
            <div className="empty-state" style={{ padding: 16 }}>
              No season data found
            </div>
          ) : (
            <div className={styles.seasonList}>
              {seasons.map((s) => (
                <div
                  key={s.season_number}
                  className={`${styles.seasonRow} ${s.complete ? styles.seasonComplete : ''}`}
                >
                  <div className={styles.seasonInfo}>
                    <span className={styles.seasonName}>{s.name}</span>
                    <span className={styles.seasonEps}>
                      {s.existing_count > 0 ? (
                        <>
                          {s.existing_count}/{s.episode_count} episodes
                        </>
                      ) : (
                        <>{s.episode_count} episodes</>
                      )}
                    </span>
                    {s.complete && <span className="badge green">Complete</span>}
                    {s.existing_count > 0 && !s.complete && (
                      <span className="badge orange">
                        Partial ({s.episode_count - s.existing_count} missing)
                      </span>
                    )}
                  </div>
                  {!s.complete && (
                    <button
                      className={`btn btn-sm ${styles.torrentBtn}`}
                      onClick={() => setTorrentQuery(s.torrent_query)}
                    >
                      <Plus size={12} /> Find Torrent
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  const [activeTab, setActiveTab] = useState<
    'mood' | 'similar' | 'library' | 'trending' | 'watchlist'
  >('mood');
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [moodMediaType, setMoodMediaType] = useState<'movie' | 'tv'>('movie');
  const [moodResults, setMoodResults] = useState<Recommendation[]>([]);
  const [similarQuery, setSimilarQuery] = useState('');
  const [similarResults, setSimilarResults] = useState<Recommendation[]>([]);
  const [libraryItems, setLibraryItems] = useState<Recommendation[]>([]);
  const [librarySuggestions, setLibrarySuggestions] = useState<Recommendation[]>([]);
  const [libraryGenres, setLibraryGenres] = useState<string[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [libraryFilterType, setLibraryFilterType] = useState<'all' | 'movie' | 'series'>('all');
  const [libraryFilterGenre, setLibraryFilterGenre] = useState<string>('all');
  const [trendingResults, setTrendingResults] = useState<Recommendation[]>([]);
  const [trendingWindow, setTrendingWindow] = useState<'week' | 'day'>('week');
  const [trendingFilterType, setTrendingFilterType] = useState<'all' | 'movie' | 'series'>('all');
  const [loading, setLoading] = useState(false);
  const [torrentQuery, setTorrentQuery] = useState<string | null>(null);
  const [torrentCategory, setTorrentCategory] = useState<string>('');
  const [seriesModal, setSeriesModal] = useState<Recommendation | null>(null);

  // Watchlist state
  interface WatchlistItem {
    id: number;
    tmdb_id: string;
    media_type: string;
    title: string;
    year: string;
    poster: string;
    category: string;
    added_at: string;
  }
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const [watchlistFilter, setWatchlistFilter] = useState<string>('all');

  // Global search state
  const [globalQuery, setGlobalQuery] = useState('');
  const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const globalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalWrapRef = useRef<HTMLDivElement>(null);

  // Autocomplete state
  const [acResults, setAcResults] = useState<AutocompleteResult[]>([]);
  const [acOpen, setAcOpen] = useState(false);
  const acTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acWrapRef = useRef<HTMLDivElement>(null);

  // Auto-load trending and library on mount
  useEffect(() => {
    loadTrending();
    loadLibrary();
  }, []);

  // Close autocomplete / global search on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (acWrapRef.current && !acWrapRef.current.contains(e.target as Node)) {
        setAcOpen(false);
      }
      if (globalWrapRef.current && !globalWrapRef.current.contains(e.target as Node)) {
        setGlobalResults([]);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleGlobalSearch(value: string) {
    setGlobalQuery(value);
    if (globalTimerRef.current) clearTimeout(globalTimerRef.current);
    if (value.trim().length < 2) {
      setGlobalResults([]);
      setGlobalSearching(false);
      return;
    }
    setGlobalSearching(true);
    globalTimerRef.current = setTimeout(async () => {
      const r = await api<{ results: SearchResult[] }>(
        `/api/recommendations/search?q=${encodeURIComponent(value.trim())}`
      );
      setGlobalSearching(false);
      if (r.data && r.data.results) {
        setGlobalResults(r.data.results);
      } else {
        setGlobalResults([]);
      }
    }, 400);
  }

  function handleSimilarInputChange(value: string) {
    setSimilarQuery(value);
    if (acTimerRef.current) clearTimeout(acTimerRef.current);
    if (value.trim().length < 2) {
      setAcResults([]);
      setAcOpen(false);
      return;
    }
    acTimerRef.current = setTimeout(async () => {
      const r = await api<{ results: AutocompleteResult[] }>(
        `/api/recommendations/autocomplete?q=${encodeURIComponent(value.trim())}`
      );
      if (r.data && r.data.results) {
        setAcResults(r.data.results);
        setAcOpen(r.data.results.length > 0);
      } else {
        setAcResults([]);
        setAcOpen(false);
      }
    }, 300);
  }

  function handleAcSelect(item: AutocompleteResult) {
    setSimilarQuery(item.title);
    setAcOpen(false);
    // Trigger search with selected title
    setLoading(true);
    api<{ query: string; results: Recommendation[] }>(
      `/api/recommendations/similar?title=${encodeURIComponent(item.title)}`
    ).then((r) => {
      setLoading(false);
      if (r.data && r.data.results) {
        setSimilarResults(r.data.results);
      } else {
        setSimilarResults([]);
        toast(r.error || 'No similar titles found', 'error');
      }
    });
  }

  async function loadMood(mood: string, mt: 'movie' | 'tv' = moodMediaType) {
    setSelectedMood(mood);
    setLoading(true);
    const r = await api<{ mood: string; results: Recommendation[] }>(
      `/api/recommendations/mood?mood=${encodeURIComponent(mood)}&media_type=${mt}`
    );
    setLoading(false);
    if (r.data && r.data.results) {
      setMoodResults(r.data.results);
    } else {
      setMoodResults([]);
      toast(r.error || 'No recommendations found', 'error');
    }
  }

  async function searchSimilar() {
    if (!similarQuery.trim()) return;
    setAcOpen(false);
    setLoading(true);
    const r = await api<{ query: string; results: Recommendation[] }>(
      `/api/recommendations/similar?title=${encodeURIComponent(similarQuery.trim())}`
    );
    setLoading(false);
    if (r.data && r.data.results) {
      setSimilarResults(r.data.results);
    } else {
      setSimilarResults([]);
      toast(r.error || 'No similar titles found', 'error');
    }
  }

  async function loadLibrary() {
    setLibraryLoaded(false);
    const r = await api<{
      genres: string[];
      library_count: number;
      library_items: Recommendation[];
      suggestions: Recommendation[];
    }>('/api/recommendations/library');
    if (r.data) {
      setLibraryItems(r.data.library_items || []);
      setLibrarySuggestions(r.data.suggestions || []);
      setLibraryGenres(r.data.genres || []);
    } else {
      setLibraryItems([]);
      setLibrarySuggestions([]);
    }
    setLibraryLoaded(true);
  }

  const loadTrending = useCallback(async (tw: 'week' | 'day' = 'week') => {
    setTrendingResults([]);
    const r = await api<{ results: Recommendation[]; time_window: string }>(
      `/api/recommendations/trending?time_window=${tw}`
    );
    if (r.data && r.data.results) {
      setTrendingResults(r.data.results);
    }
  }, []);

  async function loadWatchlist() {
    setWatchlistLoaded(false);
    const r = await api<{ items: WatchlistItem[] }>('/api/watchlist');
    if (r.data) setWatchlistItems(r.data.items || []);
    setWatchlistLoaded(true);
  }

  async function removeFromWatchlist(tmdb_id: string, media_type: string) {
    await api(`/api/watchlist?tmdb_id=${tmdb_id}&media_type=${media_type}`, { method: 'DELETE' });
    setWatchlistItems((prev) =>
      prev.filter((w) => !(w.tmdb_id === tmdb_id && w.media_type === media_type))
    );
    toast('Removed from watchlist', 'success');
  }

  function handleAddTorrent(rec: Recommendation) {
    if (rec.type === 'series' || rec.type === 'tv') {
      if (rec.tmdb_id) {
        setSeriesModal(rec);
      } else {
        setTorrentCategory('tv');
        setTorrentQuery(rec.torrent_query);
      }
    } else {
      setTorrentCategory('movies');
      setTorrentQuery(rec.torrent_query);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Discover</h1>
        <div className="page-meta">
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Sparkles size={14} /> Movie & Series Recommendations
          </span>
        </div>
      </header>

      <div className="page-body">
        {/* Global search bar */}
        <div className={styles.globalSearchWrap} ref={globalWrapRef}>
          <div className={styles.globalSearchBar}>
            <Search size={20} className={styles.globalSearchIcon} />
            <input
              type="text"
              className={`input ${styles.globalSearchInput}`}
              placeholder="Search any movie or series..."
              value={globalQuery}
              onChange={(e) => handleGlobalSearch(e.target.value)}
            />
            {globalSearching && (
              <Loader2
                size={16}
                className={styles.spinner}
                style={{
                  position: 'absolute',
                  right: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)',
                }}
              />
            )}
            {globalQuery && !globalSearching && (
              <button
                className={styles.globalClearBtn}
                onClick={() => {
                  setGlobalQuery('');
                  setGlobalResults([]);
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {globalResults.length > 0 && (
            <div className={styles.globalResultsGrid}>
              {[...globalResults]
                .sort((a, b) => {
                  const preferredType = moodMediaType === 'movie' ? 'movie' : 'series';
                  const aMatch = a.type === preferredType ? 0 : 1;
                  const bMatch = b.type === preferredType ? 0 : 1;
                  return aMatch - bMatch;
                })
                .map((item, i) => {
                  const href = `/discover/${item.type === 'series' ? 'tv' : 'movie'}/${item.tmdb_id}`;
                  return (
                    <Link
                      key={i}
                      href={href}
                      className={styles.globalResultCard}
                      onClick={() => {
                        setGlobalResults([]);
                        setGlobalQuery('');
                      }}
                    >
                      {item.poster ? (
                        <img src={item.poster} alt={item.title} className={styles.globalPoster} />
                      ) : (
                        <div className={styles.globalPosterEmpty}>
                          <Film size={20} />
                        </div>
                      )}
                      <div className={styles.globalResultInfo}>
                        <span className={styles.globalResultTitle}>{item.title}</span>
                        <div className={styles.globalResultMeta}>
                          {item.year && <span className="badge gray">{item.year}</span>}
                          <span className={`badge ${item.type === 'series' ? 'purple' : 'blue'}`}>
                            {item.type === 'series' ? 'TV' : 'Movie'}
                          </span>
                          {item.rating > 0 && (
                            <span className={styles.globalResultRating}>
                              {item.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        {item.overview && (
                          <span className={styles.globalResultOverview}>{item.overview}</span>
                        )}
                      </div>
                    </Link>
                  );
                })}
            </div>
          )}
        </div>

        {/* Tab selector */}
        <div className={styles.tabs}>
          <div className="segment-control">
            {[
              { id: 'mood' as const, label: 'By Mood', icon: Heart },
              { id: 'similar' as const, label: 'Similar To...', icon: Search },
              { id: 'library' as const, label: 'From Library', icon: Library },
              { id: 'trending' as const, label: 'Trending', icon: TrendingUp },
              { id: 'watchlist' as const, label: 'Watchlist', icon: Bookmark },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`segment-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'watchlist' && !watchlistLoaded) loadWatchlist();
                }}
              >
                <tab.icon size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mood-based picker */}
        {activeTab === 'mood' && (
          <div className="section">
            <div className={styles.moodTopBar}>
              <div className="segment-control" style={{ fontSize: '0.8rem' }}>
                {(['movie', 'tv'] as const).map((mt) => (
                  <button
                    key={mt}
                    className={`segment-btn ${moodMediaType === mt ? 'active' : ''}`}
                    onClick={() => {
                      setMoodMediaType(mt);
                      if (selectedMood) loadMood(selectedMood, mt);
                    }}
                  >
                    {mt === 'movie' ? (
                      <>
                        <Film size={12} /> Movies
                      </>
                    ) : (
                      <>
                        <Tv size={12} /> Shows
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.moodGrid}>
              {MOODS.map((mood) => (
                <button
                  key={mood.id}
                  className={`${styles.moodCard} ${selectedMood === mood.id ? styles.moodActive : ''}`}
                  onClick={() => loadMood(mood.id)}
                  style={{ '--mood-color': mood.color } as React.CSSProperties}
                >
                  <mood.icon size={24} strokeWidth={1.5} />
                  <span>{mood.label}</span>
                </button>
              ))}
            </div>

            {loading && (
              <div className={styles.loadingState}>
                <Loader2 size={20} className={styles.spinner} /> Finding recommendations...
              </div>
            )}

            {!loading && moodResults.length > 0 && (
              <>
                <h3 className="section-title" style={{ marginTop: 24 }}>
                  {MOODS.find((m) => m.id === selectedMood)?.label} Recommendations
                </h3>
                <div className={`${styles.recGrid} stagger-children`}>
                  {moodResults.map((rec, i) => (
                    <RecommendationCard key={i} rec={rec} onAddTorrent={handleAddTorrent} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Similar To search */}
        {activeTab === 'similar' && (
          <div className="section">
            <div className={styles.searchBar}>
              <div className={styles.searchInputWrap} ref={acWrapRef}>
                <Search size={16} className={styles.searchIcon} />
                <input
                  type="text"
                  className={`input ${styles.searchInput}`}
                  placeholder="Enter a movie or series name..."
                  value={similarQuery}
                  onChange={(e) => handleSimilarInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setAcOpen(false);
                      searchSimilar();
                    }
                  }}
                  onFocus={() => {
                    if (acResults.length > 0) setAcOpen(true);
                  }}
                />
                {acOpen && acResults.length > 0 && (
                  <div className={styles.acDropdown}>
                    {acResults.map((item, i) => (
                      <button
                        key={i}
                        className={styles.acItem}
                        onClick={() => handleAcSelect(item)}
                      >
                        <span className={styles.acTitle}>{item.title}</span>
                        <span className={styles.acMeta}>
                          {item.year && <span className="badge gray">{item.year}</span>}
                          <span
                            className={`badge ${item.type === 'series' || item.type === 'tv' ? 'purple' : 'blue'}`}
                          >
                            {item.type === 'series' || item.type === 'tv' ? 'TV' : 'Movie'}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setAcOpen(false);
                  searchSimilar();
                }}
                disabled={loading}
              >
                {loading ? 'Searching...' : 'Find Similar'}
              </button>
            </div>

            {loading && (
              <div className={styles.loadingState}>
                <Loader2 size={20} className={styles.spinner} /> Searching Reddit for similar
                titles...
              </div>
            )}

            {!loading && similarResults.length > 0 && (
              <div className={`${styles.recGrid} stagger-children`}>
                {similarResults.map((rec, i) => (
                  <RecommendationCard key={i} rec={rec} onAddTorrent={handleAddTorrent} />
                ))}
              </div>
            )}

            {!loading && similarResults.length === 0 && similarQuery && (
              <div className="empty-state">
                Search for a title to find similar movies and series
              </div>
            )}
          </div>
        )}

        {/* From Library */}
        {activeTab === 'library' && (
          <div className="section">
            {!libraryLoaded && (
              <div className={styles.loadingState}>
                <Loader2 size={20} className={styles.spinner} /> Loading your library...
              </div>
            )}

            {libraryLoaded && (
              <>
                {libraryGenres.length > 0 && (
                  <div className={styles.genreTags}>
                    <span className={styles.genreLabel}>Your top genres:</span>
                    {libraryGenres.map((g) => (
                      <span key={g} className="badge blue">
                        {g}
                      </span>
                    ))}
                    <button
                      className={`btn btn-sm ${styles.refreshBtn}`}
                      onClick={loadLibrary}
                      style={{ marginLeft: 'auto' }}
                    >
                      Refresh
                    </button>
                  </div>
                )}

                {/* Library items */}
                {libraryItems.length > 0 && (
                  <>
                    <h3 className="section-title" style={{ marginTop: 16 }}>
                      <Library size={16} style={{ marginRight: 6, verticalAlign: -3 }} />
                      Your Library ({libraryItems.length})
                    </h3>
                    <div className={styles.libraryGrid}>
                      {libraryItems.map((rec, i) => (
                        <Link
                          key={i}
                          href={getDetailHref(rec) || '#'}
                          className={styles.libraryCard}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          {rec.poster ? (
                            <img
                              src={rec.poster}
                              alt={rec.title}
                              className={styles.libraryPoster}
                              loading="lazy"
                            />
                          ) : (
                            <div className={styles.libraryPosterEmpty}>
                              <Film size={20} />
                            </div>
                          )}
                          <span className={styles.libraryTitle}>{rec.title}</span>
                          <div className={styles.libraryMeta}>
                            {rec.year && <span className="badge gray">{rec.year}</span>}
                            <span className={`badge ${rec.type === 'series' ? 'purple' : 'blue'}`}>
                              {rec.type === 'series' ? 'TV' : 'Movie'}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}

                {/* Suggestions */}
                {librarySuggestions.length > 0 && (
                  <>
                    <h3 className="section-title" style={{ marginTop: 32 }}>
                      <Sparkles size={16} style={{ marginRight: 6, verticalAlign: -3 }} />
                      Recommended For You
                    </h3>
                    <div className={styles.filterBar}>
                      <div className="segment-control" style={{ fontSize: '0.8rem' }}>
                        {(['all', 'movie', 'series'] as const).map((t) => (
                          <button
                            key={t}
                            className={`segment-btn ${libraryFilterType === t ? 'active' : ''}`}
                            onClick={() => setLibraryFilterType(t)}
                          >
                            {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'Series'}
                          </button>
                        ))}
                      </div>
                      {libraryGenres.length > 0 && (
                        <select
                          className={`input ${styles.genreSelect}`}
                          value={libraryFilterGenre}
                          onChange={(e) => setLibraryFilterGenre(e.target.value)}
                        >
                          <option value="all">All Genres</option>
                          {libraryGenres.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className={`${styles.recGrid} stagger-children`}>
                      {librarySuggestions
                        .filter(
                          (rec) => libraryFilterType === 'all' || rec.type === libraryFilterType
                        )
                        .map((rec, i) => (
                          <RecommendationCard key={i} rec={rec} onAddTorrent={handleAddTorrent} />
                        ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Trending */}
        {activeTab === 'trending' && (
          <div className="section">
            <div className={styles.filterBar}>
              <div className="segment-control" style={{ fontSize: '0.8rem' }}>
                {(['week', 'day'] as const).map((tw) => (
                  <button
                    key={tw}
                    className={`segment-btn ${trendingWindow === tw ? 'active' : ''}`}
                    onClick={() => {
                      setTrendingWindow(tw);
                      loadTrending(tw);
                    }}
                  >
                    {tw === 'week' ? 'This Week' : 'Today'}
                  </button>
                ))}
              </div>
              <div className="segment-control" style={{ fontSize: '0.8rem' }}>
                {(['all', 'movie', 'series'] as const).map((t) => (
                  <button
                    key={t}
                    className={`segment-btn ${trendingFilterType === t ? 'active' : ''}`}
                    onClick={() => setTrendingFilterType(t)}
                  >
                    {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'Series'}
                  </button>
                ))}
              </div>
            </div>
            {trendingResults.length === 0 ? (
              <div className={styles.loadingState}>
                <Loader2 size={20} className={styles.spinner} /> Loading trending...
              </div>
            ) : (
              <div className={`${styles.recGrid} stagger-children`}>
                {trendingResults
                  .filter((rec) => trendingFilterType === 'all' || rec.type === trendingFilterType)
                  .map((rec, i) => (
                    <RecommendationCard key={i} rec={rec} onAddTorrent={handleAddTorrent} />
                  ))}
              </div>
            )}
          </div>
        )}
        {/* Watchlist */}
        {activeTab === 'watchlist' && (
          <div className="section">
            {!watchlistLoaded ? (
              <div className={styles.loadingState}>
                <Loader2 size={20} className={styles.spinner} /> Loading watchlist...
              </div>
            ) : watchlistItems.length === 0 ? (
              <div className="empty-state">
                <Bookmark size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                <div>Your watchlist is empty</div>
                <div style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: 4 }}>
                  Save movies from their detail page to see them here
                </div>
              </div>
            ) : (
              <>
                <div className={styles.filterBar}>
                  <div className="segment-control" style={{ fontSize: '0.8rem' }}>
                    {['all', 'Must Watch', 'Maybe Later', 'Recommended'].map((cat) => (
                      <button
                        key={cat}
                        className={`segment-btn ${watchlistFilter === cat ? 'active' : ''}`}
                        onClick={() => setWatchlistFilter(cat)}
                      >
                        {cat === 'all'
                          ? `All (${watchlistItems.length})`
                          : `${cat} (${watchlistItems.filter((w) => w.category === cat).length})`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.libraryGrid}>
                  {watchlistItems
                    .filter((w) => watchlistFilter === 'all' || w.category === watchlistFilter)
                    .map((w) => {
                      const href = `/discover/${w.media_type === 'tv' || w.media_type === 'series' ? 'tv' : 'movie'}/${w.tmdb_id}`;
                      return (
                        <div
                          key={w.id}
                          className={styles.libraryCard}
                          style={{ position: 'relative' }}
                        >
                          <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
                            {w.poster ? (
                              <img
                                src={w.poster}
                                alt={w.title}
                                className={styles.libraryPoster}
                                loading="lazy"
                              />
                            ) : (
                              <div className={styles.libraryPosterEmpty}>
                                <Film size={20} />
                              </div>
                            )}
                            <span className={styles.libraryTitle}>{w.title}</span>
                            <div className={styles.libraryMeta}>
                              {w.year && <span className="badge gray">{w.year}</span>}
                              <span
                                className={`badge ${w.category === 'Must Watch' ? 'orange' : w.category === 'Recommended' ? 'green' : 'blue'}`}
                              >
                                {w.category}
                              </span>
                            </div>
                          </Link>
                          <button
                            className={styles.watchlistRemoveBtn}
                            onClick={() => removeFromWatchlist(w.tmdb_id, w.media_type)}
                            title="Remove from watchlist"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Torrent search modal */}
      {torrentQuery && (
        <TorrentSearchModal
          query={torrentQuery}
          onClose={() => {
            setTorrentQuery(null);
            setTorrentCategory('');
          }}
          category={torrentCategory}
        />
      )}

      {/* Series season modal */}
      {seriesModal && <SeriesSeasonModal rec={seriesModal} onClose={() => setSeriesModal(null)} />}
    </>
  );
}
