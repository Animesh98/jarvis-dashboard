'use client';

import { useState, lazy, Suspense } from 'react';
import { useData } from '@/lib/DataContext';
import { api, colorForPercent } from '@/lib/api';
import { toast } from '@/lib/toast';
import { RotateCcw, Square, Play, ScrollText } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import styles from './page.module.scss';

const LogPanel = lazy(() => import('@/components/LogPanel'));

export default function DockerPage() {
  const { data, refreshFast } = useData();
  const { containers, stats } = data;
  const [logContainer, setLogContainer] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    container: string;
    action: 'stop' | 'restart';
  } | null>(null);

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
    if (working) return;
    setWorking(container);
    const r = await api('/api/docker/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ container, action }),
    });
    setWorking(null);
    toast(r.data?.message || r.error || 'Done', r.error ? 'error' : 'success');
    setTimeout(refreshFast, 1500);
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Docker</h1>
        <div className="page-meta">
          <span className="badge green">{running} running</span>
          <span className="badge gray">{sorted.length} total</span>
        </div>
      </header>

      <div className="page-body">
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
                    onClick={() => setConfirmTarget({ container: name, action: 'restart' })}
                    disabled={working === name}
                    title="Restart"
                    aria-label={`Restart ${name}`}
                  >
                    <RotateCcw size={13} />
                  </button>
                  {isRun ? (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirmTarget({ container: name, action: 'stop' })}
                      disabled={working === name}
                      title="Stop"
                      aria-label={`Stop ${name}`}
                    >
                      <Square size={12} />
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => doAction(name, 'start')}
                      disabled={working === name}
                      title="Start"
                      aria-label={`Start ${name}`}
                    >
                      <Play size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {sorted.length === 0 && <div className="empty-state">No containers found</div>}
      </div>

      <Suspense fallback={null}>
        {logContainer && (
          <LogPanel container={logContainer} onClose={() => setLogContainer(null)} />
        )}
      </Suspense>

      <ConfirmModal
        open={!!confirmTarget}
        title={confirmTarget?.action === 'stop' ? 'Stop Container' : 'Restart Container'}
        message={
          <>
            {confirmTarget?.action === 'stop' ? 'Stop' : 'Restart'}{' '}
            <strong>{confirmTarget?.container}</strong>?
          </>
        }
        confirmLabel={confirmTarget?.action === 'stop' ? 'Stop' : 'Restart'}
        danger={confirmTarget?.action === 'stop'}
        onConfirm={() => {
          if (confirmTarget) doAction(confirmTarget.container, confirmTarget.action);
          setConfirmTarget(null);
        }}
        onCancel={() => setConfirmTarget(null)}
      />
    </>
  );
}
