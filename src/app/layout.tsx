import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/theme/context';
import { I18nProvider } from '@/i18n/context';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { OddsFormatProvider } from '@/components/terminal/OddsFormatContext';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'SALMO — Pre-Match Football Analytics Terminal',
  description: 'High-signal pre-match football analytics terminal focused on Asian Handicap, Over/Under, and Moneyline. Institutional pricing & market intelligence.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('salmo_theme') || 'dark';
                if (theme === 'light') {
                  document.documentElement.classList.add('light');
                  document.documentElement.classList.remove('dark');
                } else {
                  document.documentElement.classList.add('dark');
                  document.documentElement.classList.remove('light');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className={`${inter.className} bg-terminal-canvas text-terminal-textPrimary antialiased transition-colors duration-150`}>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <OddsFormatProvider>
                {children}
              </OddsFormatProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
