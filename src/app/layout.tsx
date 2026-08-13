import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'E&co Product Content Manager',
  description: 'Internal content enrichment tool',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window === 'undefined') return;
                function isExtensionError(err) {
                  if (!err) return false;
                  var str = (err.stack || '') + (err.message || '') + String(err);
                  return str.indexOf('chrome-extension://') !== -1 || str.indexOf('MetaMask') !== -1;
                }
                window.addEventListener('unhandledrejection', function(event) {
                  if (isExtensionError(event.reason)) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                  }
                }, true);
                window.addEventListener('error', function(event) {
                  if (isExtensionError(event.error) || (event.filename && event.filename.indexOf('chrome-extension://') !== -1)) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                  }
                }, true);
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
