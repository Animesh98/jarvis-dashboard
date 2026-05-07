'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import TorrentSearchModal from '@/components/TorrentSearchModal';
import {
  ArrowLeft,
  Star,
  Clock,
  Film,
  Tv,
  Plus,
  X,
  Loader2,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  Download,
  Play,
  Bookmark,
  BookmarkCheck,
  Clapperboard,
} from 'lucide-react';
import styles from './page.module.scss';

interface CastMember {
  name: string;
  character: string;
  photo: string;
}

interface SimilarMovie {
  title: string;
  year: string;
  tmdb_id: string;
  poster: string;
  rating: number;
  type: string;
}

interface KBMovie {
  title: string;
  year: string;
  type: string;
  tmdb_id?: string;
  torrent_query: string;
  poster?: string;
  rating?: number;
}

interface MovieDetail {
  title: string;
  year: string;
  overview: string;
  poster: string;
  backdrop: string;
  genres: string[];
  runtime: number;
  rating: number;
  vote_count: number;
  cast: CastMember[];
  director: string;
  tagline: string;
  status: string;
  tmdb_id: string;
  type: string;
  original_language: string;
  torrent_query: string;
  imdb_id?: string;
  trailers?: { key: string; name: string; type: string; official: boolean }[];
  similar_tmdb: SimilarMovie[];
  similar_kb: KBMovie[];
  error?: string;
}

interface ExternalRatings {
  imdb: { rating?: string; votes?: string; url?: string };
  letterboxd: { rating?: string; url?: string };
}

