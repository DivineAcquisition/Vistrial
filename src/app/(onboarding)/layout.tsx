import Link from 'next/link';
import Image from 'next/image';

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center">
          <Link href="/" className="flex items-center">
            <Image
              src="/vsds.png"
              alt="Vistrial"
              width={120}
              height={60}
              className="h-8 w-auto object-contain"
              priority
            />
          </Link>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
