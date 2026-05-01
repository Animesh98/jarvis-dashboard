'use client';

import Link from 'next/link';
import { useData } from '@/lib/DataContext';
import { MiniGauge } from '@/components/Gauge';
import { fmtSpeed } from '@/lib/api';
import { Cpu, Container, ArrowDownUp, Film, Wifi, CloudSun, ChevronRight } from 'lucide-react';
import styles from './page.module.scss';

export default function OverviewPage() {
  const { data } = useData();
  const { sys, containers, torrents, transfer, counts, sessions, weather } = data;

  const cpuP = sys ? Math.min(Math.round((sys.cpu_load[0] / sys.cpu_count) * 100), 100) : 0;
  const memP = sys?.memory?.used_percent || 0;
  const diskP = sys?.disk?.used_percent || 0;

  const running = Array.isArray(containers)
    ? containers.filter((c: any) => c.State === 'running').length
    : 0;
  const total = Array.isArray(containers) ? containers.length : 0;
  const stopped = Array.isArray(containers)
    ? containers
        .filter((c: any) => c.State !== 'running')
        .map((c: any) => c.Names?.replace(/^\//, ''))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const tCount = Array.isArray(torrents) ? torrents.length : 0;
  const dlSpeed = transfer ? fmtSpeed(transfer.dl_info_speed) : '--';
  const ulSpeed = transfer ? fmtSpeed(transfer.up_info_speed) : '--';
  const activeT = Array.isArray(torrents)
    ? torrents.filter((t: any) => t.state?.includes('DL')).length
    : 0;
  const npCount = Array.isArray(sessions)
    ? sessions.filter((s: any) => s.NowPlayingItem).length
    : 0;

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Overview</h1>
        <div className="page-meta">
          {weather && !weather.error && (
            <span>
              <CloudSun size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
              {weather.temp_c}° {weather.condition}
            </span>
          )}
          {sys?.uptime_human && <span>Up {sys.uptime_human}</span>}
        </div>
      </header>

      <div className="page-body">
        <div className={`${styles.grid} stagger-children`}>
          {/* System */}
          <Link href="/system" prefetch={true} className={`metric-card ${styles.systemCard}`}>
            <div className={styles.cardIcon}>
              <Cpu size={16} />
            </div>
            <div className="metric-label">System</div>
            <div className={styles.gaugeRow}>
              {[
                { p: cpuP, l: 'CPU' },
                { p: memP, l: 'MEM' },
                { p: diskP, l: 'DISK' },
              ].map((g) => (
                <div key={g.l} className={styles.miniGauge}>
                  <MiniGauge percent={g.p} />
                  <span className={styles.miniLabel}>{g.l}</span>
                </div>
              ))}
            </div>
            <ChevronRight size={14} className={styles.arrow} />
          </Link>

          {/* Docker */}
          <Link href="/docker" prefetch={true} className={`metric-card ${styles.dockerCard}`}>
            <div className={styles.cardIcon}>
              <Container size={16} />
            </div>
            <div className={styles.cardTop}>
              <span className="metric-label">Docker</span>
              <span className="badge green">
                {running}/{total}
              </span>
            </div>
            {stopped.length > 0 ? (
              <div className={styles.stoppedList}>
                {stopped.map((n: string) => (
                  <div key={n} className={styles.stoppedItem}>
                    <span className={styles.redDot} />
                    {n}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.allGood}>All containers running</div>
            )}
            <ChevronRight size={14} className={styles.arrow} />
          </Link>

          {/* Torrents */}
          <Link href="/torrents" prefetch={true} className={`metric-card ${styles.torrentCard}`}>
            <div className={styles.cardIcon}>
              <ArrowDownUp size={16} />
            </div>
            <div className={styles.cardTop}>
              <span className="metric-label">Torrents</span>
              <span className="badge blue">{tCount}</span>
            </div>
            <div className="metric-value" style={{ fontSize: '1.5rem' }}>
              {dlSpeed}
            </div>
            <div className="metric-detail">{activeT} downloading</div>
            <ChevronRight size={14} className={styles.arrow} />
          </Link>

          {/* Media */}
          <Link href="/media" prefetch={true} className={`metric-card`}>
            <div className={styles.cardIcon}>
              <Film size={16} />
            </div>
            <div className={styles.cardTop}>
              <span className="metric-label">Media</span>
              {npCount > 0 && <span className="badge green">{npCount} playing</span>}
            </div>
            <div className={styles.mediaStats}>
              {[
                { n: counts?.MovieCount ?? '--', l: 'Movies' },
                { n: counts?.SeriesCount ?? '--', l: 'Series' },
                { n: counts?.EpisodeCount ?? '--', l: 'Episodes' },
              ].map((s) => (
                <div key={s.l}>
                  <div className={styles.statNum}>
                    {typeof s.n === 'number' ? s.n.toLocaleString() : s.n}
                  </div>
                  <div className={styles.statLabel}>{s.l}</div>
                </div>
              ))}
            </div>
            <ChevronRight size={14} className={styles.arrow} />
          </Link>

          {/* Network */}
          <Link href="/system" prefetch={true} className={`metric-card`}>
            <div className={styles.cardIcon}>
              <Wifi size={16} />
            </div>
            <div className="metric-label">Network</div>
            <div className={styles.netRow}>
              <div className={styles.netItem}>
                <span className={styles.netArrowDown}>↓</span>
                <span>{dlSpeed}</span>
              </div>
              <div className={styles.netItem}>
                <span className={styles.netArrowUp}>↑</span>
                <span>{ulSpeed}</span>
              </div>
            </div>
            <ChevronRight size={14} className={styles.arrow} />
          </Link>

          {/* Weather */}
          {weather && !weather.error && (
            <div className={`metric-card ${styles.weatherCard}`}>
              <div className={styles.cardIcon}>
                <CloudSun size={16} />
              </div>
              <div className="metric-label">Weather · {weather.city}</div>
              <div className={styles.tempRow}>
                <span className={styles.tempValue}>{weather.temp_c}°</span>
                <span className={styles.tempCondition}>{weather.condition}</span>
              </div>
              <div className="metric-detail">
                Feels {weather.feels_like}° · {weather.humidity}% humidity · Wind {weather.wind_kph}{' '}
                km/h
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
