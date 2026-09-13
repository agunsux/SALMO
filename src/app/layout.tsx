import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/theme/context';
import { I18nProvider } from '@/i18n/context';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'SALMO.DEV — Football Intelligence Platform',
  description: 'Consumer football market intelligence across Asian Handicap, BTTS, and Over/Under. Simple on the surface. Deep underneath. Trustworthy throughout.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.className} bg-salmo-dark-bg text-salmo-dark-textPrimary antialiased transition-colors duration-200`}>
        <ThemeProvider>
          <I18nProvider>
            {children}
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

