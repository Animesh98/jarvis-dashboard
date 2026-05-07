'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { SquareCheckBig, Plus, ChevronRight, Check } from 'lucide-react';
import { api } from '@/lib/api';
import styles from './TodayWidget.module.scss';

interface Entity {
  name: string;
  type: string;
  tmdb_id: string;
}

interface Task {
  id: string;
  title: string;
  column: string;
  order: number;
  entities: Entity[];
  date: string;
  created_at: string;
}

const MAX_VISIBLE = 4;

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function plainTitle(title: string): string {
  return title.replace(/\{\{(.+?)\}\}/g, '$1');
}

export default function TodayWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayLocal();

  const load = useCallback(async () => {
    const r = await api<Task[]>(`/api/tasks?date=${today}`);
    if (Array.isArray(r.data)) setTasks(r.data);
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const incomplete = tasks
    .filter((t) => t.column !== 'done')
    .sort((a, b) => {
      // in_progress first, then todo; within each, by order
      const colRank = (c: string) => (c === 'in_progress' ? 0 : 1);
      if (colRank(a.column) !== colRank(b.column)) return colRank(a.column) - colRank(b.column);
      return a.order - b.order;
    })
    .slice(0, MAX_VISIBLE);

  const totalIncomplete = tasks.filter((t) => t.column !== 'done').length;
  const doneCount = tasks.filter((t) => t.column === 'done').length;

  const handleToggleDone = async (task: Task) => {
    // Optimistic
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, column: 'done' } : t)));
    await api(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column: 'done' }),
    });
  };

  const handleAdd = async () => {
    const title = draft.trim();
    if (!title) {
      setAdding(false);
      setDraft('');
      return;
    }
    setDraft('');
    const r = await api<Task>('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, column: 'todo', date: today, entities: [] }),
    });
    if (r.data) {
      setTasks((prev) => [...prev, r.data!]);
    }
    inputRef.current?.focus();
  };

  return (
    <div className={`metric-card ${styles.todayCard}`}>
      <div className={styles.cardHeader}>
        <div className={styles.headerLeft}>
          <SquareCheckBig size={14} className={styles.headerIcon} />
          <span className="metric-label">Today</span>
        </div>
        <Link href="/tasks" className={styles.headerLink} prefetch={true}>
          {totalIncomplete > 0 ? (
            <>
              <span className={styles.headerCount}>{totalIncomplete}</span>
              <span className={styles.headerDoneCount}>· {doneCount} done</span>
            </>
          ) : (
            <span className={styles.headerDoneCount}>{doneCount} done</span>
          )}
          <ChevronRight size={12} />
        </Link>
      </div>

      <div className={styles.list}>
        {incomplete.length === 0 ? (
          <div className={styles.emptyState}>
            {totalIncomplete === 0 && doneCount > 0 ? (
              <span className={styles.allDone}>
                <Check size={12} /> All done for today
              </span>
            ) : (
              <span className={styles.emptyHint}>No tasks for today yet</span>
            )}
          </div>
        ) : (
          incomplete.map((t) => (
            <div key={t.id} className={styles.row}>
              <button
                className={styles.checkbox}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleDone(t);
                }}
                title="Mark done"
                aria-label={`Mark "${plainTitle(t.title)}" done`}
              >
                {t.column === 'in_progress' && <span className={styles.dotInProgress} />}
              </button>
              <span
                className={`${styles.rowText} ${t.column === 'in_progress' ? styles.rowTextActive : ''}`}
              >
                {plainTitle(t.title)}
              </span>
            </div>
          ))
        )}
      </div>

      {adding ? (
        <div className={styles.addRow}>
          <span className={styles.addPlus}>
            <Plus size={12} />
          </span>
          <input
            ref={inputRef}
            className={styles.addInput}
            placeholder="What needs doing?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              } else if (e.key === 'Escape') {
                setAdding(false);
                setDraft('');
              }
            }}
            onBlur={() => {
              if (!draft.trim()) setAdding(false);
            }}
          />
        </div>
      ) : (
        <button className={styles.addTrigger} onClick={() => setAdding(true)}>
          <Plus size={12} /> Add task
        </button>
      )}
    </div>
  );
}
