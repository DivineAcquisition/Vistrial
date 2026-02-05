// ============================================
// MARKETING LAYOUT
// Layout for public marketing pages
// ============================================

import { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-9 h-9 rounded-lg bg-brand-gradient flex items-center justify-center">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xl text-gray-900">Vistrial</span>
            </Link>

            <div className="hidden md:flex items-center space-x-8">
              <Link
                href="#features"
                className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors"
              >
                Features
              </Link>
              <Link
                href="#how-it-works"
                className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors"
              >
                How It Works
              </Link>
              <Link
                href="#pricing"
                className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="#faq"
                className="text-sm font-medium text-gray-600 hover:text-brand-600 transition-colors"
              >
                FAQ
              </Link>
            </div>

            <div className="flex items-center space-x-4">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-gray-700 hover:text-brand-600">
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" className="bg-brand-600 hover:bg-brand-700 text-white">
                  Start Free Trial
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-16">{children}</main>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-gradient flex items-center justify-center">
                  <Zap className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-gray-900">Vistrial</span>
              </Link>
              <p className="text-sm text-gray-600">
                Turn your dormant customer database into predictable revenue with automated reactivation campaigns.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-gray-900">Product</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link href="#features" className="hover:text-brand-600 transition-colors">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-brand-600 transition-colors">Pricing</Link></li>
                <li><Link href="#how-it-works" className="hover:text-brand-600 transition-colors">How It Works</Link></li>
                <li><Link href="/signup" className="hover:text-brand-600 transition-colors">Get Started</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-gray-900">Company</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link href="/about" className="hover:text-brand-600 transition-colors">About</Link></li>
                <li><Link href="/blog" className="hover:text-brand-600 transition-colors">Blog</Link></li>
                <li><Link href="/contact" className="hover:text-brand-600 transition-colors">Contact</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-gray-900">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link href="/privacy" className="hover:text-brand-600 transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-brand-600 transition-colors">Terms of Service</Link></li>
                <li><Link href="/compliance" className="hover:text-brand-600 transition-colors">TCPA Compliance</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-200 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm text-gray-500">
              © {new Date().getFullYear()} Vistrial. All rights reserved.
            </p>
            <p className="text-sm text-gray-500 mt-2 md:mt-0">
              Made for home service businesses that want to grow.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
