import Link from "next/link";

import { cn } from "@/lib/utils";

export function RosterTabs({ current, showRequests }: { current: "workspaces" | "requests"; showRequests: boolean }) {
  if (!showRequests) return null;
  const item = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm",
        active ? "bg-overlay/10 text-strong" : "text-silver hover:text-strong"
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Client roster" className="mb-6 flex flex-wrap gap-2">
      {item("/app/team/roster", "Workspaces", current === "workspaces")}
      {item("/app/team/roster/requests", "Access requests", current === "requests")}
    </nav>
  );
}
