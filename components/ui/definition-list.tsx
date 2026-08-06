import type { ReactNode } from "react";

export function DefinitionList({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-white/[0.05]">{children}</dl>;
}

export function KeyValue({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-full shrink-0 text-xs font-medium tracking-[0.1em] text-dim uppercase sm:w-52">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-sm text-silver">{children}</dd>
    </div>
  );
}
