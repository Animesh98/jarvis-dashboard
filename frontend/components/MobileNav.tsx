'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo } from 'react';
import {
  LayoutGrid,
  Cpu,
  Container,
  ArrowDownUp,
  Film,
  FolderOpen,
  Sparkles,
  SquareCheckBig,
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
];

export default memo(function MobileNav() {
  const pathname = usePathname();
  const features = useEnabledFeatures();

  const visibleItems = items.filter(
    ({ feature }) => feature === null || !features || features.has(feature)
  );

  return (
    <nav className="mobile-nav">
      {visibleItems.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          prefetch={true}
          className={`mobile-nav-item ${pathname === href || (href !== '/' && pathname.startsWith(href + '/')) ? 'active' : ''}`}
        >
          <span className="mobile-nav-icon">
            <Icon size={18} strokeWidth={1.8} />
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
});
