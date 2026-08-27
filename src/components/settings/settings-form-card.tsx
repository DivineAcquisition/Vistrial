import type { ComponentProps, ReactNode } from "react";

import { Card, CardFooter, CardPanel } from "@/components/ui/card";
import { cardStack, formMeasure } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * Settings forms must be the Card itself so CardPanel / CardFooter padding
 * applies. Nesting <form> inside Card leaves fields flush to the border.
 */
export function SettingsFormCard({
  action,
  children,
  footer,
  className,
}: {
  action: ComponentProps<"form">["action"];
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn(formMeasure, className)} render={<form action={action} />}>
      <CardPanel className={cn(cardStack, footer ? "pb-0" : undefined)}>{children}</CardPanel>
      {footer ? (
        <CardFooter className="border-t border-white/[0.06]">{footer}</CardFooter>
      ) : null}
    </Card>
  );
}
