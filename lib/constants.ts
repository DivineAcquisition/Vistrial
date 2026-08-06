import {
  Building2,
  CalendarCheck,
  ClipboardCheck,
  CreditCard,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export const APP_NAME = "Vistrial";
export const APP_OWNER = "Divine Acquisition";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Queue", href: "/queue", icon: ClipboardCheck },
  { label: "Appointments", href: "/appointments", icon: CalendarCheck },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Clients", href: "/clients", icon: Building2 },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Settings", href: "/settings", icon: Settings },
];
