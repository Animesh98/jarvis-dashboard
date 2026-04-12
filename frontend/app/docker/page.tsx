'use client';

import { useState, lazy, Suspense } from 'react';
import { useData } from '@/lib/DataContext';
import { api, colorForPercent } from '@/lib/api';
import { toast } from '@/lib/toast';
import { RotateCcw, Square, Play, ScrollText, Terminal as TerminalIcon } from 'lucide-react';
import styles from './page.module.scss';

const LogPanel = lazy(() => import('@/components/LogPanel'));
const TerminalPanel = lazy(() => import('@/components/TerminalPanel'));

export default function DockerPage() {
  const { data, refreshFast } = useData();
  const { containers, stats, images } = data;
  const [activeTab, setActiveTab] = useState<'containers' | 'images'>('containers');
  const [logContainer, setLogContainer] = useState<string | null>(null);
  const [terminalContainer, setTerminalContainer] = useState<string | null>(null);

  const statsMap: Record<string, any> = {};
  if (Array.isArray(stats))
    stats.forEach((s) => {
      statsMap[s.Name] = s;
    });

  const sorted = Array.isArray(containers)
    ? [...containers].sort((a, b) => {
        if (a.State === 'running' && b.State !== 'running') return -1;
        if (a.State !== 'running' && b.State === 'running') return 1;
        return a.Names.localeCompare(b.Names);
      })
    : [];

  const running = sorted.filter((c) => c.State === 'running').length;

  async function doAction(container: string, action: string) {
    const r = await api('/api/docker/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ container, action }),
    });
    toast(r.data?.message || r.error || 'Done', r.error ? 'error' : 'success');
    setTimeout(refreshFast, 1500);
  }

  return (
    <>
      <header className="page-header">
        <div className="flex-col">
          <h1 className="page-title">Docker</h1>
          <div className="page-meta">
            <span className="badge green">{running} running</span>
            <span className="badge gray">{sorted.length} containers</span>
            <span className="badge gray">{images?.length || 0} images</span>
          </div>
        </div>
        <div className="segment-control">
          <button
            className={`segment-btn ${activeTab === 'containers' ? 'active' : ''}`}
            onClick={() => setActiveTab('containers')}
          >
            Containers
          </button>
          <button
            className={`segment-btn ${activeTab === 'images' ? 'active' : ''}`}
            onClick={() => setActiveTab('images')}
          >
            Images
          </button>
        </div>
      </header>

      <div className="page-body">
        {activeTab === 'containers' ? (
          <div className={`${styles.grid} stagger-children`}>
            {sorted.map((co) => {
              const name = co.Names.replace(/^\//, '');
              const state = co.State || 'unknown';
              const st = statsMap[name];
              const cpuP = st ? parseFloat(st.CPUPerc) || 0 : 0;
              const memP = st ? parseFloat(st.MemPerc) || 0 : 0;
              const isRun = state === 'running';

              return (
                <div key={name} className={styles.container}>
                  <div className={styles.containerTop}>
                    <div className={`status-dot ${state}`} />
                    <button className={styles.containerName} onClick={() => setLogContainer(name)}>
                      {name}
                    </button>
                    <button
                      className={styles.logBtn}
                      onClick={() => setLogContainer(name)}
                      title="View logs"
                    >
                      <ScrollText size={13} />
                    </button>
                    <button
                      className={styles.logBtn}
                      onClick={() => setTerminalContainer(name)}
                      title="Open terminal"
                    >
                      <TerminalIcon size={13} />
                    </button>
                  </div>
                  <div className={styles.containerStatus}>{co.Status || state}</div>

                  <div className={styles.statsRow}>
                    <span>
                      CPU <strong>{st?.CPUPerc || '--'}</strong>
                    </span>
                    <span>
                      MEM <strong>{st?.MemUsage || '--'}</strong>
                    </span>
                  </div>

                  <div className="progress" style={{ marginBottom: 4 }}>
                    <div
                      className="progress-fill"
                      style={{ width: `${cpuP}%`, background: colorForPercent(cpuP) }}
                    />
                  </div>
                  <div className="progress">
                    <div
                      className="progress-fill"
                      style={{ width: `${memP}%`, background: colorForPercent(memP) }}
                    />
                  </div>

                  <div className={styles.containerActions}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => doAction(name, 'restart')}
                      title="Restart"
                    >
                      <RotateCcw size={13} />
                    </button>
                    {isRun ? (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => doAction(name, 'stop')}
                        title="Stop"
                      >
                        <Square size={12} />
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => doAction(name, 'start')}
                        title="Start"
                      >
                        <Play size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {sorted.length === 0 && <div className="empty-state">No containers found</div>}
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Tag</th>
                  <th>Image ID</th>
                  <th>Created</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(images) &&
                  images.map((img, i) => (
                    <tr key={i}>
                      <td>
                        <strong>{img.Repository}</strong>
                      </td>
                      <td>
                        <span className="badge gray">{img.Tag}</span>
                      </td>
                      <td className="font-mono text-xs">{img.ID}</td>
                      <td>{img.CreatedSince}</td>
                      <td>{img.Size}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {(!images || images.length === 0) && <div className="empty-state">No images found</div>}
          </div>
        )}
      </div>

      <Suspense fallback={null}>
        {logContainer && (
          <LogPanel container={logContainer} onClose={() => setLogContainer(null)} />
        )}
        {terminalContainer && (
          <TerminalPanel container={terminalContainer} onClose={() => setTerminalContainer(null)} />
        )}
      </Suspense>
    </>
  );
}
