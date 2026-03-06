// ============================================
// MARKETING LAYOUT
// Layout for public marketing pages
// ============================================

import { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { RiArrowRightLine } from '@remixicon/react';
import { getLoginHref, getSignupHref } from '@/lib/constants/domains';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-gray-200/80 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center">
              <Image
                src="/vsds.png"
                alt="Vistrial"
                width={140}
                height={70}
                className="h-10 w-auto object-contain"
                priority
              />
            </Link>

            <div className="hidden items-center gap-x-8 md:flex">
              <Link
                href="#features"
                className="text-sm font-medium text-gray-600 transition-colors hover:text-brand-600"
              >
                Features
              </Link>
              <Link
                href="#how-it-works"
                className="text-sm font-medium text-gray-600 transition-colors hover:text-brand-600"
              >
                How It Works
              </Link>
              <Link
                href="#pricing"
                className="text-sm font-medium text-gray-600 transition-colors hover:text-brand-600"
              >
                Pricing
              </Link>
              <Link
                href="#faq"
                className="text-sm font-medium text-gray-600 transition-colors hover:text-brand-600"
              >
                FAQ
              </Link>
            </div>

            <div className="flex items-center gap-x-3">
              <a href={getLoginHref()}>
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </a>
              <a href={getSignupHref()}>
                <Button size="sm" className="group">
                  Start Free Trial
                  <RiArrowRightLine className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-16">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="mb-4 inline-block">
                <Image
                src="/vsds.png"
                alt="Vistrial"
                width={120}
                height={60}
                className="h-8 w-auto object-contain"
                />
              </Link>
              <p className="text-sm text-gray-600">
                Convert one-time cleaning clients into recurring revenue with automated SMS sequences.
              </p>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold text-gray-900">Product</h4>
              <ul className="space-y-2.5 text-sm text-gray-600">
                <li><Link href="#features" className="transition-colors hover:text-brand-600">Features</Link></li>
                <li><Link href="#pricing" className="transition-colors hover:text-brand-600">Pricing</Link></li>
                <li><Link href="#how-it-works" className="transition-colors hover:text-brand-600">How It Works</Link></li>
                <li><a href={getSignupHref()} className="transition-colors hover:text-brand-600">Get Started</a></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold text-gray-900">Company</h4>
              <ul className="space-y-2.5 text-sm text-gray-600">
                <li><Link href="/about" className="transition-colors hover:text-brand-600">About</Link></li>
                <li><Link href="/blog" className="transition-colors hover:text-brand-600">Blog</Link></li>
                <li><Link href="/contact" className="transition-colors hover:text-brand-600">Contact</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold text-gray-900">Legal</h4>
              <ul className="space-y-2.5 text-sm text-gray-600">
                <li><Link href="/privacy" className="transition-colors hover:text-brand-600">Privacy Policy</Link></li>
                <li><Link href="/terms" className="transition-colors hover:text-brand-600">Terms of Service</Link></li>
                <li><Link href="/compliance" className="transition-colors hover:text-brand-600">TCPA Compliance</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-gray-200 pt-8 md:flex-row">
            <p className="text-sm text-gray-500">
              © {new Date().getFullYear()} Vistrial. All rights reserved.
            </p>
            <p className="text-sm text-gray-500">
              The conversion engine for residential cleaning companies.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
