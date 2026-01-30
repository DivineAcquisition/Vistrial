"use client";

import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col relative overflow-hidden">
      {/* Subtle animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-[-30%] left-[50%] -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-brand-600/15 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] left-[30%] w-[300px] h-[300px] rounded-full bg-brand-400/10 blur-[80px] animate-pulse" style={{ animationDelay: "1s" }} />
        
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      {/* Main content - centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-brand-500 rounded-lg blur-md opacity-40" />
            <div className="relative">
              <Image
                src="/Untitled design (2).png"
                alt="Vistrial"
                width={36}
                height={36}
                className="rounded-lg"
                priority
                unoptimized
              />
            </div>
          </div>
          <Image
            src="/VISTRIAL.png"
            alt="Vistrial"
            width={100}
            height={28}
            className="h-7 w-auto"
            priority
            unoptimized
          />
        </Link>

        {/* Form card */}
        <div className="w-full max-w-sm">
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500/15 via-brand-600/15 to-indigo-500/15 rounded-2xl blur-lg opacity-60" />
            <div className="relative bg-gray-900/90 backdrop-blur-xl rounded-xl border border-white/10 p-6">
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
              {children}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-xs text-gray-600">
          © {new Date().getFullYear()} Vistrial. All rights reserved.
        </p>
      </div>
    </div>
  );
}
