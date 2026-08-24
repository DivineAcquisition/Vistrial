import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function AuthField({
  icon: Icon,
  action,
  label,
  className,
  id,
  ...props
}: ComponentProps<"input"> & {
  icon: LucideIcon;
  action?: ReactNode;
  label?: string;
}) {
  const field = (
    <div className="auth-field">
      <Icon className="auth-field-icon" aria-hidden />
      <input
        id={id}
        className={cn("auth-input", action ? "auth-input--with-action" : null, className)}
        {...props}
      />
      {action}
    </div>
  );

  if (!label) return field;

  return (
    <div className="auth-field-block">
      <label htmlFor={id} className="auth-field-label">
        {label}
      </label>
      {field}
    </div>
  );
}

export function AuthOrDivider() {
  return (
    <div className="auth-or" role="separator" aria-label="or">
      <span>or</span>
    </div>
  );
}
