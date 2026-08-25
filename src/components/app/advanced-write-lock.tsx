import type { ReactNode } from "react";

/** Disables Advanced write controls when the org is managed. Links still work. */
export function AdvancedWriteLock({
  locked,
  children,
}: {
  locked: boolean;
  children: ReactNode;
}) {
  if (!locked) return children;
  return (
    <fieldset disabled className="min-w-0 border-0 p-0">
      {children}
    </fieldset>
  );
}
