import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-800 p-12 flex-col justify-between relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full translate-x-1/2 translate-y-1/2" />
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/Untitled design (2).png"
              alt="Vistrial"
              width={48}
              height={48}
              className="rounded-xl"
              priority
              unoptimized
            />
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
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium">JD</div>
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium">MK</div>
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium">AS</div>
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
      <div className="flex-1 flex flex-col">
        {/* Mobile logo */}
        <div className="lg:hidden p-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/Untitled design (2).png"
              alt="Vistrial"
              width={40}
              height={40}
              className="rounded-lg"
              priority
              unoptimized
            />
            <Image
              src="/VISTRIAL.png"
              alt="Vistrial"
              width={120}
              height={32}
              className="h-8 w-auto"
              priority
              unoptimized
            />
          </Link>
        </div>

        {/* Form container */}
        <main className="flex-1 flex items-center justify-center p-6 lg:p-12">
          {children}
        </main>

        {/* Mobile footer */}
        <div className="lg:hidden p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} Vistrial. All rights reserved.
        </div>
      </div>
    </div>
  );
}
