// ============================================
// AUTH LAYOUT - Premium SaaS split-screen
// ============================================

import { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel - Brand showcase */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] flex-col justify-between bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-800 p-10 text-white relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-white/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-brand-400/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-white/[0.02] blur-3xl" />
          {/* Grid pattern */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2230%22%20height%3D%2230%22%20viewBox%3D%220%200%2030%2030%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M0%2030L30%200%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.04)%22%20stroke-width%3D%221%22%2F%3E%3C%2Fsvg%3E')] opacity-50" />
        </div>

        {/* Top - Logo */}
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size="md" variant="dark" />
          </Link>
        </div>

        {/* Middle - Testimonial / Value prop */}
        <div className="relative z-10 space-y-8">
          <div>
            <div className="flex gap-1 mb-4">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className="w-5 h-5 text-amber-400 fill-current" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <blockquote className="text-xl font-medium leading-relaxed text-white/90">
              &ldquo;We reactivated 47 dormant customers in our first month. That&apos;s over $12,000 in revenue from people we&apos;d completely forgotten about.&rdquo;
            </blockquote>
            <div className="mt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
                M
              </div>
              <div>
                <p className="font-semibold">Marcus Johnson</p>
                <p className="text-sm text-white/60">Owner, SparkleClean Pro</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 pt-8 border-t border-white/10">
            <div>
              <p className="text-2xl font-bold">500+</p>
              <p className="text-sm text-white/60">Businesses</p>
            </div>
            <div>
              <p className="text-2xl font-bold">15-30%</p>
              <p className="text-sm text-white/60">Reactivation rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold">10x</p>
              <p className="text-sm text-white/60">Avg. ROI</p>
            </div>
          </div>
        </div>

        {/* Bottom - Legal */}
        <div className="relative z-10 text-sm text-white/40">
          © {new Date().getFullYear()} Vistrial. All rights reserved.
        </div>
      </div>

      {/* Right panel - Auth form */}
      <div className="flex-1 flex flex-col">
        {/* Mobile header */}
        <header className="lg:hidden border-b border-gray-100 bg-white px-6 py-4">
          <Link href="/">
            <Logo size="sm" variant="light" />
          </Link>
        </header>

        {/* Form area */}
        <main className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12 bg-gray-50/50">
          <div className="w-full max-w-[420px]">
            {children}
          </div>
        </main>

        {/* Mobile footer */}
        <footer className="lg:hidden border-t border-gray-100 bg-white py-4 text-center">
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} Vistrial</p>
        </footer>
      </div>
    </div>
  );
}
