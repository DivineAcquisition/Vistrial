import { StellarShell } from "@/components/stellar/stellar-shell";
import type { ShellNavGroup, ShellNavItem } from "@/lib/shell/nav";
import { getStellarAuthContext } from "@/lib/stellar/auth";
import { stellarLandingPath } from "@/lib/stellar/navigation";
import packageJson from "../../../package.json";

export const dynamic = "force-dynamic";

function item(id: string, label: string, href: string, icon: ShellNavItem["icon"], phone?: number): ShellNavItem {
  return { id, label, href, match: href, icon, phone };
}

export default async function StellarLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getStellarAuthContext();
  const staff = ctx.kind === "da_operator";
  const items: ShellNavItem[] = [];
  if (staff && ctx.setter) items.push(item("log", "Log", "/stellar/log", "today", 1));
  if (staff) items.push(item("placements", "Placements", "/stellar/console", "roster", 2));
  if (!staff) items.push(item("portal", "Portal", "/stellar/portal", "overview", 1));
  const groups: ShellNavGroup[] = [{ id: "stellar", label: "Stellar", items }];
  const phone = items.filter((entry) => entry.phone != null);
  const businessName = staff ? (ctx.setter?.orgName ?? "Stellar") : ctx.member.orgName;
  const accountName = staff ? (ctx.user.email ?? "Vistrial team") : ctx.member.displayName || ctx.member.email;

  return (
    <StellarShell
      groups={groups}
      phone={phone}
      more={[]}
      homeHref={stellarLandingPath(ctx)}
      businessName={businessName}
      roleLabel={staff ? "Service Team" : "Member"}
      accountName={accountName}
      cue={Boolean(staff && ctx.setter)}
      version={packageJson.version}
    >
      {children}
    </StellarShell>
  );
}
