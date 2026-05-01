import type { Metadata, Viewport } from 'next';
import '@/styles/globals.scss';
import TopNav from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';
import { DataProvider } from '@/lib/DataContext';
import { ThemeProvider } from '@/lib/ThemeContext';

export const metadata: Metadata = {
  title: 'Jarvis',
  description: 'Homelab Mission Control',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Jarvis' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
          (function() {
            try {
              var t = localStorage.getItem('jarvis-theme');
              if (t === 'light' || t === 'dark') {
                document.documentElement.setAttribute('data-theme', t);
              } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
                document.documentElement.setAttribute('data-theme', 'light');
              }
            } catch(e) {}
          })();
        `,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <DataProvider>
            <div className="app-shell">
              <TopNav />
              <div className="main-content">{children}</div>
              <MobileNav />
            </div>
            <div id="toast-container" className="toast-container" />
          </DataProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