export default function MovieDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [detail, setDetail] = useState<MovieDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [torrentQuery, setTorrentQuery] = useState<string | null>(null);
  const [torrentCategory, setTorrentCategory] = useState<string>('');
  const [showSeasons, setShowSeasons] = useState(false);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [libraryInfo, setLibraryInfo] = useState<{
    in_library: boolean;
    jellyfin_id?: string;
  } | null>(null);
  const [ytInfo, setYtInfo] = useState<{
    available: boolean;
    url?: string;
    title?: string;
    duration?: number;
    channel?: string;
  } | null>(null);
  const [externalRatings, setExternalRatings] = useState<ExternalRatings | null>(null);
  const [watchlistStatus, setWatchlistStatus] = useState<{
    in_watchlist: boolean;
    category: string | null;
  }>({ in_watchlist: false, category: null });
  const [showTrailer, setShowTrailer] = useState(false);
  const [showWatchlistPicker, setShowWatchlistPicker] = useState(false);

  const type = params.type as string;
  const id = params.id as string;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const r = await api<MovieDetail>(`/api/recommendations/detail?tmdb_id=${id}&type=${type}`);
      setLoading(false);
      if (r.data && !r.data.error) {
        setDetail(r.data);
        // Fire all secondary checks in parallel (don't block each other)
        api<{ in_library: boolean; jellyfin_id?: string }>(
          `/api/jellyfin-media/library-check?tmdb_id=${id}&media_type=${type}`
        ).then((lib) => {
          if (lib.data) setLibraryInfo(lib.data);
        });

        api<{ in_watchlist: boolean; category: string | null }>(
          `/api/watchlist/check?tmdb_id=${id}&media_type=${type}`
        ).then((wl) => {
          if (wl.data) setWatchlistStatus(wl.data);
        });

        // Lazy-load external ratings (IMDB + Letterboxd) — pass known data to avoid redundant TMDB calls
        const extParams = new URLSearchParams({ tmdb_id: id, type });
        if (r.data.imdb_id) extParams.set('imdb_id', r.data.imdb_id);
        if (r.data.title) extParams.set('title', r.data.title);
        if (r.data.year) extParams.set('year', r.data.year);
        api<ExternalRatings>(`/api/recommendations/external-ratings?${extParams}`).then((ext) => {
          if (ext.data) setExternalRatings(ext.data);
        });

        // YouTube check — only for Indian language content (hi, ta, te, ml, kn, bn, mr, pa, gu, etc.)
        const indianLangs = [
          'hi',
          'ta',
          'te',
          'ml',
          'kn',
          'bn',
          'mr',
          'pa',
          'gu',
          'or',
          'as',
          'ur',
        ];
        if (type === 'movie' && indianLangs.includes(r.data.original_language)) {
          fetch(
            `/api/streaming/youtube?title=${encodeURIComponent(r.data.title)}&year=${encodeURIComponent(r.data.year || '')}`,
            {
              signal: AbortSignal.timeout(30000),
            }
          )
            .then((res) => res.json())
            .then((data) => {
              if (data?.available) setYtInfo(data);
            })
            .catch(() => {});
        }
      } else {
        toast(r.error || r.data?.error || 'Failed to load details', 'error');
      }
    }
    if (id && type) load();
  }, [id, type]);

  function formatRuntime(min: number): string {
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const navBar = (
    <header className="page-header">
      <nav className={styles.breadcrumb}>
        <button className="btn btn-ghost btn-sm" onClick={() => router.back()} title="Go back">
          <ArrowLeft size={16} />
        </button>
        <Link href="/" className={styles.breadcrumbLink}>
          Home
        </Link>
        <span className={styles.breadcrumbSep}>/</span>
        <Link href="/discover" className={styles.breadcrumbLink}>
          Discover
        </Link>
        <span className={styles.breadcrumbSep}>/</span>
        <span className={styles.breadcrumbCurrent}>
          {detail ? detail.title : type === 'tv' ? 'Series' : 'Movie'}
        </span>
      </nav>
    </header>
  );

  if (loading) {
    return (
      <>
        {navBar}
        <div className="page-body">
          <div className={styles.loadingState}>
            <Loader2 size={24} className={styles.spinner} /> Loading details...
          </div>
        </div>
      </>
    );
  }

  if (!detail) {
    return (
      <>
        {navBar}
        <div className="page-body">
          <div className="empty-state">Could not load movie details</div>
        </div>
      </>
    );
  }

  // Combine similar movies from TMDB and KB, deduplicating
  const allSimilar: SimilarMovie[] = [...detail.similar_tmdb];
  const seenIds = new Set(detail.similar_tmdb.map((s) => s.tmdb_id));
  for (const kb of detail.similar_kb) {
    if (kb.tmdb_id && !seenIds.has(kb.tmdb_id)) {
      seenIds.add(kb.tmdb_id);
      allSimilar.push({
        title: kb.title,
        year: kb.year,
        tmdb_id: kb.tmdb_id,
        poster: kb.poster || '',
        rating: kb.rating || 0,
        type: kb.type === 'series' ? 'tv' : kb.type,
      });
    }
  }

  return (
    <>
      {navBar}

      <div className={styles.detailPage}>
        {/* Hero section */}
        <div
          className={styles.hero}
          style={detail.backdrop ? { backgroundImage: `url(${detail.backdrop})` } : undefined}
        >
          <div className={styles.heroOverlay}>
            <div className={styles.heroContent}>
              {detail.poster && (
                <img src={detail.poster} alt={detail.title} className={styles.heroPoster} />
              )}
              <div className={styles.heroInfo}>
                <h2 className={styles.heroTitle}>{detail.title}</h2>
                {detail.tagline && <p className={styles.heroTagline}>{detail.tagline}</p>}
                <div className={styles.heroMeta}>
                  {detail.year && <span className="badge gray">{detail.year}</span>}
                  {detail.runtime > 0 && (
                    <span className={styles.metaItem}>
                      <Clock size={12} /> {formatRuntime(detail.runtime)}
                    </span>
                  )}
                  {detail.rating > 0 && (
                    <span className={styles.metaItem}>
                      <Star size={12} /> {detail.rating}/10 ({detail.vote_count.toLocaleString()}{' '}
                      votes)
                    </span>
                  )}
                  {externalRatings?.imdb?.url && (
                    <a
                      href={externalRatings.imdb.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.ratingBadge}
                      style={{ '--badge-color': '#f5c518' } as React.CSSProperties}
                      title={
                        externalRatings.imdb.votes
                          ? `${externalRatings.imdb.votes} votes`
                          : 'View on IMDB'
                      }
                    >
                      <span className={styles.ratingBadgeLabel}>IMDb</span>
                      {externalRatings.imdb.rating && externalRatings.imdb.rating !== 'N/A' && (
                        <span className={styles.ratingBadgeValue}>
                          {externalRatings.imdb.rating}
                        </span>
                      )}
                    </a>
                  )}
                  {externalRatings?.letterboxd?.url && (
                    <a
                      href={externalRatings.letterboxd.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.ratingBadge}
                      style={{ '--badge-color': '#00e054' } as React.CSSProperties}
                      title="View on Letterboxd"
                    >
                      <span className={styles.ratingBadgeLabel}>Letterboxd</span>
                      {externalRatings.letterboxd.rating && (
                        <span className={styles.ratingBadgeValue}>
                          {externalRatings.letterboxd.rating}
                        </span>
                      )}
                    </a>
                  )}
                  {detail.status && detail.status !== 'Released' && (
                    <span className="badge orange">{detail.status}</span>
                  )}
                </div>
                <div className={styles.heroGenres}>
                  {detail.genres.map((g) => (
                    <span key={g} className="badge blue">
                      {g}
                    </span>
                  ))}
                </div>
                {detail.director && (
                  <div className={styles.heroDirector}>
                    Directed by <strong>{detail.director}</strong>
                  </div>
                )}
                <div className={styles.heroActions}>
                  {libraryInfo?.in_library && libraryInfo.jellyfin_id && (
                    <a
                      href={`http://${window.location.hostname}:8096/web/#/details?id=${libraryInfo.jellyfin_id}`}
                      target="_blank"
                      rel="noopener"
                      className={`btn ${styles.playBtn}`}
                    >
                      <Play size={14} /> Play on Jellyfin
                    </a>
                  )}
                  {ytInfo?.available && ytInfo.url && (
                    <a
                      href={
                        typeof navigator !== 'undefined' &&
                        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
                          ? ytInfo.url.replace('www.youtube.com', 'm.youtube.com')
                          : ytInfo.url
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`btn ${styles.youtubeBtn}`}
                      title={
                        ytInfo.channel
                          ? `${ytInfo.channel} · ${Math.floor((ytInfo.duration || 0) / 60)}m`
                          : 'Watch on YouTube'
                      }
                    >
                      <Play size={14} /> YouTube
                    </a>
                  )}
                  {detail.trailers && detail.trailers.length > 0 && (
                    <button
                      className={`btn ${styles.trailerBtn}`}
                      onClick={() => setShowTrailer(true)}
                    >
                      <Clapperboard size={14} /> Trailer
                    </button>
                  )}
                  <div className={styles.watchlistWrap}>
                    <button
                      className={`btn ${watchlistStatus.in_watchlist ? styles.watchlistBtnActive : styles.watchlistBtn}`}
                      onClick={() => {
                        if (watchlistStatus.in_watchlist) {
                          api(
                            `/api/watchlist?tmdb_id=${detail.tmdb_id}&media_type=${detail.type}`,
                            { method: 'DELETE' }
                          ).then(() => {
                            setWatchlistStatus({ in_watchlist: false, category: null });
                            toast('Removed from watchlist', 'success');
                          });
                        } else {
                          setShowWatchlistPicker(!showWatchlistPicker);
                        }
                      }}
                    >
                      {watchlistStatus.in_watchlist ? (
                        <BookmarkCheck size={14} />
                      ) : (
                        <Bookmark size={14} />
                      )}
                      {watchlistStatus.in_watchlist ? watchlistStatus.category || 'Saved' : 'Save'}
                    </button>
                    {showWatchlistPicker && !watchlistStatus.in_watchlist && (
                      <div className={styles.watchlistDropdown}>
                        {['Must Watch', 'Maybe Later', 'Recommended'].map((cat) => (
                          <button
                            key={cat}
                            className={styles.watchlistOption}
                            onClick={async () => {
                              const r = await api('/api/watchlist', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  tmdb_id: detail.tmdb_id,
                                  media_type: detail.type,
                                  title: detail.title,
                                  year: detail.year,
                                  poster: detail.poster,
                                  category: cat,
                                }),
                              });
                              if (!r.error) {
                                setWatchlistStatus({ in_watchlist: true, category: cat });
                                toast(`Added to ${cat}`, 'success');
                              }
                              setShowWatchlistPicker(false);
                            }}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className={`btn ${libraryInfo?.in_library ? 'btn-ghost' : 'btn-primary'}`}
                    onClick={async () => {
                      if (detail.type === 'tv') {
                        setLoadingSeasons(true);
                        setShowSeasons(true);
                        const r = await api<{ title: string; seasons: any[] }>(
                          `/api/recommendations/series-seasons?tmdb_id=${detail.tmdb_id}&title=${encodeURIComponent(detail.title)}`
                        );
                        setLoadingSeasons(false);
                        if (r.data) setSeasons(r.data.seasons || []);
                      } else {
                        setTorrentQuery(detail.torrent_query);
                      }
                    }}
                  >
                    <Search size={14} /> Find Torrent
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Synopsis */}
        {detail.overview && (
          <div className={styles.section}>
            <h3 className="section-title">Synopsis</h3>
            <p className={styles.overview}>{detail.overview}</p>
          </div>
        )}

        {/* Cast */}
        {detail.cast.length > 0 && (
          <div className={styles.section}>
            <h3 className="section-title">Cast</h3>
            <div className={styles.castGrid}>
              {detail.cast.map((member, i) => (
                <div key={i} className={styles.castCard}>
                  {member.photo ? (
                    <img src={member.photo} alt={member.name} className={styles.castPhoto} />
                  ) : (
                    <div className={styles.castPhotoPlaceholder}>
                      <Film size={20} />
                    </div>
                  )}
                  <div className={styles.castName}>{member.name}</div>
                  <div className={styles.castCharacter}>{member.character}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Similar Movies */}
        {allSimilar.length > 0 && (
          <div className={styles.section}>
            <h3 className="section-title">Similar Titles</h3>
            <div className={styles.similarGrid}>
              {allSimilar.map((s, i) => {
                const sType = s.type === 'series' ? 'tv' : s.type === 'tv' ? 'tv' : 'movie';
                return s.tmdb_id ? (
                  <Link
                    key={i}
                    href={`/discover/${sType}/${s.tmdb_id}`}
                    className={styles.similarCard}
                  >
                    {s.poster ? (
                      <img src={s.poster} alt={s.title} className={styles.similarPoster} />
                    ) : (
                      <div className={styles.similarPosterPlaceholder}>
                        <Film size={24} />
                      </div>
                    )}
                    <div className={styles.similarInfo}>
                      <div className={styles.similarTitle}>{s.title}</div>
                      <div className={styles.similarMeta}>
                        {s.year && <span>{s.year}</span>}
                        {s.rating > 0 && (
                          <span>
                            <Star size={10} /> {s.rating}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div key={i} className={styles.similarCard}>
                    <div className={styles.similarPosterPlaceholder}>
                      <Film size={24} />
                    </div>
                    <div className={styles.similarInfo}>
                      <div className={styles.similarTitle}>{s.title}</div>
                      <div className={styles.similarMeta}>
                        {s.year && <span>{s.year}</span>}
                        {s.rating > 0 && (
                          <span>
                            <Star size={10} /> {s.rating}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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

      {/* Series season picker modal */}
      {/* Trailer modal */}
      {showTrailer && detail.trailers && detail.trailers.length > 0 && (
        <div className={styles.modalOverlay} onClick={() => setShowTrailer(false)}>
          <div className={styles.trailerModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{detail.trailers[0].name}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTrailer(false)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.trailerBody}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${detail.trailers[0].key}?autoplay=1&rel=0`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className={styles.trailerIframe}
              />
            </div>
            {detail.trailers.length > 1 && (
              <div className={styles.trailerList}>
                {detail.trailers.map((t, i) => (
                  <button
                    key={t.key}
                    className={styles.trailerListItem}
                    onClick={() => {
                      // Swap to top
                      const iframe = document.querySelector(
                        `.${styles.trailerIframe}`
                      ) as HTMLIFrameElement;
                      if (iframe)
                        iframe.src = `https://www.youtube-nocookie.com/embed/${t.key}?autoplay=1&rel=0`;
                    }}
                  >
                    <Clapperboard size={12} />
                    <span>{t.name}</span>
                    {t.official && (
                      <span
                        className="badge green"
                        style={{ fontSize: '0.6rem', padding: '1px 4px' }}
                      >
                        Official
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showSeasons && !torrentQuery && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setShowSeasons(false);
            setExpandedSeason(null);
          }}
        >
          <div className={styles.seasonModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{detail?.title}</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowSeasons(false);
                  setExpandedSeason(null);
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className={styles.seasonModalBody}>
              {loadingSeasons ? (
                <div className={styles.loadingState}>
                  <Loader2 size={20} className={styles.spinner} /> Loading seasons...
                </div>
              ) : seasons.length === 0 ? (
                <div className="empty-state" style={{ padding: 16 }}>
                  No season data found
                </div>
              ) : (
                <div className={styles.seasonList}>
                  {seasons.map((s: any) => {
                    const isExpanded = expandedSeason === s.season_number;
                    const missingEps = (s.episodes || []).filter((e: any) => !e.in_library);
                    return (
                      <div key={s.season_number} className={styles.seasonBlock}>
                        {/* Season header */}
                        <div
                          className={`${styles.seasonHeader} ${s.complete ? styles.seasonComplete : ''}`}
                          onClick={() => setExpandedSeason(isExpanded ? null : s.season_number)}
                        >
                          <span className={styles.seasonChevron}>
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                          <span className={styles.seasonName}>{s.name}</span>
                          <span className={styles.seasonMeta}>
                            {s.existing_count}/{s.episode_count} eps
                          </span>
                          {s.complete && (
                            <span className="badge green">
                              <Check size={10} /> Complete
                            </span>
                          )}
                          {s.existing_count > 0 && !s.complete && (
                            <span className="badge orange">{missingEps.length} missing</span>
                          )}
                          {!s.complete && (
                            <button
                              className={`btn btn-sm ${styles.seasonDlBtn}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTorrentCategory('tv');
                                setTorrentQuery(s.torrent_query);
                              }}
                            >
                              <Download size={12} /> Full Season
                            </button>
                          )}
                        </div>

                        {/* Episode list (expanded) */}
                        {isExpanded && (
                          <div className={styles.episodeList}>
                            {(s.episodes || []).map((ep: any) => (
                              <div
                                key={ep.episode_number}
                                className={`${styles.episodeRow} ${ep.in_library ? styles.episodeOwned : ''}`}
                              >
                                <span className={styles.episodeNum}>
                                  E{String(ep.episode_number).padStart(2, '0')}
                                </span>
                                <span className={styles.episodeName}>{ep.name}</span>
                                {ep.runtime > 0 && (
                                  <span className={styles.episodeRuntime}>{ep.runtime}m</span>
                                )}
                                {ep.in_library ? (
                                  <span className={styles.episodeCheck}>
                                    <Check size={14} />
                                  </span>
                                ) : (
                                  <button
                                    className={`btn btn-sm ${styles.episodeDlBtn}`}
                                    onClick={() => {
                                      setTorrentCategory('tv');
                                      setTorrentQuery(ep.torrent_query);
                                    }}
                                  >
                                    <Download size={11} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
