"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import { GlowingEffect } from "@/components/ui/glowing-effect";
import { MagicCard } from "@/components/ui/magic-card";
import { Panel } from "@/components/ui/panel";
import { helperClass } from "@/lib/ui";

export function GlowLinkCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description?: string;
}) {
  return (
    <Link
      href={href}
      className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <div className="relative h-full rounded-2xl" style={{ "--black": "#C3B6FE" } as CSSProperties}>
        <GlowingEffect
          spread={40}
          glow
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
          variant="white"
          borderWidth={1}
        />
        <Panel className="relative h-full overflow-hidden p-0">
          <MagicCard className="flex h-full flex-col rounded-2xl p-6">
            <p className="text-base font-medium text-white">{title}</p>
            {description ? <p className={`mt-2 ${helperClass}`}>{description}</p> : null}
          </MagicCard>
        </Panel>
      </div>
    </Link>
  );
}
