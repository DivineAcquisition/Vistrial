import Link from "next/link";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The DA panel surface, now the coss Card so settings, lists, and marketing
 * cards share one chrome.
 */
export function Panel({
  children,
  className,
  as: Component = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Card
      render={Component === "div" ? undefined : <Component />}
      className={className}
    >
      {children}
    </Card>
  );
}

export function PanelLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      render={<Link href={href} />}
      className={cn("panel-hover block p-5 focus-visible:outline-none", className)}
    >
      {children}
    </Card>
  );
}
