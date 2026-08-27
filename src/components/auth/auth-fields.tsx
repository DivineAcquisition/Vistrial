"use client";

import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { BorderBeam } from "@/components/ui/border-beam";
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
      <BorderBeam size={52} duration={8} borderWidth={1.5} />
      <BorderBeam
        size={52}
        duration={8}
        delay={4}
        reverse
        borderWidth={1.5}
        colorFrom="#C3B6FE"
        colorTo="#9A88FC"
      />
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
