"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  ClipboardList,
  Ellipsis,
  FolderOpen,
  Gauge,
  ListChecks,
  Phone,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { useOrg } from "@/components/app/org-provider";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  isNavActive,
  navVisibleTo,
  PRIMARY_NAV,
  type NavIcon,
  type NavItem,
} from "@/lib/navigation";

const ICONS: Record<NavIcon, LucideIcon> = {
  queue: ListChecks,
  log: ClipboardList,
  cases: FolderOpen,
  calls: Phone,
  reporting: BarChart3,
  settings: Settings2,
  activity: Activity,
  forsight: Gauge,
  more: Ellipsis,
  coaching: Sparkles,
};

function NavItems({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isNavActive(pathname, item.match);
        const Icon = ICONS[item.icon];

        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={active}
              tooltip={item.label}
              className="h-9 data-[active=true]:bg-brand-500/12 data-[active=true]:font-medium data-[active=true]:text-brand-800 data-[active=true]:shadow-[inset_2px_0_0_#9a88fc]"
              render={
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                />
              }
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { setOpenMobile } = useSidebar();
  const { role, isPlatformAdmin } = useOrg();

  const visible = PRIMARY_NAV.filter((item) => navVisibleTo(item, role, isPlatformAdmin));

  function handleNavigate() {
    setOpenMobile(false);
    onNavigate?.();
  }

  return (
    <nav aria-label="Main">
      <SidebarGroup>
        <SidebarGroupContent>
          <NavItems items={visible} onNavigate={handleNavigate} />
        </SidebarGroupContent>
      </SidebarGroup>
    </nav>
  );
}
