import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FileMind — Structure-aware codebase navigation',
  description: 'Explore codebases with structure-aware agent navigation. Botathon 2026.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
