import type { Metadata } from 'next';
import { Spectral, Geist, Geist_Mono } from 'next/font/google';
import Splash from '@/components/splash';
import './globals.css';

const spectral = Spectral({ subsets: ['latin'], weight: ['500'], variable: '--font-spectral' });
const geist = Geist({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: 'Day One',
  description: 'A driving test for AI employees.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spectral.variable} ${geist.variable} ${geistMono.variable}`}>
      <body>
        <Splash />
        {children}
      </body>
    </html>
  );
}
