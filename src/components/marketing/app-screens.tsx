"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { AgentAvatar } from "@/components/live/agent-avatar";
import { BorderBeam } from "@/components/ui/border-beam";
import { APP_SCREENS, PICTURE_NOTE, type Picture } from "@/lib/marketing/pictures";
import { cn } from "@/lib/utils";

/**
 * Real screens from the app on the public page: single pictures in a frame, and a window that steps
 * through the main screens the way the app is used. Nothing here is a mock-up. The site is white
 * only, and the tour holds still when motion is reduced.
 */

/** A step counter that never runs when the visitor asks for reduced motion. `null` means still. */
function useTicker(length: number, interval: number, paused = false) {
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || document.documentElement.getAttribute("data-calm") === "true") return;
    // The first tick comes at once, so the page is seen to be running; the rest keep the interval.
    const first = window.setTimeout(() => setIndex((current) => current ?? 0), 0);
    if (paused) return () => window.clearTimeout(first);
    const timer = window.setInterval(() => setIndex((current) => ((current ?? 0) + 1) % length), interval);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [interval, length, paused]);
  return index;
}

/** The light that travels a frame's edge. Hidden when motion is reduced. */
function Beam({ delay = 0 }: { delay?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 motion-reduce:hidden" aria-hidden>
      <BorderBeam delay={delay} duration={8} size={110} borderWidth={1} colorFrom="#9A88FC" colorTo="#C3B6FE" />
    </div>
  );
}

/** `crop` keeps the top of a tall screen and fades the rest, so pictures in one row share a height. */
export function ProductPicture({
  picture,
  className,
  crop,
  sizes = "(min-width: 1024px) 560px, 100vw",
}: {
  picture: Picture;
  className?: string;
  crop?: string;
  sizes?: string;
}) {
  if (!picture.on || !picture.file) return null;
  const shared = { width: picture.width, height: picture.height, sizes };
  return (
    <figure className={cn("flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_50px_-32px_rgba(11,10,17,0.45)]", className)}>
      <div className="flex items-center gap-3 border-b border-border bg-muted px-3 py-2">
        <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-brand-400" />
        </span>
        <p className="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="live-pulse size-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
          {picture.place === "skill" ? <AgentAvatar name={APP_SCREENS.agent} size="xs" className="size-5" /> : null}
          <span className="truncate">
            {picture.place === "skill" ? APP_SCREENS.agent : APP_SCREENS.app} · <span className="font-medium text-strong">{picture.by}</span>
          </span>
        </p>
      </div>
      <div className={cn("relative overflow-hidden", crop)}>
        {/* On a phone the picture is shown larger and cut at the right edge, so its words stay readable. */}
        <Image
          src={`/marketing/product/${picture.file}.png`}
          alt={picture.alt}
          {...shared}
          // Pictures are captured at twice their size, so half the file's width is the sharpest a screen can be shown.
          style={{ maxWidth: picture.width / 2 }}
          className={cn("h-auto sm:mx-auto sm:w-full", picture.phone === "fit" ? "w-full" : "w-[200%]")}
        />
        {crop ? <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" /> : null}
      </div>
      <figcaption className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-border px-4 py-3">
        <span className="text-sm font-medium text-strong">{picture.title}</span>
        <span className="text-xs text-muted-foreground">{PICTURE_NOTE}</span>
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------------------
 * The app, shown the way it is used: one real screen after another.
 * ------------------------------------------------------------------------- */

const TOUR_MS = 5200;

export function AppTour({ pictures }: { pictures: Picture[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const auto = useTicker(pictures.length, TOUR_MS, picked !== null || held);
  const index = picked ?? auto ?? 0;
  const picture = pictures[index];
  if (!picture?.file) return null;
  const running = picked === null && auto !== null && !held;
  // A short screen sits in the middle of the stage. The stage keeps one height, so nothing below it jumps.
  const short = picture.height / picture.width < 0.5;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_0_80px_-32px_rgba(var(--brand-rgb),0.9)]"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <Beam delay={1.2} />
      <div className="relative flex items-center gap-3 border-b border-border bg-muted px-3 py-2.5 sm:px-4">
        <div className="flex shrink-0 items-center gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-brand-400" />
        </div>
        <p className="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="live-pulse size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
          <AgentAvatar name={APP_SCREENS.agent} size="xs" className="size-5" />
          <span className="shrink-0 font-medium text-strong">{APP_SCREENS.agent}</span>
          <span key={picture.id} className="live-enter truncate">
            {picture.doing}
          </span>
        </p>
      </div>

      {/* The screens. Each is a button; the one in view fills as its turn runs. */}
      <ul className="relative grid grid-cols-2 gap-1.5 border-b border-border p-2 sm:grid-cols-4" aria-label={APP_SCREENS.tourLabel}>
        {pictures.map((item, position) => {
          const on = position === index;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setPicked(position)}
                aria-pressed={on}
                className={cn(
                  "relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none",
                  on ? "border-brand-500/50 bg-brand-500/10 text-strong" : "border-transparent text-muted-foreground hover:bg-muted hover:text-strong",
                )}
              >
                {item.tab ?? item.title}
                {on && running ? <span key={`${item.id}-${auto}`} aria-hidden className="tour-fill absolute inset-x-0 bottom-0 h-0.5 bg-brand-500" style={{ animationDuration: `${TOUR_MS}ms` }} /> : null}
              </button>
            </li>
          );
        })}
      </ul>

      <figure className="relative">
        <div key={picture.id} className={cn("live-enter relative flex h-[24rem] overflow-hidden sm:h-[34rem]", short ? "items-center" : "items-start")}>
          {/* On a phone the picture is shown larger and cut at the right edge, so its words stay readable. */}
          <Image
            src={`/marketing/product/${picture.file}.png`}
            alt={picture.alt}
            width={picture.width}
            height={picture.height}
            sizes="(min-width: 1152px) 1152px, 100vw"
            // Pictures are captured at twice their size, so half the file's width is the sharpest a screen can be shown.
            style={{ maxWidth: picture.width / 2 }}
            className={cn("h-auto shrink-0 sm:mx-auto sm:w-full sm:shrink", picture.phone === "fit" ? "w-full" : "w-[200%]")}
          />
          {short ? null : <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />}
        </div>
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-border px-4 py-3">
          <span className="text-sm font-medium text-strong">{picture.title}</span>
          <span className="text-xs text-muted-foreground">{PICTURE_NOTE}</span>
        </figcaption>
      </figure>
    </div>
  );
}
