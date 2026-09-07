import type { ReactNode } from "react";

export function DefinitionList({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-white/[0.04]">{children}</dl>;
}

export function KeyValue({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-baseline sm:gap-6">
      <dt className="text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">{label}</dt>
      <dd className="min-w-0 text-sm leading-relaxed text-white">{children}</dd>
    </div>
  );
}
