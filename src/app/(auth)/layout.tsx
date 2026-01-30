import Image from "next/image";
import Link from "next/link";
import { RiSparklingLine } from "@remixicon/react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-950 flex relative overflow-hidden">
      {/* Animated background for right side */}
      <div className="absolute inset-0 overflow-hidden lg:left-1/2">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-brand-600/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] left-[20%] w-[500px] h-[500px] rounded-full bg-brand-400/15 blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-[40%] right-[30%] w-[300px] h-[300px] rounded-full bg-indigo-500/10 blur-[80px] animate-pulse" style={{ animationDelay: "2s" }} />
        
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-800 p-12 flex-col justify-between relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-white/10 blur-[100px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-white/5 blur-[80px]" />
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-white/20 rounded-xl blur-md" />
              <div className="relative">
                <Image
                  src="/Untitled design (2).png"
                  alt="Vistrial"
                  width={48}
                  height={48}
                  className="rounded-xl"
                  priority
                  unoptimized
                />
              </div>
            </div>
            <Image
              src="/VISTRIAL.png"
              alt="Vistrial"
              width={140}
              height={40}
              className="h-10 w-auto brightness-0 invert"
              priority
              unoptimized
            />
          </Link>
        </div>

        {/* Main content */}
        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Quote Follow-Up<br />
            Automation for<br />
            Home Service Pros
          </h1>
          <p className="text-xl text-white/80 max-w-md">
            Stop losing leads. Automate your follow-ups and book more jobs with Vistrial.
          </p>
          <div className="flex items-center gap-4 pt-4">
            <div className="flex -space-x-2">
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-sm font-medium border border-white/20">JD</div>
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-sm font-medium border border-white/20">MK</div>
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-sm font-medium border border-white/20">AS</div>
            </div>
            <p className="text-white/80 text-sm">
              Trusted by 500+ home service businesses
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-white/60 text-sm">
          © {new Date().getFullYear()} Vistrial. All rights reserved.
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col relative z-10">
        {/* Mobile logo */}
        <div className="lg:hidden p-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-brand-500 rounded-lg blur-md opacity-50" />
              <div className="relative">
                <Image
                  src="/Untitled design (2).png"
                  alt="Vistrial"
                  width={40}
                  height={40}
                  className="rounded-lg"
                  priority
                  unoptimized
                />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Vistrial</h1>
              <p className="text-xs text-gray-400">Quote Follow-Up</p>
            </div>
          </Link>
        </div>

        {/* Form container */}
        <main className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            {/* Glowing card container */}
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-brand-500/20 via-brand-600/20 to-indigo-500/20 rounded-3xl blur-xl opacity-50" />
              <div className="relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-8 sm:p-10">
                {/* Top accent line */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
                {children}
              </div>
            </div>
          </div>
        </main>

        {/* Mobile footer */}
        <div className="lg:hidden p-6">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
            <RiSparklingLine className="w-3 h-3" />
            <span>Powered by Vistrial</span>
          </div>
        </div>
      </div>
    </div>
  );
}
