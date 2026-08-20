"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";

import Logo from "@/components/brand/logo";
import { AppNavLinks } from "@/components/app/app-nav-links";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { UserMenu } from "@/components/app/user-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function ShellChrome({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="px-4 py-5">
        <Logo className="h-6 w-auto" />
      </div>
      <div className="px-2 pb-4">
        <OrgSwitcher />
      </div>
      <div className="flex-1 px-2">
        <AppNavLinks onNavigate={onNavigate} />
      </div>
      <div className="border-t border-white/[0.08] p-2">
        <UserMenu />
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-ink-950 text-white">
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col border-r border-white/[0.08] bg-ink-900 md:flex">
        <ShellChrome />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/[0.08] bg-ink-900 px-4 py-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="rounded-xl p-2 text-silver hover:bg-white/[0.04] hover:text-white"
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-56 bg-ink-900 p-0 text-white"
              showCloseButton
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="flex h-full flex-col">
                <ShellChrome onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <Logo className="h-5 w-auto" />
        </header>
        <main className="min-w-0 flex-1 px-5 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
