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
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

const navItems = [
  { href: '/', label: 'Overview', Icon: LayoutGrid },
  { href: '/system', label: 'System', Icon: Cpu },
  { href: '/docker', label: 'Docker', Icon: Container },
  { href: '/torrents', label: 'Torrents', Icon: ArrowDownUp },
  { href: '/media', label: 'Media', Icon: Film },
  { href: '/discover', label: 'Discover', Icon: Sparkles },
  { href: '/files', label: 'Files', Icon: FolderOpen },
  { href: '/tasks', label: 'Tasks', Icon: SquareCheckBig },
];

export default memo(function TopNav() {
  const pathname = usePathname();
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="topnav">
      <Link href="/" className="topnav-brand" prefetch={true}>
        <div className="topnav-logo">J</div>
        <span className="topnav-title">Jarvis</span>
      </Link>

      <nav className="topnav-links">
        {navItems.map(({ href, label, Icon }) => (
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
