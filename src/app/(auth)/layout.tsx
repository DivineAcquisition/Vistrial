"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen mesh-gradient flex flex-col relative overflow-hidden">
      {/* Animated gradient orbs - smaller on mobile */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[10%] w-[250px] md:w-[500px] h-[250px] md:h-[500px] rounded-full bg-gradient-to-br from-brand-400/20 to-transparent blur-3xl animate-float" />
        <div className="absolute top-[30%] right-[-10%] w-[200px] md:w-[400px] h-[200px] md:h-[400px] rounded-full bg-gradient-to-br from-indigo-400/15 to-transparent blur-3xl animate-float-delayed" />
        <div className="absolute bottom-[-10%] left-[30%] w-[300px] md:w-[600px] h-[300px] md:h-[600px] rounded-full bg-gradient-to-br from-pink-400/10 to-transparent blur-3xl animate-float-slow" />
        
        {/* Subtle grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(139,92,246,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,.3) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
      </div>

      {/* Main content - centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 md:py-8 relative z-10">
        {/* Logo */}
        <Link href="/" className="mb-6 md:mb-8">
          <Logo size="sm" variant="dark" className="md:scale-110" />
        </Link>

        {/* Form card */}
        <div className="w-full max-w-sm">
          <div className="relative">
            {/* Card glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-500/20 via-indigo-500/20 to-pink-500/20 rounded-2xl md:rounded-3xl blur-xl opacity-60" />
            
            {/* Card */}
            <div className="relative bg-white/90 backdrop-blur-xl rounded-xl md:rounded-2xl border border-white/60 shadow-2xl shadow-gray-200/60 p-5 md:p-7">
              {/* Top accent line */}
              <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
              {children}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 md:mt-8 text-[10px] md:text-xs text-gray-400">
          © {new Date().getFullYear()} Vistrial. All rights reserved.
        </p>
      </div>
    </div>
  );
}
