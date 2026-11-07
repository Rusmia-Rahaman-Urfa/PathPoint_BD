import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { JetBrains_Mono, Manrope, Sora } from 'next/font/google';
import { Nav } from '@/components/Nav';
import { API_URL } from '@/lib/api';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const display = Sora({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PathPoint_BD — Urban transit, matched',
  description:
    'Commuter carpooling for Dhaka and Chattogram: geospatial matching, atomic seat booking and a live traffic stream.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Nav />
        <main id="main" className="shell page">
          {children}
        </main>
        <footer className="footer">
          <div className="shell footer-inner">
            <span className="footer-brand">
              <strong>PathPoint_BD</strong>
              <span>Express 5 · MongoDB Atlas · SSE</span>
            </span>
            <span className="footer-status">
              <span className="live-dot on" aria-hidden />
              Network online
            </span>
            <a href={`${API_URL}/docs`} target="_blank" rel="noreferrer">
              Interactive API docs ↗
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
