import type { Metadata } from "next";
import Link from "next/link";

import { ThemeToggle } from "@/components/app/theme-toggle";
import Logo from "@/components/brand/logo";
import { SubmissionsDesk } from "@/components/shell/submissions-desk";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Form submissions",
  robots: { index: false, follow: false },
};

export default function SubmissionsPage() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <Link href="/admin" aria-label="Vistrial staff">
          <Logo className="h-7 w-auto" />
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8">
        <PageHeader
          eyebrow="Staff"
          title="Form submissions"
          description="Every request, contact, security, and privacy form from the public site. Each one is also emailed to the team."
        />
        <SubmissionsDesk />
      </main>
    </div>
  );
}
