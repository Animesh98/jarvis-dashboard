'use client';

import { useState, useCallback, useRef, memo, useEffect } from 'react';
import { api, fmtBytes } from '@/lib/api';
import { toast } from '@/lib/toast';
import { marked } from 'marked';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Home,
  Slash,
  FolderPlus,
  RefreshCw,
  Folder,
  FileText,
  Download,
  Eye,
  Pencil,
  Copy,
  Scissors,
  Trash2,
  X,
} from 'lucide-react';
import styles from './page.module.scss';

const MD_EXTS = new Set(['md', 'markdown', 'mdown', 'mkd']);
const VIEWABLE_EXTS = new Set([
  'md',
  'markdown',
  'mdown',
  'mkd',
  'txt',
  'log',
  'json',
  'yml',
  'yaml',
  'toml',
  'ini',
  'conf',
  'cfg',
  'env',
  'py',
  'js',
  'jsx',
  'ts',
  'tsx',
  'sh',
  'bash',
  'zsh',
  'fish',
  'css',
  'scss',
  'sass',
  'less',
  'html',
  'htm',
  'xml',
  'svg',
  'csv',
  'tsv',
  'sql',
  'rs',
  'go',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'rb',
  'php',
  'lua',
  'r',
  'tex',
  'gitignore',
  'dockerfile',
  'makefile',
]);

function getExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : name.toLowerCase();
}

function isViewable(name: string, isDir: boolean): boolean {
  if (isDir) return false;
  return VIEWABLE_EXTS.has(getExt(name));
}

marked.setOptions({ gfm: true, breaks: false });

interface FileItem {
  name: string;
  is_dir: boolean;
  size: number;
  modified: number;
  permissions: string;
}

