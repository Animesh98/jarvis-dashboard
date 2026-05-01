'use client';

import { useState, lazy, Suspense } from 'react';
import { useData } from '@/lib/DataContext';
import { api, fmtBytes, fmtSpeed, colorForPercent } from '@/lib/api';
import { toast } from '@/lib/toast';
import Gauge from '@/components/Gauge';
import { RefreshCw, Trash2, Package, HardDrive, Activity } from 'lucide-react';
import styles from './page.module.scss';

const BandwidthChart = lazy(() => import('@/components/BandwidthChart'));

const STORAGE_COLORS = [
  '#0a84ff',
  '#30d158',
  '#bf5af2',
  '#ff9f0a',
  '#ff6844',
  '#ff453a',
  '#64d2ff',
  '#88cc66',
];

export default function SystemPage() {
  const { data, refreshFast } = useData();
  const { sys, transfer, procs, bw, storage } = data;
  const [procSort, setProcSort] = useState<'cpu' | 'mem'>('cpu');
  const [working, setWorking] = useState<string | null>(null);

  const cpuP = sys ? Math.min(Math.round((sys.cpu_load[0] / sys.cpu_count) * 100), 100) : 0;

  const actions = [
    { key: 'jellyfin-scan', label: 'Scan Library', Icon: RefreshCw },
    { key: 'clean-torrents', label: 'Clean Torrents', Icon: Trash2 },
    { key: 'docker-prune', label: 'Docker Prune', Icon: Trash2 },
    { key: 'update-check', label: 'Check Updates', Icon: Package },
  ];

  async function runAction(key: string) {
    setWorking(key);
    const r = await api(`/api/actions/${key}`, { method: 'POST' });
    toast(r.data?.message || r.error || 'Done', r.error ? 'error' : 'success');
    setWorking(null);
    if (key === 'clean-torrents') setTimeout(refreshFast, 1000);
  }

  const procList = procs ? (procSort === 'cpu' ? procs.by_cpu : procs.by_mem) : [];
  const storageTotal = storage?.dirs?.reduce((a: number, d: any) => a + d.size_bytes, 0) || 1;

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">System</h1>
        <div className="page-meta">
          {sys?.uptime_human && <span>Uptime: {sys.uptime_human}</span>}
        </div>
      </header>

      <div className="page-body">
        {/* Gauges */}
        <div className="section">
          <div className={styles.gaugeGrid}>
            <Gauge
              percent={cpuP}
              label="CPU"
              detail={
                sys
                  ? `${sys.cpu_load.map((l: number) => l.toFixed(1)).join(' / ')} · ${sys.cpu_count}c`
                  : '--'
              }
            />
            <Gauge
              percent={sys?.memory?.used_percent || 0}
              label="Memory"
              detail={
                sys
                  ? `${((sys.memory.total_kb - sys.memory.available_kb) / 1048576).toFixed(1)} / ${(sys.memory.total_kb / 1048576).toFixed(1)} GB`
                  : '--'
              }
            />
            <Gauge
              percent={sys?.disk?.used_percent || 0}
              label="Disk"
              detail={sys ? `${sys.disk.used_gb} / ${sys.disk.total_gb} GB` : '--'}
            />
            <div className={styles.netCard}>
              <div className={styles.netLabel}>
                <Activity size={14} style={{ marginRight: 4 }} />
                Network
              </div>
              <div className={styles.netSpeeds}>
                <div className={styles.speedRow}>
                  <span style={{ color: 'var(--green)' }}>↓</span>
                  <span>{transfer ? fmtSpeed(transfer.dl_info_speed) : '--'}</span>
                </div>
                <div className={styles.speedRow}>
                  <span style={{ color: 'var(--blue)' }}>↑</span>
                  <span>{transfer ? fmtSpeed(transfer.up_info_speed) : '--'}</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <Suspense
              fallback={
                <div style={{ height: 120, background: 'var(--row-hover)', borderRadius: 14 }} />
              }
            >
              <BandwidthChart data={bw} />
            </Suspense>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="section">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Quick Actions</span>
            </div>
            <div className="card-body">
              <div className={styles.actionsGrid}>
                {actions.map((a) => (
                  <button
                    key={a.key}
                    className={`btn btn-secondary ${styles.actionBtn}`}
                    disabled={working === a.key}
                    onClick={() => runAction(a.key)}
                  >
                    <a.Icon size={14} />
                    {working === a.key ? 'Working…' : a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Processes */}
        <div className="section">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Processes</span>
              <div className="segment-control">
                <button
                  className={`segment-btn ${procSort === 'cpu' ? 'active' : ''}`}
                  onClick={() => setProcSort('cpu')}
                >
                  CPU
                </button>
                <button
                  className={`segment-btn ${procSort === 'mem' ? 'active' : ''}`}
                  onClick={() => setProcSort('mem')}
                >
                  Memory
                </button>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className={styles.procTable}>
                <div className={`${styles.procRow} ${styles.procHeader}`}>
                  <span className={styles.procPid}>PID</span>
                  <span className={styles.procUser}>USER</span>
                  <span className={styles.procCpu}>CPU%</span>
                  <span className={styles.procMem}>MEM%</span>
                  <span className={styles.procCmd}>COMMAND</span>
                </div>
                {Array.isArray(procList) &&
                  procList.map((p: any, i: number) => (
                    <div
                      key={i}
                      className={styles.procRow}
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <span className={styles.procPid}>{p.pid}</span>
                      <span className={styles.procUser}>{p.user}</span>
                      <span className={styles.procCpu} style={{ color: colorForPercent(p.cpu) }}>
                        {p.cpu.toFixed(1)}
                      </span>
                      <span
                        className={styles.procMem}
                        style={{ color: colorForPercent(p.mem * 10) }}
                      >
                        {p.mem.toFixed(1)}
                      </span>
                      <span className={styles.procCmd} title={p.command}>
                        {p.command}
                      </span>
                    </div>
                  ))}
                {(!procList || procList.length === 0) && (
                  <div className="empty-state">No process data</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Storage */}
        <div className="section">
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <HardDrive size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                Storage
              </span>
            </div>
            <div className="card-body">
              {storage?.dirs?.length > 0 ? (
                <>
                  <div className={styles.storageBar}>
                    {storage.dirs.map((d: any, i: number) => (
                      <div
                        key={d.name}
                        className={styles.storageSeg}
                        style={{
                          flexBasis: `${(d.size_bytes / storageTotal) * 100}%`,
                          background: STORAGE_COLORS[i % STORAGE_COLORS.length],
                        }}
                      >
                        {d.size_bytes / storageTotal > 0.08 ? d.name : ''}
                      </div>
                    ))}
                  </div>
                  <div className={styles.storageLegend}>
                    {storage.dirs.map((d: any, i: number) => (
                      <div key={d.name} className={styles.legendItem}>
                        <div
                          className={styles.legendDot}
                          style={{ background: STORAGE_COLORS[i % STORAGE_COLORS.length] }}
                        />
                        <span>{d.name}</span>
                        <span className={styles.legendSize}>{fmtBytes(d.size_bytes)}</span>
                      </div>
                    ))}
                  </div>
                  {storage.total_gb > 0 && (
                    <div className={styles.storageMeta}>
                      Disk: {storage.used_gb} / {storage.total_gb} GB · {storage.free_gb} GB free
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state">No storage data</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
