"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { type GlowColor } from "@/components/ui/glow-color";
import { cn } from "@/lib/utils";

export type { AgentAccentName, GlowColor } from "@/components/ui/glow-color";
export { glowColorForAccent } from "@/components/ui/glow-color";

type GlowPreset = {
  base: string;
  spread: number;
  saturation: string;
  lightness: string;
};

/**
 * Hues come from the theme tokens in globals.css (brand violet, and the
 * success / warning / danger accents). "blue" is the deeper brand violet:
 * the product has no separate blue.
 */
const glowColorMap: Record<GlowColor, GlowPreset> = {
  brand: {
    base: "var(--glow-hue-brand)",
    spread: 24,
    saturation: "var(--glow-sat-brand)",
    lightness: "var(--glow-light-brand)",
  },
  purple: {
    base: "var(--glow-hue-brand-soft)",
    spread: 22,
    saturation: "var(--glow-sat-brand-soft)",
    lightness: "var(--glow-light-brand-soft)",
  },
  blue: {
    base: "var(--glow-hue-brand-deep)",
    spread: 16,
    saturation: "var(--glow-sat-brand-deep)",
    lightness: "var(--glow-light-brand-deep)",
  },
  green: {
    base: "var(--glow-hue-success)",
    spread: 18,
    saturation: "var(--glow-sat-success)",
    lightness: "var(--glow-light-success)",
  },
  red: {
    base: "var(--glow-hue-danger)",
    spread: 14,
    saturation: "var(--glow-sat-danger)",
    lightness: "var(--glow-light-danger)",
  },
  orange: {
    base: "var(--glow-hue-warning)",
    spread: 16,
    saturation: "var(--glow-sat-warning)",
    lightness: "var(--glow-light-warning)",
  },
};

const sizeMap = {
  sm: "w-48 h-64",
  md: "w-64 h-80",
  lg: "w-80 h-96",
} as const;

type GlowStyle = CSSProperties & {
  "--glow-base": string;
  "--glow-spread": number;
  "--glow-saturation": string;
  "--glow-lightness": string;
  "--glow-radius": number;
  "--glow-border-width": number;
  "--glow-size": number;
  "--glow-outer": number;
  "--glow-edge"?: string;
};

const glowCards = new Set<HTMLElement>();

function syncGlowPointer(event: PointerEvent) {
  const x = event.clientX.toFixed(2);
  const y = event.clientY.toFixed(2);
  const xp = (event.clientX / window.innerWidth).toFixed(2);
  const yp = (event.clientY / window.innerHeight).toFixed(2);
  glowCards.forEach((card) => {
    card.style.setProperty("--x", x);
    card.style.setProperty("--y", y);
    card.style.setProperty("--xp", xp);
    card.style.setProperty("--yp", yp);
  });
}

export type GlowCardProps = {
  children?: ReactNode;
  className?: string;
  glowColor?: GlowColor;
  size?: keyof typeof sizeMap;
  width?: string | number;
  height?: string | number;
  customSize?: boolean;
  /** Border thickness in px. Dense agent rows use 2; the showcase size stays at 3. */
  borderWidth?: number;
  edge?: "default" | "primary" | "warning";
};

export function GlowCard({
  children,
  className,
  glowColor = "brand",
  size = "md",
  width,
  height,
  customSize = false,
  borderWidth = 3,
  edge = "default",
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const preset = glowColorMap[glowColor];

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    glowCards.add(node);
    if (glowCards.size === 1) document.addEventListener("pointermove", syncGlowPointer);
    return () => {
      glowCards.delete(node);
      if (glowCards.size === 0) document.removeEventListener("pointermove", syncGlowPointer);
    };
  }, []);

  const style: GlowStyle = {
    "--glow-base": preset.base,
    "--glow-spread": preset.spread,
    "--glow-saturation": preset.saturation,
    "--glow-lightness": preset.lightness,
    "--glow-radius": 14,
    "--glow-border-width": borderWidth,
    "--glow-size": 200,
    "--glow-outer": 1,
  };
  if (width !== undefined) style.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === "number" ? `${height}px` : height;
  if (edge === "primary") style["--glow-edge"] = "color-mix(in srgb, var(--primary) 70%, var(--border))";
  if (edge === "warning") style["--glow-edge"] = "color-mix(in srgb, var(--warning) 70%, var(--border))";

  return (
    <div
      ref={cardRef}
      data-slot="glow-card"
      style={style}
      className={cn(
        "text-card-foreground backdrop-blur-[5px]",
        customSize ? "w-full" : cn(sizeMap[size], "grid aspect-[3/4] grid-rows-[1fr_auto] gap-4 p-4"),
        className,
      )}
    >
      <div data-glow-spot aria-hidden />
      {children}
    </div>
  );
}
