'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import styles from './ConfirmModal.module.scss';

/**
 * Shared confirmation dialog — one pattern for every destructive action
 * (tasks, notes, files, docker) instead of type-"yes" inputs and native
 * confirm() popups.
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.modalHeader}>
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.modalText}>{message}</p>
        </div>
        <div className={styles.modalFooter}>
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
