import { ConnectionLogo, hasConnectionLogo } from "@/components/connections/connection-logo";

/**
 * A connected tool's mark. Kept for its callers; it now shows the real brand file through ConnectionLogo
 * instead of the hand-drawn marks it used to carry.
 */
export function ToolMark({ id, size = 28, className }: { id: string; size?: number; className?: string }) {
  return <ConnectionLogo id={id} size={size} className={className} />;
}

export function hasToolMark(id: string): boolean {
  return hasConnectionLogo(id);
}
