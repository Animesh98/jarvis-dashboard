'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import styles from './LogPanel.module.scss';

interface Props {
  container: string | null;
  onClose: () => void;
}

export default function LogPanel({ container, onClose }: Props) {
  const [logs, setLogs] = useState('Loading...');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const contentRef = useRef<HTMLPreElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!container) return;
    const r = await api(`/api/docker/logs?container=${encodeURIComponent(container)}&lines=150`);
    setLogs(r.data?.logs || r.error || 'No logs');
    if (contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight;
  }, [container]);

  useEffect(() => {
    if (container) fetchLogs();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [container, fetchLogs]);

  useEffect(() => {
    if (autoRefresh && container) {
      timerRef.current = setInterval(fetchLogs, 3000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [autoRefresh, container, fetchLogs]);

  if (!container) return null;

  return (
    <>
      <div className={`${styles.overlay} ${styles.open}`} onClick={onClose} />
      <div className={`${styles.panel} ${styles.open}`}>
        <div className={styles.header}>
          <span className={styles.title}>{container}</span>
          <button className={styles.close} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={styles.actions}>
          <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
            Refresh
          </button>
          <button
            className={`btn btn-sm ${autoRefresh ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            Auto {autoRefresh ? '●' : '○'}
          </button>
        </div>
        <pre className={styles.content} ref={contentRef}>
          {logs}
        </pre>
      </div>
    </>
  );
}
