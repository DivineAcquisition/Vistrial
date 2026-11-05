import { platform } from "@/lib/marketing/platforms";
import { cn } from "@/lib/utils";

/**
 * A platform mark from `public/brand/platforms`.
 *
 * `tone="color"` shows the brand's own colors. `tone="mono"` paints the mark in the
 * current text color through a CSS mask, so a strip of logos can stay calm and
 * pick up hover or theme colors. Falls back to color when no mono file exists.
 */
export function PlatformLogo({
  id,
  size = 20,
  tone = "color",
  decorative = false,
  className,
}: {
  id: string;
  size?: number;
  tone?: "color" | "mono";
  /** True when the platform's name is already written next to the mark, so it is not read twice. */
  decorative?: boolean;
  className?: string;
}) {
  const entry = platform(id);
  if (!entry) return null;

  if (tone === "mono" && entry.mono) {
    const mask = `url(${entry.mono}) center / contain no-repeat`;
    return (
      <span
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : entry.name}
        aria-hidden={decorative ? true : undefined}
        className={cn("inline-block shrink-0 bg-current", className)}
        style={{ width: size, height: size, mask, WebkitMask: mask }}
      />
    );
  }

  return (
    // Plain img: these are tiny static SVGs, and next/image does not optimize SVG.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={entry.color} alt={decorative ? "" : entry.name} width={size} height={size} className={cn("shrink-0 object-contain", className)} />
  );
}
