import { OrgProvider } from "@/components/app/org-provider";
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
      <div className="relative min-h-screen bg-ink-950 text-card-foreground">
        <header className="sticky top-0 z-20 border-b border-border bg-ink-950/90 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/portal" className="flex min-w-0 items-center gap-3" aria-label={`${APP_NAME} portal`}>
              <Logo markOnly className="h-8 w-auto" />
              <span className="truncate text-sm text-white">{ctx.org.name}</span>
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              {inApp ? (
                <nav aria-label="Workspace" className="hidden items-center gap-3 sm:flex">
                  <Link href={FORSIGHT_PATH} className="text-sm text-silver hover:text-white">
                    Forsight
                  </Link>
                  <Link href={MORE_PATH} className="text-sm text-silver hover:text-white">
                    More
                  </Link>
                </nav>
              ) : null}
              <UserMenu placement="header" />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </OrgProvider>
  );
}
