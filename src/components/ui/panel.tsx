import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The DA panel surface: a 1px gradient edge that catches light at the top. See
 * `.panel` in app/globals.css.
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
    <Component className={cn("panel rounded-2xl", className)}>
      {children}
    </Component>
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
    <Link
      href={href}
      className={cn(
        "panel panel-hover block rounded-2xl px-5 py-4 focus-visible:outline-none",
        className
      )}
    >
      {children}
    </Link>
  );
}
