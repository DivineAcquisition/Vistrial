import Link from 'next/link';
import { RiHome4Line, RiArrowRightLine } from '@remixicon/react';
import { Logo } from '@/components/ui/Logo';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      {/* Gradient background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center">
        <Link href="/" className="inline-block mb-8">
          <Logo size="lg" />
        </Link>

        <p className="text-7xl font-bold text-violet-400 mb-4">404</p>
        <h1 className="text-2xl font-semibold text-white mb-2">Page not found</h1>
        <p className="text-gray-400 mb-8 max-w-md">
          Sorry, we couldn&apos;t find the page you&apos;re looking for. It may have
          been moved or doesn&apos;t exist.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors"
          >
            <RiHome4Line className="w-5 h-5" />
            Go Home
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-6 py-3 border border-white/10 text-white rounded-xl font-medium hover:bg-white/5 transition-colors"
          >
            Dashboard
            <RiArrowRightLine className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
