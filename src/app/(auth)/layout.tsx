import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      {/* Header */}
      <header className="p-6">
        <Link href="/" className="inline-block">
          <Logo size="sm" variant="dark" showText={true} />
        </Link>
      </header>

      {/* Content */}
      <main className="flex min-h-[calc(100vh-160px)] items-center justify-center p-4">
        {children}
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Vistrial. All rights reserved.
      </footer>
    </div>
  );
}
