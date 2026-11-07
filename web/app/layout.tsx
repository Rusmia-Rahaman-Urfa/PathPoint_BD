import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Nav } from '@/components/Nav';
import { API_URL } from '@/lib/api';
import './globals.css';

export const metadata: Metadata = {
  title: 'PathPoint_BD — Urban transit, matched',
  description:
    'Commuter carpooling for Dhaka and Chattogram: geospatial matching, atomic seat booking and a live traffic stream.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="shell page">{children}</main>
        <footer className="footer">
          <div className="shell footer-inner">
            <span>
              <strong>PathPoint_BD</strong> · Express 5 · MongoDB Atlas · SSE
            </span>
            <span>
              <a href={`${API_URL}/docs`} target="_blank" rel="noreferrer">
                Interactive API docs ↗
              </a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