const FileRow = memo(function FileRow({
  item,
  absPath,
  isSelected,
  onSelect,
  onNavigate,
  onContext,
  onView,
}: {
  item: FileItem;
  absPath: string;
  isSelected: boolean;
  onSelect: () => void;
  onNavigate: (p: string) => void;
  onContext: (e: React.MouseEvent) => void;
  onView: (p: string) => void;
}) {
  const mod = item.modified
    ? new Date(item.modified * 1000).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--';
  return (
    <div
      className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
      onClick={onSelect}
      onDoubleClick={() => {
        if (item.is_dir) {
          onNavigate(absPath);
        } else if (MD_EXTS.has(getExt(item.name))) {
          onView(absPath);
        } else {
          window.open(`/api/files/download?path=${encodeURIComponent(absPath)}`, '_blank');
        }
      }}
      onContextMenu={onContext}
    >
      <span className={styles.icon}>
        {item.is_dir ? <Folder size={16} /> : <FileText size={16} />}
      </span>
      <span className={`${styles.name} ${item.is_dir ? styles.nameDir : ''}`}>{item.name}</span>
      <span className={styles.size}>{item.is_dir ? '--' : fmtBytes(item.size)}</span>
      <span className={styles.modified}>{mod}</span>
      <span className={styles.perms}>{item.permissions || ''}</span>
    </div>
  );
});

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState('~');
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ path: string; name: string; is_dir: boolean } | null>(
    null
  );
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [pathInput, setPathInput] = useState('~');
  const [modal, setModal] = useState<{
    title: string;
    placeholder: string;
    defaultVal: string;
    resolve: (v: string | null) => void;
  } | null>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    item: FileItem;
    absPath: string;
  } | null>(null);
  const [viewer, setViewer] = useState<{
    name: string;
    ext: string;
    content: string;
    loading: boolean;
    error?: string;
  } | null>(null);

  const openViewer = async (path: string) => {
    const name = path.split('/').pop() || path;
    const ext = getExt(name);
    setViewer({ name, ext, content: '', loading: true });
    const r = await api(`/api/files/read?path=${encodeURIComponent(path)}`);
    if (r.data?.error || r.error) {
      setViewer({ name, ext, content: '', loading: false, error: r.data?.error || r.error });
      return;
    }
    setViewer({
      name: r.data.name || name,
      ext: r.data.ext || ext,
      content: r.data.content || '',
      loading: false,
    });
  };

  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer]);

  const navigate = useCallback(
    async (path: string, addToHistory = true) => {
      setSelected(null);
      setLoading(true);
      const r = await api(`/api/files/list?path=${encodeURIComponent(path)}`);
      setLoading(false);
      if (r.data && !r.data.error) {
        setCurrentPath(r.data.path);
        setPathInput(r.data.path);
        setItems(r.data.items || []);
        if (addToHistory) {
          setHistory((prev) => [...prev.slice(0, histIdx + 1), r.data.path]);
          setHistIdx((prev) => prev + 1);
        }
      } else {
        toast(r.data?.error || r.error || 'Error', 'error');
      }
    },
    [histIdx]
  );

  const loaded = useRef(false);
  if (!loaded.current) {
    loaded.current = true;
    navigate('~');
  }

  function goBack() {
    if (histIdx > 0) {
      const i = histIdx - 1;
      setHistIdx(i);
      navigate(history[i], false);
    }
  }
  function goForward() {
    if (histIdx < history.length - 1) {
      const i = histIdx + 1;
      setHistIdx(i);
      navigate(history[i], false);
    }
  }
  function goUp() {
    if (currentPath && currentPath !== '/') {
      navigate(currentPath.replace(/\/[^/]+\/?$/, '') || '/');
    }
  }

  function showModal(title: string, placeholder: string, defaultVal = ''): Promise<string | null> {
    return new Promise((resolve) => {
      setModal({ title, placeholder, defaultVal, resolve });
      setTimeout(() => modalInputRef.current?.focus(), 50);
    });
  }
  function closeModal(value: string | null) {
    if (modal) modal.resolve(value);
    setModal(null);
  }

  async function handleAction(action: string) {
    if (!selected) return;
    const hdr = { 'Content-Type': 'application/json' };
    if (action === 'open') {
      selected.is_dir
        ? navigate(selected.path)
        : window.open(`/api/files/download?path=${encodeURIComponent(selected.path)}`, '_blank');
    } else if (action === 'view') {
      setCtxMenu(null);
      openViewer(selected.path);
      return;
    } else if (action === 'rename') {
      const n = await showModal('Rename', 'New name…', selected.name);
      if (!n || n === selected.name) return;
      const r = await api('/api/files/rename', {
        method: 'POST',
        headers: hdr,
        body: JSON.stringify({ path: selected.path, name: n }),
      });
      toast(r.data?.message || r.error, r.error ? 'error' : 'success');
      navigate(currentPath, false);
    } else if (action === 'copy') {
      const d = await showModal('Copy to', 'Destination path…', selected.path);
      if (!d) return;
      const r = await api('/api/files/copy', {
        method: 'POST',
        headers: hdr,
        body: JSON.stringify({ src: selected.path, dst: d }),
      });
      toast(r.data?.message || r.error, r.error ? 'error' : 'success');
      navigate(currentPath, false);
    } else if (action === 'move') {
      const d = await showModal('Move to', 'Destination path…', selected.path);
      if (!d || d === selected.path) return;
      const r = await api('/api/files/move', {
        method: 'POST',
        headers: hdr,
        body: JSON.stringify({ src: selected.path, dst: d }),
      });
      toast(r.data?.message || r.error, r.error ? 'error' : 'success');
      navigate(currentPath, false);
    } else if (action === 'delete') {
      const c = await showModal(`Delete ${selected.name}?`, 'Type "yes" to confirm');
      if (c !== 'yes') {
        toast('Cancelled', 'error');
        return;
      }
      const r = await api('/api/files/delete', {
        method: 'POST',
        headers: hdr,
        body: JSON.stringify({ path: selected.path }),
      });
      toast(r.data?.message || r.error, r.error ? 'error' : 'success');
      navigate(currentPath, false);
    }
    setCtxMenu(null);
  }

  async function handleMkdir() {
    const n = await showModal('New Folder', 'Folder name…');
    if (!n) return;
    const r = await api('/api/files/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentPath + (currentPath.endsWith('/') ? '' : '/') + n }),
    });
    toast(r.data?.message || r.error, r.error ? 'error' : 'success');
    navigate(currentPath, false);
  }

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Files</h1>
        <div className={styles.navBtns}>
          <button className="btn btn-ghost btn-sm" disabled={histIdx <= 0} onClick={goBack}>
            <ChevronLeft size={16} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={histIdx >= history.length - 1}
            onClick={goForward}
          >
            <ChevronRight size={16} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={goUp}>
            <ChevronUp size={16} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('~')}>
            <Home size={16} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
            <Slash size={16} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleMkdir}>
            <FolderPlus size={14} /> New
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(currentPath, false)}>
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      <div className="page-body">
        <div className={styles.pathBar}>
          <input
            type="text"
            className="input input-mono"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && pathInput.trim() && navigate(pathInput.trim())}
            spellCheck={false}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => pathInput.trim() && navigate(pathInput.trim())}
          >
            Go
          </button>
        </div>

        <div className={styles.breadcrumb}>
          <span className={styles.crumb} onClick={() => navigate('/')}>
            /
          </span>
          {pathParts.map((p, i) => {
            const full = '/' + pathParts.slice(0, i + 1).join('/');
            return (
              <span key={full}>
                <span className={styles.sep}>/</span>
                <span
                  className={`${styles.crumb} ${i === pathParts.length - 1 ? styles.crumbCurrent : ''}`}
                  onClick={() => navigate(full)}
                >
                  {p}
                </span>
              </span>
            );
          })}
        </div>

        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className={`${styles.row} ${styles.rowHeader}`}>
              <span className={styles.icon}></span>
              <span className={styles.name}>Name</span>
              <span className={styles.size}>Size</span>
              <span className={styles.modified}>Modified</span>
              <span className={styles.perms}>Perms</span>
            </div>

            {loading && (
              <div className="empty-state" style={{ padding: 20 }}>
                Loading…
              </div>
            )}
            {!loading && items.length === 0 && <div className="empty-state">Empty directory</div>}

            {!loading &&
              items.map((item) => {
                const absPath = currentPath + (currentPath.endsWith('/') ? '' : '/') + item.name;
                return (
                  <FileRow
                    key={item.name}
                    item={item}
                    absPath={absPath}
                    isSelected={selected?.path === absPath}
                    onSelect={() =>
                      setSelected({ path: absPath, name: item.name, is_dir: item.is_dir })
                    }
                    onNavigate={navigate}
                    onView={openViewer}
                    onContext={(e) => {
                      e.preventDefault();
                      setSelected({ path: absPath, name: item.name, is_dir: item.is_dir });
                      setCtxMenu({ x: e.clientX, y: e.clientY, item, absPath });
                    }}
                  />
                );
              })}
          </div>
        </div>
      </div>

      {ctxMenu && (
        <>
          <div className={styles.ctxOverlay} onClick={() => setCtxMenu(null)} />
          <div
            className={styles.ctxMenu}
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 180),
              top: Math.min(ctxMenu.y, window.innerHeight - 230),
            }}
          >
            {[
              {
                label: ctxMenu.item.is_dir ? 'Open' : 'Download',
                action: 'open',
                Icon: ctxMenu.item.is_dir ? Folder : Download,
              },
              ...(isViewable(ctxMenu.item.name, ctxMenu.item.is_dir)
                ? [{ label: 'View', action: 'view', Icon: Eye }]
                : []),
              { label: 'Rename', action: 'rename', Icon: Pencil },
              { label: 'Copy', action: 'copy', Icon: Copy },
              { label: 'Move', action: 'move', Icon: Scissors },
              { label: 'Delete', action: 'delete', Icon: Trash2, danger: true },
            ].map((a) => (
              <button
                key={a.action}
                className={`${styles.ctxItem} ${a.danger ? styles.ctxDanger : ''}`}
                onClick={() => handleAction(a.action)}
              >
                <a.Icon size={14} /> {a.label}
              </button>
            ))}
          </div>
        </>
      )}

      {viewer && (
        <div className={styles.viewerOverlay} onClick={() => setViewer(null)}>
          <div className={styles.viewer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.viewerHeader}>
              <div className={styles.viewerTitle}>
                <FileText size={16} />
                <span>{viewer.name}</span>
                {viewer.ext && <span className={styles.viewerExt}>{viewer.ext}</span>}
              </div>
              <button
                className={styles.viewerClose}
                onClick={() => setViewer(null)}
                aria-label="Close viewer"
              >
                <X size={18} />
              </button>
            </div>
            <div className={styles.viewerBody}>
              {viewer.loading && <div className="empty-state">Loading…</div>}
              {viewer.error && (
                <div className="empty-state" style={{ color: 'var(--text-secondary)' }}>
                  {viewer.error}
                </div>
              )}
              {!viewer.loading && !viewer.error && MD_EXTS.has(viewer.ext) && (
                <div
                  className={styles.markdown}
                  dangerouslySetInnerHTML={{ __html: marked.parse(viewer.content) as string }}
                />
              )}
              {!viewer.loading && !viewer.error && !MD_EXTS.has(viewer.ext) && (
                <pre className={styles.code}>{viewer.content}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>{modal.title}</h3>
            <input
              ref={modalInputRef}
              type="text"
              className="input input-mono"
              placeholder={modal.placeholder}
              defaultValue={modal.defaultVal}
              onKeyDown={(e) => {
                if (e.key === 'Enter') closeModal((e.target as HTMLInputElement).value.trim());
                if (e.key === 'Escape') closeModal(null);
              }}
            />
            <div className={styles.modalBtns}>
              <button className="btn btn-secondary btn-sm" onClick={() => closeModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => closeModal(modalInputRef.current?.value?.trim() || null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
