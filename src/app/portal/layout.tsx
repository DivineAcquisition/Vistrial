import { OrgProvider } from "@/components/app/org-provider";
import { PageMotion } from "@/components/app/page-motion";
import { UserMenu } from "@/components/app/user-menu";
import Logo from "@/components/brand/logo";
import { getAuthContext, toClientOrgState } from "@/lib/auth/session";
import { canWorkOperatorApp } from "@/lib/auth/permissions";
import { requirePortalAccess } from "@/lib/portal/access";
import { APP_NAME } from "@/lib/constants";
import { FORSIGHT_PATH, MORE_PATH } from "@/lib/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requirePortalAccess();
  const ctx = await getAuthContext();
  const inApp = canWorkOperatorApp(ctx.role, ctx.member.surfaceAccess, ctx.isPlatformAdmin);

  return (
    <OrgProvider value={toClientOrgState(ctx)} key={ctx.org.id}>
      <div className="relative isolate min-h-screen bg-ink-950 text-card-foreground">
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div
            className="absolute -top-[30%] left-1/2 h-[420px] w-[680px] -translate-x-1/2"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(154,136,252,0.16) 0%, transparent 70%)",
              filter: "blur(64px)",
              animation: "app-breathe 9s ease-in-out infinite",
            }}
          />
        </div>
        <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
            <Link href="/portal" className="flex min-w-0 items-center gap-3" aria-label={`${APP_NAME} portal`}>
              <Logo markOnly tone="on-light" className="h-8 w-auto" />
              <span className="truncate text-sm text-card-foreground">{ctx.org.name}</span>
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              {inApp ? (
                <nav aria-label="Workspace" className="hidden items-center gap-3 sm:flex">
                  <Link href={FORSIGHT_PATH} className="text-sm text-silver hover:text-card-foreground">
                    Forsight
                  </Link>
                  <Link href={MORE_PATH} className="text-sm text-silver hover:text-card-foreground">
                    More
                  </Link>
                </nav>
              ) : null}
              <UserMenu placement="header" />
            </div>
          </div>
        </header>
        <main className="relative z-10 mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
          <PageMotion>{children}</PageMotion>
        </main>
      </div>
    </OrgProvider>
  );
}
