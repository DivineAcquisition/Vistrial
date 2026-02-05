// ============================================
// AUTH LAYOUT
// Layout for authentication pages
// ============================================

import { ReactNode } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">V</span>
            </div>
            <span className="font-semibold text-xl">Vistrial</span>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">{children}</div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white/80 backdrop-blur-sm py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Vistrial. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
