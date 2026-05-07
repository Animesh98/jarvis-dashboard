'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo, useEffect, useRef } from 'react';
import {
  LayoutGrid,
  Cpu,
  Container,
  ArrowDownUp,
  Film,
  FolderOpen,
  Sparkles,
  SquareCheckBig,
  StickyNote,
} from 'lucide-react';
import { useEnabledFeatures, type Feature } from '@/lib/features';

const items: { href: string; label: string; Icon: typeof LayoutGrid; feature: Feature | null }[] = [
  { href: '/', label: 'Home', Icon: LayoutGrid, feature: null },
  { href: '/system', label: 'System', Icon: Cpu, feature: 'system' },
  { href: '/docker', label: 'Docker', Icon: Container, feature: 'docker' },
  { href: '/torrents', label: 'Torrents', Icon: ArrowDownUp, feature: 'torrents' },
  { href: '/media', label: 'Media', Icon: Film, feature: 'media' },
  { href: '/discover', label: 'Discover', Icon: Sparkles, feature: 'discover' },
  { href: '/files', label: 'Files', Icon: FolderOpen, feature: 'files' },
  { href: '/tasks', label: 'Tasks', Icon: SquareCheckBig, feature: 'tasks' },
  { href: '/notes', label: 'Notes', Icon: StickyNote, feature: 'notes' },
];

export default memo(function MobileNav() {
  const pathname = usePathname();
  const features = useEnabledFeatures();
  const navRef = useRef<HTMLElement>(null);

  const visibleItems = items.filter(
    ({ feature }) => feature === null || !features || features.has(feature)
  );

  // Keep the active tab visible — auto-scrolls into view on route change.
  // Only matters when the nav overflows (very narrow screens / landscape);
  // otherwise scrollIntoView is a no-op since everything's already visible.
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('.mobile-nav-item.active');
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [pathname]);

  return (
    <nav className="mobile-nav" ref={navRef}>
      {visibleItems.map(({ href, label, Icon }) => {
        const isActive = pathname === href || (href !== '/' && pathname.startsWith(href + '/'));
        return (
          <Link
            key={href}
            href={href}
            prefetch={true}
            aria-label={label}
            title={label}
            className={`mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="mobile-nav-icon">
              <Icon size={20} strokeWidth={1.9} />
            </span>
            <span className="mobile-nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
});
