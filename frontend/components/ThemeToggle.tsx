'use client';

import { memo } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';

export default memo(function ThemeToggle({ size = 18 }: { size?: number }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span className="theme-toggle-icon">
        {theme === 'dark' ? (
          <Sun size={size} strokeWidth={1.8} />
        ) : (
          <Moon size={size} strokeWidth={1.8} />
        )}
      </span>
    </button>
  );
});
