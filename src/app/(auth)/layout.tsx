// ============================================
// AUTH LAYOUT
// Unique aesthetic auth page layout
// ============================================

import { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="relative hidden w-1/2 lg:block">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-brand-gradient" />
        
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Floating orbs */}
          <div className="absolute -left-20 -top-20 h-96 w-96 animate-float rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-32 -right-32 h-[500px] w-[500px] animate-float-delayed rounded-full bg-brand-400/30 blur-3xl" />
          <div className="absolute left-1/3 top-1/2 h-64 w-64 animate-float-slow rounded-full bg-white/5 blur-2xl" />
          
          {/* Grid pattern overlay */}
          <div className="absolute inset-0 bg-grid-pattern opacity-20" />
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-brand-600/50 via-transparent to-transparent" />
        </div>
        
        {/* Content */}
        <div className="relative flex h-full flex-col justify-between p-12">
          {/* Logo */}
          <Link href="/" className="inline-block">
            <Image
              src="/vsds.png"
              alt="Vistrial"
              width={180}
              height={90}
              className="h-12 w-auto object-contain brightness-0 invert"
              priority
            />
          </Link>
          
          {/* Main content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold leading-tight text-white lg:text-5xl">
                Turn dormant leads into{' '}
                <span className="text-brand-200">revenue.</span>
              </h1>
              <p className="max-w-md text-lg text-white/80">
                Automatically reactivate your past customers with SMS and voice campaigns. 
                See 15-30% of dormant leads convert.
              </p>
            </div>
            
            {/* Stats */}
            <div className="flex gap-12">
              <div>
                <div className="text-3xl font-bold text-white">98%</div>
                <div className="text-sm text-white/60">SMS Open Rate</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-white">15-30%</div>
                <div className="text-sm text-white/60">Reactivation Rate</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-white">10x</div>
                <div className="text-sm text-white/60">Average ROI</div>
              </div>
            </div>
          </div>
          
          {/* Testimonial */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <p className="mb-4 text-white/90">
              &ldquo;First campaign brought back 67 customers. That&apos;s over $15,000 in revenue from customers I&apos;d basically forgotten about.&rdquo;
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 font-semibold text-white">
                MT
              </div>
              <div>
                <div className="font-medium text-white">Mike Thompson</div>
                <div className="text-sm text-white/60">Thompson Cleaning Services</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="relative flex w-full flex-col lg:w-1/2">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -right-64 -top-64 h-[500px] w-[500px] rounded-full bg-brand-100/50 blur-3xl" />
          <div className="absolute -bottom-64 -left-64 h-[400px] w-[400px] rounded-full bg-brand-50/50 blur-3xl" />
        </div>
        
        {/* Mobile header */}
        <header className="relative border-b border-gray-200 bg-white/80 backdrop-blur-sm lg:hidden">
          <div className="container mx-auto flex h-16 items-center px-4">
            <Link href="/" className="inline-block">
              <Image
                src="/vsds.png"
                alt="Vistrial"
                width={140}
                height={70}
                className="h-9 w-auto object-contain"
                priority
              />
            </Link>
          </div>
        </header>

        {/* Form container */}
        <main className="relative flex flex-1 items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md animate-fade-in">
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer className="relative border-t border-gray-200 bg-white/80 py-4 backdrop-blur-sm">
          <div className="container mx-auto px-4 text-center text-sm text-gray-500">
            © {new Date().getFullYear()} Vistrial. All rights reserved.
          </div>
        </footer>
      </div>
    </div>
  );
}
