import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function AuthField({
  icon: Icon,
  action,
  className,
  ...props
}: ComponentProps<"input"> & {
  icon: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="auth-field">
      <Icon className="auth-field-icon" aria-hidden />
      <input
        className={cn("auth-input", action ? "auth-input--with-action" : null, className)}
        {...props}
      />
      {action}
    </div>
  );
}

export function AuthOrDivider() {
  return (
    <div className="auth-or" role="separator" aria-label="or">
      <span>OR</span>
    </div>
  );
}
