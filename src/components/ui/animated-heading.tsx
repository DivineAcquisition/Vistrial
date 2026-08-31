"use client";

import { TextAnimate } from "@/components/ui/text-animate";
import { cn } from "@/lib/utils";

/**
 * Word-by-word entrance for page and section titles. Plays once on view.
 */
export function AnimatedHeading({
  children,
  as = "h1",
  className,
  delay = 0,
}: {
  children: string;
  as?: "h1" | "h2" | "h3";
  className?: string;
  delay?: number;
}) {
  return (
    <TextAnimate
      as={as}
      by="word"
      animation="blurInUp"
      startOnView
      once
      delay={delay}
      duration={0.36}
      className={cn(className)}
    >
      {children}
    </TextAnimate>
  );
}
