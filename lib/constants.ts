import {
  Building2,
  CalendarCheck,
  ClipboardCheck,
  CreditCard,
  Eye,
  Map,
  Settings,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";

export const APP_NAME = "Vistrial";
export const APP_OWNER = "Divine Acquisition";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** When set, only these roles see the nav item. Permission is still enforced server-side. */
  roles?: Array<"owner" | "admin" | "member">;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Attention", href: "/attention", icon: Eye },
  { label: "Queue", href: "/queue", icon: ClipboardCheck },
  { label: "Appointments", href: "/appointments", icon: CalendarCheck },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Clients", href: "/clients", icon: Building2 },
  { label: "Territories", href: "/territories", icon: Map },
  { label: "Billing", href: "/billing", icon: CreditCard },
  {
    label: "Team",
    href: "/team",
    icon: Shield,
    roles: ["owner", "admin"],
  },
  { label: "Settings", href: "/settings", icon: Settings },
];
