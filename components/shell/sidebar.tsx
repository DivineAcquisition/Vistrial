import { NavItem } from "@/components/shell/nav-item";
import { APP_NAME, APP_OWNER, NAV_ITEMS } from "@/lib/constants";

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 flex w-[240px] flex-col border-r border-border bg-sidebar">
      <div className="px-6 py-6">
        <span className="font-heading text-lg font-bold tracking-[0.25em] text-primary">
          {APP_NAME.toUpperCase()}
        </span>
      </div>

      <nav className="flex flex-col">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={<Icon className="size-4 shrink-0" />}
          />
        ))}
      </nav>

      <div className="mt-auto border-t border-border px-6 py-5">
        <p className="text-[11px] text-dim">
          {APP_NAME} · by {APP_OWNER}
        </p>
      </div>
    </aside>
  );
}
