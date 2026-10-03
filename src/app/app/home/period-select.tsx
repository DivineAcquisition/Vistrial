"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { HOME_PERIOD_KEYS, HOME_PERIOD_LABELS, type HomePeriodKey } from "@/lib/home/periods";

export function PeriodSelect({ value, basePath = "/app/home" }: { value: HomePeriodKey; basePath?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="w-40" aria-busy={pending || undefined}>
      <Select
        aria-label="Period"
        density="compact"
        value={value}
        options={HOME_PERIOD_KEYS.map((key) => ({ value: key, label: HOME_PERIOD_LABELS[key] }))}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(() => router.push(`${basePath}?period=${next}`));
        }}
      />
    </div>
  );
}
