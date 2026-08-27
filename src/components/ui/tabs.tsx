"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import Link from "next/link";
import * as React from "react";
import type { ReactNode } from "react";
import {
  type SegmentedControlSize,
  segmentedControlItemLayoutClassName,
  segmentedControlItemSizeClassNames,
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from "@/lib/segmented-control";
import { RadioGroup, RadioPrimitive } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

type TabsVariant = "default" | "underline";
type TabsSize = SegmentedControlSize;

const TabsListContext: React.Context<TabsSize> =
  React.createContext<TabsSize>("default");

export function Tabs({
  className,
  ...props
}: TabsPrimitive.Root.Props): React.ReactElement {
  return (
    <TabsPrimitive.Root
      className={cn(
        "flex flex-col gap-2 data-[orientation=vertical]:flex-row",
        className,
      )}
      data-slot="tabs"
      {...props}
    />
  );
}

export function TabsList({
  variant = "default",
  size = "default",
  className,
  children,
  ...props
}: TabsPrimitive.List.Props & {
  size?: TabsSize;
  variant?: TabsVariant;
}): React.ReactElement {
  return (
    <TabsPrimitive.List
      className={cn(
        "relative z-0 flex w-fit items-center justify-center gap-x-0.5 text-muted-foreground",
        "data-[orientation=vertical]:flex-col",
        variant === "default"
          ? "rounded-lg bg-muted p-0.5 text-muted-foreground/72"
          : "data-[orientation=vertical]:px-1 data-[orientation=horizontal]:py-1 *:data-[slot=tabs-tab]:hover:bg-accent",
        className,
      )}
      data-size={size}
      data-slot="tabs-list"
      {...props}
    >
      <TabsListContext.Provider value={size}>
        {children}
      </TabsListContext.Provider>
      <TabsPrimitive.Indicator
        className={cn(
          "absolute bottom-0 left-0 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) -translate-y-(--active-tab-bottom) transition-[width,translate] duration-200 ease-in-out",
          variant === "underline"
            ? "z-10 bg-primary data-[orientation=horizontal]:h-0.5 data-[orientation=vertical]:w-0.5 data-[orientation=vertical]:-translate-x-px data-[orientation=horizontal]:translate-y-px"
            : "-z-1 rounded-md bg-background shadow-sm/5 dark:bg-input",
        )}
        data-slot="tab-indicator"
      />
    </TabsPrimitive.List>
  );
}

export function TabsTab({
  className,
  size,
  ...props
}: TabsPrimitive.Tab.Props & {
  size?: TabsSize;
}): React.ReactElement {
  const contextSize: TabsSize = React.useContext(TabsListContext);
  const resolvedSize: TabsSize = size ?? contextSize;

  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative flex shrink-0 grow cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-transparent font-medium text-base outline-none transition-[color,background-color,box-shadow] hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring data-disabled:pointer-events-none data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start data-active:text-foreground data-disabled:opacity-64 sm:text-sm",
        segmentedControlItemLayoutClassName,
        segmentedControlItemSizeClassNames[resolvedSize],
        className,
      )}
      data-size={resolvedSize}
      data-slot="tabs-tab"
      {...props}
    />
  );
}

export function TabsPanel({
  className,
  ...props
}: TabsPrimitive.Panel.Props): React.ReactElement {
  return (
    <TabsPrimitive.Panel
      className={cn("flex-1 outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export {
  TabsPrimitive,
  TabsTab as TabsTrigger,
  TabsPanel as TabsContent,
  type TabsSize,
  type TabsVariant,
};

/**
 * Tabs that are routes.
 *
 * Settings and reporting switch pages rather than panels, so these are links,
 * not a JavaScript tab widget: they deep-link, open in a new tab, and work
 * before hydration.
 */
export type NavTabItem = {
  href: string;
  label: string;
  /** Rendered after the label, for a count or a status dot. */
  badge?: ReactNode;
};

export function NavTabs({
  items,
  activeHref,
  label,
  className,
}: {
  items: NavTabItem[];
  activeHref: string;
  label: string;
  className?: string;
}) {
  const itemClassName = segmentedControlItemVariants({ state: "current" });

  return (
    <nav
      aria-label={label}
      className={cn(segmentedControlRootClassName, "flex-wrap", className)}
    >
      {items.map((item) => {
        const active = activeHref === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={itemClassName}
          >
            {item.label}
            {item.badge}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * A small set of mutually exclusive choices shown side by side. For switching a
 * view, not for navigating: use `NavTabs` when each option is its own page.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  name,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Set to also submit the choice with a surrounding form. */
  name?: string;
  className?: string;
}) {
  const itemClassName = segmentedControlItemVariants({
    size: "default",
    state: "checked",
  });

  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next as T);
      }}
      aria-label={label}
      className={cn(segmentedControlRootClassName, "flex-row", className)}
    >
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {options.map((option) => (
        <RadioPrimitive.Root
          key={option.value}
          value={option.value}
          className={itemClassName}
        >
          {option.label}
        </RadioPrimitive.Root>
      ))}
    </RadioGroup>
  );
}
