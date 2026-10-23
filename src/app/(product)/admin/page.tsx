import type { Metadata } from "next";
import Link from "next/link";

import { ThemeToggle } from "@/components/app/theme-toggle";
import Logo from "@/components/brand/logo";
import { StaffDesk } from "@/components/shell/staff-desk";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Staff",
  robots: { index: false, follow: false },
};

export default function StaffPage() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <Link href="/admin" aria-label="Vistrial staff">
          <Logo className="h-7 w-auto" />
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8">
        <PageHeader
          eyebrow="Staff"
          title="Workspace access"
          description="Platform admin and service team are not a workspace role. A second factor is required before a grant."
        />
        <StaffDesk />
      </main>
    </div>
  );
}
