'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Play, Download, Compass, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import TorrentSearchModal from '@/components/TorrentSearchModal';
import styles from './page.module.scss';

interface Entity {
  name: string;
  type: string;
  tmdb_id: string;
}

type Verb = 'watch' | 'download' | 'discover';

const WATCH_WORDS = ['watch', 'stream', 'play', 'see', 'view'];
const DOWNLOAD_WORDS = ['download', 'get', 'grab', 'torrent', 'fetch'];

function detectVerb(title: string): Verb {
  const stripped = title.replace(/\{\{(.+?)\}\}/g, '$1').trim();
  const firstWord =
    stripped
      .split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^a-z]/g, '') || '';
  if (WATCH_WORDS.includes(firstWord)) return 'watch';
  if (DOWNLOAD_WORDS.includes(firstWord)) return 'download';
  return 'discover';
}

interface LibraryStatus {
  loading: boolean;
  inLibrary: boolean;
  jellyfinId: string | null;
}

// Module-level cache to avoid re-fetching for the same entity within a session
const libCache = new Map<string, LibraryStatus>();

function cacheKey(e: Entity): string {
  return `${e.type}:${e.tmdb_id}`;
}

function useLibraryStatus(entity: Entity, enabled: boolean): LibraryStatus {
  const key = cacheKey(entity);
  const [status, setStatus] = useState<LibraryStatus>(
    libCache.get(key) || { loading: enabled, inLibrary: false, jellyfinId: null }
  );

  useEffect(() => {
    if (!enabled || !entity.tmdb_id) return;
    const cached = libCache.get(key);
    if (cached && !cached.loading) {
      setStatus(cached);
      return;
    }
    const mediaType = entity.type === 'tv' || entity.type === 'series' ? 'tv' : 'movie';
    const url = `/api/jellyfin-media/library-check?tmdb_id=${encodeURIComponent(entity.tmdb_id)}&media_type=${mediaType}`;
    api<{ in_library: boolean; jellyfin_id?: string }>(url).then((r) => {
      const next: LibraryStatus = {
        loading: false,
        inLibrary: !!r.data?.in_library,
        jellyfinId: r.data?.jellyfin_id || null,
      };
      libCache.set(key, next);
      setStatus(next);
    });
  }, [key, enabled, entity.tmdb_id, entity.type]);

  return status;
}

function jellyfinPlayUrl(jellyfinId: string): string {
  // Match Discover detail page: use the user's current host so jackal stays jackal,
  // and a LAN IP stays a LAN IP. Avoids backend-side hard-coded hostname rewrite.
  if (typeof window === 'undefined') return '#';
  return `http://${window.location.hostname}:8096/web/#/details?id=${jellyfinId}`;
}

function EntityActions({
  entity,
  verb,
  enabled,
  onOpenTorrents,
}: {
  entity: Entity;
  verb: Verb;
  enabled: boolean;
  onOpenTorrents: (entity: Entity) => void;
}) {
  const status = useLibraryStatus(entity, enabled);
  const mediaType = entity.type === 'tv' || entity.type === 'series' ? 'tv' : 'movie';

  if (!entity.tmdb_id) return null;

  const playHref = status.jellyfinId ? jellyfinPlayUrl(status.jellyfinId) : null;
  const discoverHref = `/discover/${mediaType}/${entity.tmdb_id}`;

  const showPlay = verb === 'watch' && status.inLibrary && playHref;
  const showTorrent =
    verb === 'download' || (verb === 'watch' && !status.inLibrary && !status.loading);
  const showDiscover = true;

  return (
    <div
      className={styles.smartActions}
      onClick={(e) => e.stopPropagation()}
      data-entity-name={entity.name}
    >
      {status.loading && verb === 'watch' && (
        <span className={styles.smartLoading}>
          <Loader2 size={10} className={styles.spin} />
        </span>
      )}
      {showPlay && playHref && (
        <a
          href={playHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${styles.smartBtn} ${styles.smartBtnPlay}`}
          title={`Play ${entity.name} on Jellyfin`}
        >
          <Play size={11} fill="currentColor" />
          <span>Play</span>
        </a>
      )}
      {showTorrent && (
        <button
          type="button"
          className={`${styles.smartBtn} ${styles.smartBtnTorrent}`}
          title={`Find torrent for ${entity.name}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenTorrents(entity);
          }}
        >
          <Download size={11} />
          <span>Get</span>
        </button>
      )}
      {showDiscover && (
        <Link
          href={discoverHref}
          className={`${styles.smartBtn} ${styles.smartBtnDiscover}`}
          title={`Open ${entity.name} details`}
        >
          <Compass size={11} />
          <span>Info</span>
        </Link>
      )}
    </div>
  );
}

function torrentQueryFor(entity: Entity): { query: string; category: string } {
  const isTv = entity.type === 'tv' || entity.type === 'series';
  return {
    query: isTv ? `${entity.name} S01 complete` : entity.name,
    category: isTv ? 'tv' : 'movies',
  };
}

export default function TaskSmartActions({
  title,
  entities,
  isDone,
}: {
  title: string;
  entities: Entity[];
  isDone: boolean;
}) {
  const [torrentTarget, setTorrentTarget] = useState<Entity | null>(null);

  const linkedEntities = entities.filter((e) => e.tmdb_id);
  if (linkedEntities.length === 0 || isDone) return null;

  const verb = detectVerb(title);
  const torrentInfo = torrentTarget ? torrentQueryFor(torrentTarget) : null;

  return (
    <>
      <div className={styles.smartActionsWrap}>
        {linkedEntities.map((e, i) => (
          <EntityActions
            key={`${e.tmdb_id}-${i}`}
            entity={e}
            verb={verb}
            enabled={!isDone}
            onOpenTorrents={setTorrentTarget}
          />
        ))}
      </div>
      {torrentInfo && torrentTarget && (
        <TorrentSearchModal
          query={torrentInfo.query}
          category={torrentInfo.category}
          onClose={() => setTorrentTarget(null)}
        />
      )}
    </>
  );
}
