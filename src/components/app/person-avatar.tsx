"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function PersonAvatar({
  name,
  size = "default",
  className,
  src,
}: {
  name: string;
  size?: "sm" | "default" | "lg";
  className?: string;
  src?: string | null;
}) {
  return (
    <Avatar className={cn("bg-brand-500/20 text-brand-100 ring-2 ring-background", className)} size={size}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className="bg-brand-500/20 text-[0.65rem] font-medium text-brand-100">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function PersonAvatarGroup({
  names,
  size = "sm",
  className,
}: {
  names: string[];
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const shown = names.slice(0, 5);
  const extra = names.length - shown.length;

  return (
    <div className={cn("flex -space-x-2", className)}>
      {shown.map((name) => (
        <PersonAvatar key={name} name={name} size={size} />
      ))}
      {extra > 0 ? (
        <Avatar className="bg-muted text-muted-foreground ring-2 ring-background" size={size}>
          <AvatarFallback className="text-[0.65rem]">+{extra}</AvatarFallback>
        </Avatar>
      ) : null}
    </div>
  );
}
