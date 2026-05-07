'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo, useEffect, useState } from 'react';
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
import ThemeToggle from '@/components/ThemeToggle';
import { useEnabledFeatures, type Feature } from '@/lib/features';

// `feature: null` means "always show" (Overview has no toggle).
const navItems: {
  href: string;
  label: string;
  Icon: typeof LayoutGrid;
  feature: Feature | null;
}[] = [
  { href: '/', label: 'Overview', Icon: LayoutGrid, feature: null },
  { href: '/system', label: 'System', Icon: Cpu, feature: 'system' },
  { href: '/docker', label: 'Docker', Icon: Container, feature: 'docker' },
  { href: '/torrents', label: 'Torrents', Icon: ArrowDownUp, feature: 'torrents' },
  { href: '/media', label: 'Media', Icon: Film, feature: 'media' },
  { href: '/discover', label: 'Discover', Icon: Sparkles, feature: 'discover' },
  { href: '/files', label: 'Files', Icon: FolderOpen, feature: 'files' },
  { href: '/tasks', label: 'Tasks', Icon: SquareCheckBig, feature: 'tasks' },
  { href: '/notes', label: 'Notes', Icon: StickyNote, feature: 'notes' },
];

export default memo(function TopNav() {
  const pathname = usePathname();
  const [clock, setClock] = useState('');
  const features = useEnabledFeatures();

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Until features load, render everything (fail-open) — matches pre-flag behavior.
  const visibleItems = navItems.filter(
    ({ feature }) => feature === null || !features || features.has(feature)
  );

  return (
    <header className="topnav">
      <Link href="/" className="topnav-brand" prefetch={true}>
        <div className="topnav-logo">J</div>
        <span className="topnav-title">Jarvis</span>
      </Link>

      <nav className="topnav-links">
        {visibleItems.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            prefetch={true}
            className={`topnav-link ${pathname === href || (href !== '/' && pathname.startsWith(href + '/')) ? 'active' : ''}`}
          >
            <Icon size={15} strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="topnav-right">
        <span className="topnav-clock">{clock}</span>
        <ThemeToggle size={15} />
      </div>
    </header>
  );
});
