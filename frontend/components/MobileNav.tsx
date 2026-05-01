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

const items = [
  { href: '/', label: 'Home', Icon: LayoutGrid },
  { href: '/system', label: 'System', Icon: Cpu },
  { href: '/docker', label: 'Docker', Icon: Container },
  { href: '/torrents', label: 'Torrents', Icon: ArrowDownUp },
  { href: '/media', label: 'Media', Icon: Film },
  { href: '/discover', label: 'Discover', Icon: Sparkles },
  { href: '/files', label: 'Files', Icon: FolderOpen },
  { href: '/tasks', label: 'Tasks', Icon: SquareCheckBig },
];

export default memo(function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-nav">
      {items.map(({ href, label, Icon }) => (
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
