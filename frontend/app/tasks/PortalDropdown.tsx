'use client';

import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface Position {
  top: number;
  left: number;
  width: number;
  placement: 'up' | 'down';
}

/**
 * Renders children in document.body with position:fixed anchored to anchorRef's
 * bounding rect. Decides up/down based on space and `prefer`. Re-measures on
 * scroll and resize so the dropdown stays glued to its anchor.
 *
 * Why a portal: task cards use backdrop-filter (via @include card), which
 * creates a stacking context. Sibling tasks below an editing form would paint
 * on top of the autocomplete dropdown — escaping to <body> sidesteps the
 * stacking context entirely.
 */
export default function PortalDropdown({
  anchorRef,
  open,
  prefer = 'up',
  maxHeightPx = 220,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  prefer?: 'up' | 'down';
  maxHeightPx?: number;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<Position | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      let placement: 'up' | 'down' = prefer;
      if (prefer === 'up' && spaceAbove < maxHeightPx && spaceBelow > spaceAbove) {
        placement = 'down';
      } else if (prefer === 'down' && spaceBelow < maxHeightPx && spaceAbove > spaceBelow) {
        placement = 'up';
      }
      const top = placement === 'up' ? rect.top - 4 : rect.bottom + 4;
      setPos({ top, left: rect.left, width: rect.width, placement });
    };
    measure();
    const onScroll = () => measure();
    const onResize = () => measure();
    window.addEventListener('scroll', onScroll, true); // capture so nested scroll fires
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, anchorRef, prefer, maxHeightPx]);

  if (!mounted || !open || !pos) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    left: pos.left,
    width: pos.width,
    zIndex: 1000,
    ...(pos.placement === 'up'
      ? { bottom: window.innerHeight - pos.top }
      : { top: pos.top }),
  };

  return createPortal(<div style={style}>{children}</div>, document.body);
}
