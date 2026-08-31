"use client";

import { TextAnimate } from "@/components/ui/text-animate";
import { cn } from "@/lib/utils";

/**
 * Landing hero title: the accent phrase still carries the gradient, and both
 * halves enter word by word. The heading itself keeps the full sentence for
 * assistive tech.
 */
export function AnimatedHeroHeadline({
  before,
  accent,
  className,
}: {
  before: string;
  accent: string;
  className?: string;
}) {
  return (
    <h1 className={cn(className)} aria-label={`${before}${accent}`}>
      <TextAnimate
        as="span"
        by="word"
        animation="blurInUp"
        startOnView={false}
        once
        accessible={false}
        duration={0.4}
        className="inline"
      >
        {before}
      </TextAnimate>
      <TextAnimate
        as="span"
        by="word"
        animation="blurInUp"
        startOnView={false}
        once
        accessible={false}
        delay={0.14}
        duration={0.4}
        className="text-gradient inline"
      >
        {accent}
      </TextAnimate>
    </h1>
  );
}
