"use client";

import { Iphone } from "@/components/ui/iphone";
import { Safari } from "@/components/ui/safari";
import { AnimatedSpan, Terminal, TypingAnimation } from "@/components/ui/terminal";

export function InstallMoment() {
  return (
    <div className="space-y-6">
      <Iphone className="mx-auto max-w-[13rem] lg:hidden" />
      <Safari className="hidden w-full lg:block" url="app.vistrial.com/app/install" />
      <Terminal className="max-h-none max-w-none">
        <TypingAnimation>Open this link in Safari.</TypingAnimation>
        <AnimatedSpan className="text-flag-good">Share → Add to Home Screen</AnimatedSpan>
        <TypingAnimation>Open Vistrial from the icon.</TypingAnimation>
        <AnimatedSpan className="text-silver">Logging from that icon completes training.</AnimatedSpan>
      </Terminal>
    </div>
  );
}

