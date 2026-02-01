import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-white">
      {/* Left side - Branding Panel */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-violet-600 to-purple-500" />

        {/* Animated gradient orbs */}
        <div className="absolute top-20 -left-32 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 -right-32 w-[400px] h-[400px] bg-purple-400/40 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-white/5 rounded-full blur-2xl" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/VISTRIAL.png"
              alt="Vistrial"
              width={160}
              height={50}
              className="brightness-0 invert drop-shadow-lg"
            />
          </Link>

          {/* Main content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl font-bold text-white leading-tight">
                Manage your
                <br />
                <span className="text-white/80">cleaning business.</span>
              </h1>
              <p className="text-xl text-white/70 max-w-md leading-relaxed">
                Streamline bookings, manage customers, and grow your revenue
                with powerful automation tools.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 pt-4">
              <div className="space-y-1">
                <p className="text-3xl font-bold text-white">2x</p>
                <p className="text-sm text-white/60">More bookings</p>
              </div>
              <div className="space-y-1">
                <p className="text-3xl font-bold text-white">10h+</p>
                <p className="text-sm text-white/60">Saved weekly</p>
              </div>
              <div className="space-y-1">
                <p className="text-3xl font-bold text-white">30%</p>
                <p className="text-sm text-white/60">Revenue growth</p>
              </div>
            </div>

            {/* Testimonial */}
            <div className="mt-8 p-6 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20">
              <p className="text-white/90 italic leading-relaxed">
                &quot;Vistrial transformed how we manage our cleaning business.
                Bookings are up 40% and we save hours every week on
                scheduling!&quot;
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-semibold">
                  SC
                </div>
                <div>
                  <p className="text-white font-medium">Sarah Chen</p>
                  <p className="text-white/60 text-sm">Sparkle Clean Co.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-white/40 text-sm">
            © {new Date().getFullYear()} Vistrial. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex flex-col">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between p-6 border-b border-slate-200">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/VISTRIAL.png"
              alt="Vistrial"
              width={120}
              height={40}
              className="object-contain"
            />
          </Link>
        </div>

        {/* Form container */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12 bg-gradient-to-br from-slate-50 to-slate-100">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>

        {/* Mobile footer */}
        <div className="lg:hidden p-6 text-center text-sm text-slate-500 border-t border-slate-200">
          © {new Date().getFullYear()} Vistrial. All rights reserved.
        </div>
      </div>
    </div>
  );
}
