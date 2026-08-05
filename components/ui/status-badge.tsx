import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/types/database";

const statusClasses: Record<AppointmentStatus, string> = {
  pending: "text-warn border-warn/40 bg-warn/10",
  confirmed: "text-pos border-pos/40 bg-pos/10",
  rejected: "text-dim border-border bg-muted",
  disputed: "text-neg border-neg/40 bg-neg/10",
  billed: "text-primary border-primary/40 bg-primary/10",
};

export function StatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize", statusClasses[status], className)}
    >
      {status}
    </Badge>
  );
}
