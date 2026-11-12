import Image from "next/image";

import { GlyphMark } from "@/components/live/agent-identity";
import { agentAvatarSrc } from "@/lib/agents/avatars";
import { AGENT_MARK } from "@/lib/shell/journey";
import { cn } from "@/lib/utils";

const BOX = { xs: "size-6", sm: "size-8", md: "size-10", lg: "size-14" } as const;
const PIXELS = { xs: 24, sm: 32, md: 40, lg: 56 } as const;
const DOT = { xs: "size-1.5 border", sm: "size-2 border-2", md: "size-2.5 border-2", lg: "size-3 border-2" } as const;

/**
 * An agent's face. Decorative: the agent's name is always written beside it, so the picture carries no
 * meaning of its own. An agent with no picture falls back to its glyph.
 */
export function AgentAvatar({
  slug,
  size = "sm",
  working = false,
  className,
}: {
  slug: string | null | undefined;
  size?: keyof typeof BOX;
  working?: boolean;
  className?: string;
}) {
  const src = agentAvatarSrc(slug);
  if (!src) {
    const mark = (slug ? AGENT_MARK[slug] : undefined) ?? { glyph: "spark" as const, accent: "neutral" as const };
    return <GlyphMark glyph={mark.glyph} accent={mark.accent} size={size === "lg" ? "lg" : size} working={working} className={className} />;
  }
  return (
    <span aria-hidden data-agent-avatar={slug ?? ""} className={cn("relative inline-flex shrink-0", BOX[size], className)}>
      <Image src={src} alt="" width={PIXELS[size] * 2} height={PIXELS[size] * 2} className="size-full rounded-full ring-1 ring-border" />
      {working ? <span className={cn("live-pulse absolute right-0 bottom-0 rounded-full border-background bg-primary", DOT[size])} /> : null}
    </span>
  );
}
