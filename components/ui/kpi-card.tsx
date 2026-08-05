import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiTone = "default" | "pos" | "neg" | "warn" | "primary";

const toneClasses: Record<KpiTone, string> = {
  default: "text-white",
  pos: "text-pos",
  neg: "text-neg",
  warn: "text-warn",
  primary: "text-primary",
};

export function KpiCard({
  label,
  value,
  tone = "default",
  sub,
  className,
}: {
  label: string;
  value: string | number;
  tone?: KpiTone;
  sub?: string;
  className?: string;
}) {
  return (
    <Card
      className={cn("gap-0 border-t-2 border-t-primary px-4 py-4", className)}
    >
      <p className="text-[11px] font-medium tracking-[0.15em] text-dim uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-heading text-3xl font-bold",
          toneClasses[tone]
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-dim">{sub}</p> : null}
    </Card>
  );
}
