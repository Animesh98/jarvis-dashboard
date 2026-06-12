'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Trash2,
  Pin,
  PinOff,
  Search,
  X,
  Tag as TagIcon,
  Sparkles,
  StickyNote,
  Hash,
} from 'lucide-react';
import { api, timeAgo } from '@/lib/api';
import { toast } from '@/lib/toast';
import ConfirmModal from '@/components/ConfirmModal';
import RichEditor from './RichEditor';
import styles from './page.module.scss';

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

const PREVIEW_LEN = 110;

// Strip HTML tags so list-pane previews show readable text, not markup.
// Notes can be either legacy plain text or HTML produced by the rich editor.
function htmlToText(s: string): string {
  if (!s) return '';
  if (typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.innerHTML = s;
    return div.textContent || div.innerText || '';
  }
  return s.replace(/<[^>]+>/g, ' ');
}

function previewOf(s: string): string {
  const trimmed = htmlToText(s).replace(/\s+/g, ' ').trim();
  if (trimmed.length <= PREVIEW_LEN) return trimmed;
  return trimmed.slice(0, PREVIEW_LEN) + '…';
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Editor draft state — only flushed back to server on save
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftPinned, setDraftPinned] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mobileEditing, setMobileEditing] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const debounceSaveRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const refreshTags = useCallback(async () => {
    const r = await api<{ tags: string[] }>('/api/notes/tags');
    if (r.data?.tags) setAllTags(r.data.tags);
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (activeTag) params.set('tag', activeTag);
    const qs = params.toString();
    const r = await api<Note[]>(`/api/notes${qs ? '?' + qs : ''}`);
    if (Array.isArray(r.data)) setNotes(r.data);
  }, [search, activeTag]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  // Hydrate editor when selection changes. Guarded by hydratedIdRef so that
  // background setNotes calls (autosave responses, search reloads) don't
  // overwrite drafts the user is still typing.
  const hydratedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId === hydratedIdRef.current) return;
    const note = notes.find((n) => n.id === selectedId);
    if (note) {
      hydratedIdRef.current = selectedId;
      setDraftTitle(note.title);
      setDraftContent(note.content);
      setDraftTags(note.tags || []);
      setDraftPinned(note.pinned);
      setDirty(false);
    }
  }, [selectedId, notes]);

  // Auto-select first note on load if nothing selected
  useEffect(() => {
    if (!selectedId && notes.length > 0) setSelectedId(notes[0].id);
  }, [notes, selectedId]);

  const persist = useCallback(
    async (id: string, payload: Partial<Note>) => {
      setSaving(true);
      const r = await api<Note>(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSaving(false);
      if (r.data) {
        setNotes((prev) => prev.map((n) => (n.id === id ? r.data! : n)));
        // Only clear the dirty flag if this save is for the note still being
        // edited and no newer edits are queued behind it
        if (selectedIdRef.current === id && !pendingRef.current) setDirty(false);
        refreshTags();
      } else {
        toast(`Save failed: ${r.error || 'unknown error'}`, 'error');
      }
    },
    [refreshTags]
  );

  // Latest unsaved payload — lets us flush (not lose) a pending save when
  // the user switches notes or leaves the page inside the debounce window.
  const pendingRef = useRef<{ id: string; payload: Partial<Note> } | null>(null);

  const flushPending = useCallback(() => {
    clearTimeout(debounceSaveRef.current);
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      persist(pending.id, pending.payload);
    }
  }, [persist]);

  // Flush any pending save on unmount
  useEffect(() => () => flushPending(), [flushPending]);

  // Debounced auto-save when draft changes
  useEffect(() => {
    if (!dirty || !selectedId) return;
    const payload = {
      title: draftTitle || 'Untitled',
      content: draftContent,
      tags: draftTags,
      pinned: draftPinned,
    };
    pendingRef.current = { id: selectedId, payload };
    clearTimeout(debounceSaveRef.current);
    debounceSaveRef.current = setTimeout(() => {
      pendingRef.current = null;
      persist(selectedId, payload);
    }, 600);
    return () => clearTimeout(debounceSaveRef.current);
  }, [dirty, selectedId, draftTitle, draftContent, draftTags, draftPinned, persist]);

  const handleNew = async () => {
    flushPending();
    const r = await api<Note>('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', content: '', tags: [] }),
    });
    if (r.data) {
      setNotes((prev) => [r.data!, ...prev]);
      setSelectedId(r.data.id);
      setMobileEditing(true);
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  };

  const handleDelete = async (id: string) => {
    // Drop any pending autosave for the note being deleted
    if (pendingRef.current?.id === id) {
      pendingRef.current = null;
      clearTimeout(debounceSaveRef.current);
    }
    const prevNotes = notes;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setMobileEditing(false);
    }
    const r = await api(`/api/notes/${id}`, { method: 'DELETE' });
    if (r.error) {
      setNotes(prevNotes);
      toast(`Delete failed: ${r.error}`, 'error');
      return;
    }
    refreshTags();
    toast('Note deleted');
  };

  const handleTogglePin = async () => {
    if (!selectedId) return;
    const next = !draftPinned;
    setDraftPinned(next);
    setDirty(true);
    // Optimistic reorder so pinned moves to top instantly
    setNotes((prev) => {
      const updated = prev.map((n) => (n.id === selectedId ? { ...n, pinned: next } : n));
      return [...updated].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    });
  };

  const handleAddTag = (raw: string) => {
    const clean = raw.trim().replace(/^#/, '').toLowerCase();
    if (!clean || draftTags.includes(clean)) return;
    setDraftTags((prev) => [...prev, clean]);
    setDirty(true);
    setTagInput('');
  };

  const handleRemoveTag = (t: string) => {
    setDraftTags((prev) => prev.filter((x) => x !== t));
    setDirty(true);
  };

  const tagInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      handleAddTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && draftTags.length > 0) {
      handleRemoveTag(draftTags[draftTags.length - 1]);
    }
  };

  const selected = notes.find((n) => n.id === selectedId) || null;

  return (
    <>
      <header className="page-header">
        <h2 className="page-title">Notes</h2>
        <div className={styles.headerMeta}>
          <span className={styles.countLabel}>
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </span>
          {saving && <span className={styles.savingIndicator}>Saving…</span>}
          {!saving && dirty && <span className={styles.savingIndicator}>Unsaved</span>}
        </div>
      </header>

      <div className={`page-body ${styles.bodyContainer}`}>
        <div className={`${styles.layout} ${mobileEditing ? styles.layoutMobileEditing : ''}`}>
          {/* List Pane */}
          <aside className={styles.listPane}>
            <div className={styles.listToolbar}>
              <div className={styles.searchBox}>
                <Search size={13} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search notes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={styles.searchInput}
                />
                {search && (
                  <button
                    className={styles.searchClear}
                    onClick={() => setSearch('')}
                    title="Clear"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <button className={styles.newBtn} onClick={handleNew} title="New note">
                <Plus size={14} />
              </button>
            </div>

            {allTags.length > 0 && (
              <div className={styles.tagBar}>
                <button
                  className={`${styles.tagPill} ${!activeTag ? styles.tagPillActive : ''}`}
                  onClick={() => setActiveTag(null)}
                >
                  All
                </button>
                {allTags.slice(0, 8).map((t) => (
                  <button
                    key={t}
                    className={`${styles.tagPill} ${activeTag === t ? styles.tagPillActive : ''}`}
                    onClick={() => setActiveTag(activeTag === t ? null : t)}
                  >
                    <Hash size={9} /> {t}
                  </button>
                ))}
              </div>
            )}

            <div className={styles.noteList}>
              {notes.length === 0 ? (
                <div className={styles.emptyList}>
                  <StickyNote size={28} className={styles.emptyIcon} />
                  <p className={styles.emptyTitle}>
                    {search || activeTag ? 'No matches' : 'No notes yet'}
                  </p>
                  {!search && !activeTag && (
                    <button className={styles.emptyAction} onClick={handleNew}>
                      <Plus size={12} /> Create your first note
                    </button>
                  )}
                </div>
              ) : (
                notes.map((n) => (
                  <button
                    key={n.id}
                    className={`${styles.noteCard} ${
                      selectedId === n.id ? styles.noteCardActive : ''
                    } ${n.pinned ? styles.noteCardPinned : ''}`}
                    onClick={() => {
                      if (n.id !== selectedId) flushPending();
                      setSelectedId(n.id);
                      setMobileEditing(true);
                    }}
                  >
                    <div className={styles.noteCardHeader}>
                      <h3 className={styles.noteCardTitle}>
                        {n.pinned && <Pin size={10} className={styles.pinIcon} />}
                        {n.title || 'Untitled'}
                      </h3>
                      <span className={styles.noteCardDate}>{timeAgo(n.updated_at)}</span>
                    </div>
                    {n.content && <p className={styles.noteCardPreview}>{previewOf(n.content)}</p>}
                    {n.tags && n.tags.length > 0 && (
                      <div className={styles.noteCardTags}>
                        {n.tags.slice(0, 3).map((t) => (
                          <span key={t} className={styles.noteCardTag}>
                            #{t}
                          </span>
                        ))}
                        {n.tags.length > 3 && (
                          <span className={styles.noteCardTagMore}>+{n.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* Editor Pane */}
          <section className={styles.editorPane}>
            {!selected ? (
              <div className={styles.editorEmpty}>
                <Sparkles size={32} className={styles.editorEmptyIcon} />
                <h3 className={styles.editorEmptyTitle}>Pick a note, or create a new one</h3>
                <p className={styles.editorEmptyText}>
                  Notes are auto-saved as you type. Use #tags to organize.
                </p>
                <button className={styles.editorEmptyBtn} onClick={handleNew}>
                  <Plus size={14} /> New note
                </button>
              </div>
            ) : (
              <>
                <div className={styles.editorToolbar}>
                  <button
                    className={styles.mobileBackBtn}
                    onClick={() => setMobileEditing(false)}
                    title="Back"
                  >
                    ← Notes
                  </button>
                  <div className={styles.editorActions}>
                    <button
                      className={`${styles.editorBtn} ${draftPinned ? styles.editorBtnActive : ''}`}
                      onClick={handleTogglePin}
                      title={draftPinned ? 'Unpin' : 'Pin to top'}
                    >
                      {draftPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button
                      className={`${styles.editorBtn} ${styles.editorBtnDanger}`}
                      onClick={() => setConfirmDeleteId(selected.id)}
                      title="Delete"
                      aria-label="Delete note"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <input
                  ref={titleRef}
                  type="text"
                  className={styles.editorTitle}
                  placeholder="Untitled"
                  value={draftTitle}
                  onChange={(e) => {
                    setDraftTitle(e.target.value);
                    setDirty(true);
                  }}
                />

                <div className={styles.editorTags}>
                  <TagIcon size={12} className={styles.editorTagsIcon} />
                  {draftTags.map((t) => (
                    <span key={t} className={styles.editorTagChip}>
                      #{t}
                      <button
                        className={styles.editorTagRemove}
                        onClick={() => handleRemoveTag(t)}
                        title="Remove tag"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    className={styles.editorTagInput}
                    placeholder={draftTags.length === 0 ? 'Add tag…' : ''}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={tagInputKey}
                    onBlur={() => tagInput && handleAddTag(tagInput)}
                  />
                </div>

                <RichEditor
                  key={selected.id}
                  value={selected.content}
                  selectionKey={selected.id}
                  onChange={(html) => {
                    setDraftContent(html);
                    setDirty(true);
                  }}
                />

                <div className={styles.editorFooter}>
                  <span className={styles.editorMeta}>
                    Updated {timeAgo(selected.updated_at)} ·{' '}
                    {htmlToText(draftContent).trim().length} chars
                  </span>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <ConfirmModal
        open={!!confirmDeleteId}
        title="Delete Note"
        message={
          <>
            Delete{' '}
            <strong>{notes.find((n) => n.id === confirmDeleteId)?.title || 'this note'}</strong>?
            This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (confirmDeleteId) handleDelete(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </>
  );
}
