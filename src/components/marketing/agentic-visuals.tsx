"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { CheckCircle2, FileText, Globe, Hand, Loader2, RotateCcw, Upload } from "@/components/icons";

import { PlatformLogo } from "@/components/marketing/platform-logo";
import { Badge } from "@/components/ui/badge";
import { AGENT_FLOW, APPROVAL, SOURCES } from "@/lib/marketing/content";
import { marketingPageGutter, marketingShell } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * Motion helpers. Every animation here holds its final frame when the visitor
 * asks for reduced motion, or when the app's calm mode is on.
 * ------------------------------------------------------------------------- */

function prefersStill() {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.getAttribute("data-calm") === "true"
  );
}

/** Steps forward on a timer, and holds the last frame when motion is reduced. */
export function useCycle(length: number, interval = 2600) {
  const [index, setIndex] = useState<number | "still">("still");
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (prefersStill()) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current === "still" ? 0 : (current + 1) % length));
    }, interval);
    const onChange = () => {
      if (media.matches) {
        window.clearInterval(timer);
        setIndex("still");
      }
    };
    media.addEventListener("change", onChange);
    return () => {
      window.clearInterval(timer);
      media.removeEventListener("change", onChange);
    };
  }, [interval, length]);
  return index === "still" ? length - 1 : index;
}

/**
 * Counts up from 0 to `total` once the element scrolls into view, one step per
 * `interval`. Returns `total` straight away when motion is reduced.
 */
export function useInViewSequence(ref: RefObject<HTMLElement | null>, total: number, interval = 900) {
  const [count, setCount] = useState<number | "still">("still");
  useEffect(() => {
    const node = ref.current;
    if (!node || prefersStill()) return;
    setCount(0);
    let timer: number | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        timer = window.setInterval(() => {
          setCount((current) => {
            const next = (current === "still" ? total : current) + 1;
            if (next >= total && timer) window.clearInterval(timer);
            return Math.min(next, total);
          });
        }, interval);
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer) window.clearInterval(timer);
    };
  }, [interval, ref, total]);
  return count === "still" ? total : count;
}

/* ---------------------------------------------------------------------------
 * Beams: SVG paths drawn between elements, with a short light travelling along
 * each one. Positions are measured, so they follow the layout as it resizes.
 * ------------------------------------------------------------------------- */

type BeamPath = { d: string; delay: number };

/**
 * Measures beams inside `containerRef`. Each pair names a CSS selector for the
 * start elements and one for the end element. Elements are looked up when
 * measuring, so nothing is read during render.
 */
function useBeamPaths(containerRef: RefObject<HTMLElement | null>, pairs: ReadonlyArray<{ from: string; to: string }>) {
  const [paths, setPaths] = useState<BeamPath[]>([]);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const box = container.getBoundingClientRect();
    const next: BeamPath[] = [];
    for (const pair of pairs) {
      const target = container.querySelector(pair.to)?.getBoundingClientRect();
      if (!target || target.width === 0) continue;
      container.querySelectorAll(pair.from).forEach((element) => {
        const from = element.getBoundingClientRect();
        if (from.width === 0) return;
        const x1 = from.right - box.left;
        const y1 = from.top + from.height / 2 - box.top;
        const x2 = target.left - box.left;
        const y2 = target.top + target.height / 2 - box.top;
        const bend = Math.max(24, (x2 - x1) * 0.5);
        next.push({ d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`, delay: next.length * 0.45 });
      });
    }
    setPaths(next);
  }, [containerRef, pairs]);

  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, measure]);

  return paths;
}

const FLOW_BEAMS = [
  { from: '[data-beam="source"]', to: '[data-beam="agent"]' },
  { from: '[data-beam="agent"]', to: '[data-beam="output"]' },
] as const;

function Beams({ paths, id }: { paths: BeamPath[]; id: string }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 hidden h-full w-full overflow-visible lg:block">
      <defs>
        <linearGradient id={`${id}-glow`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#9A88FC" stopOpacity="0" />
          <stop offset="50%" stopColor="#9A88FC" />
          <stop offset="100%" stopColor="#6650D8" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {paths.map((path, index) => (
        <g key={index}>
          <path d={path.d} fill="none" stroke="var(--border)" strokeWidth="1.5" />
          <path
            d={path.d}
            pathLength={100}
            fill="none"
            stroke={`url(#${id}-glow)`}
            strokeWidth="2"
            strokeLinecap="round"
            className="beam-dash"
            style={{ animationDelay: `${path.delay}s` }}
          />
        </g>
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * Strip under the hero: sources flow into the agent, the agent hands back a draft
 * ------------------------------------------------------------------------- */

const SOURCE_LOGO: Record<(typeof SOURCES.items)[number]["key"], string | null> = {
  web: null,
  youtube: "youtube",
  meta: "meta",
  tiktok: "tiktok",
  instagram: "instagram",
  results: null,
};

function SourceMark({ sourceKey }: { sourceKey: (typeof SOURCES.items)[number]["key"] }) {
  const logo = SOURCE_LOGO[sourceKey];
  if (logo) return <PlatformLogo id={logo} size={16} decorative />;
  const Icon = sourceKey === "web" ? Globe : Upload;
  return <Icon className="size-4 text-brand-400" aria-hidden />;
}

export function AgentFlow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const paths = useBeamPaths(containerRef, FLOW_BEAMS);
  const status = useCycle(AGENT_FLOW.statuses.length, 2400);

  return (
    <section aria-label={SOURCES.label} className={cn("border-y border-border bg-card", marketingPageGutter)}>
      <div className={cn(marketingShell, "py-10 sm:py-12")}>
        <div ref={containerRef} className="relative grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr] lg:gap-20">
          <Beams paths={paths} id="agent-flow" />

          <div className="relative">
            <p className="mb-3 text-sm font-medium text-muted-foreground lg:text-right">{SOURCES.label}</p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1 lg:justify-items-end">
              {SOURCES.items.map((item) => (
                <li
                  key={item.key}
                  data-beam="source"
                  className="inline-flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-strong lg:w-auto"
                >
                  <SourceMark sourceKey={item.key} />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <div data-beam="agent" className="relative mx-auto flex w-full max-w-xs flex-col items-center gap-3 rounded-xl border border-brand-400/40 bg-background p-5 text-center shadow-[0_0_60px_-24px_rgba(154,136,252,0.9)] lg:w-64">
            <span className="relative flex size-14 items-center justify-center rounded-full border border-brand-400/40 bg-background shadow-[0_0_0_4px_rgba(154,136,252,0.12)]">
              {/* The black Vistrial crest. The public site is always light, so the ink art always shows. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/vistrial-crest-ink-96.png" alt="" width={96} height={96} className="size-10" />
              <span aria-hidden className="live-pulse absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-background bg-success" />
            </span>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-200 uppercase">{AGENT_FLOW.agentRole}</p>
              <p className="font-heading text-lg tracking-tight text-strong">{AGENT_FLOW.agent}</p>
            </div>
            <p className="min-h-10 text-xs leading-relaxed text-muted-foreground" aria-live="off">
              <span className="live-shimmer-text">{AGENT_FLOW.statuses[status]}</span>
            </p>
          </div>

          <div data-beam="output" className="relative mx-auto w-full max-w-xs rounded-xl border border-border bg-background p-4 lg:mx-0">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                <FileText className="size-4 text-brand-400" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-strong">{AGENT_FLOW.output.title}</p>
                <p className="text-xs text-muted-foreground">{AGENT_FLOW.output.meta}</p>
              </div>
            </div>
            <Badge variant="warning" size="sm" className="mt-3">
              {AGENT_FLOW.output.state}
            </Badge>
          </div>
        </div>
        <p className="mt-6 text-xs text-muted-foreground lg:text-center">{AGENT_FLOW.caption}</p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Safety: a draft that only moves when a person holds to approve it
 * ------------------------------------------------------------------------- */

const HOLD_MS = 1200;

/** `children` gets whether the draft is approved, so the card's own status can follow it. */
export function HoldToApprove({ children }: { children?: (approved: boolean) => ReactNode }) {
  const [progress, setProgress] = useState(0);
  const [approved, setApproved] = useState(false);
  const frame = useRef<number | null>(null);
  const started = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    started.current = null;
    setProgress((current) => (current >= 1 ? current : 0));
  }, []);

  const start = useCallback(() => {
    if (approved || started.current !== null) return;
    started.current = performance.now();
    const tick = (now: number) => {
      const value = Math.min(1, (now - (started.current ?? now)) / HOLD_MS);
      setProgress(value);
      if (value >= 1) {
        frame.current = null;
        started.current = null;
        setApproved(true);
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [approved]);

  useEffect(() => () => stop(), [stop]);

  const reset = () => {
    stop();
    setProgress(0);
    setApproved(false);
  };

  return (
    <div className="space-y-3">
      {children?.(approved)}
      <div aria-live="polite" className="sr-only">
        {approved ? `${APPROVAL.approvedTitle}. ${APPROVAL.approvedBody}` : ""}
      </div>
      {approved ? (
        <div className="live-enter flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-strong">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            <span>
              <span className="font-medium">{APPROVAL.approvedTitle}.</span> {APPROVAL.approvedBody}
            </span>
          </span>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-strong focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {APPROVAL.reset}
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <button
            type="button"
            aria-describedby="hold-to-approve-hint"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              start();
            }}
            onPointerUp={stop}
            onPointerCancel={stop}
            onLostPointerCapture={stop}
            onKeyDown={(event) => {
              if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                event.preventDefault();
                start();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === " " || event.key === "Enter") stop();
            }}
            onBlur={stop}
            onContextMenu={(event) => event.preventDefault()}
            className="relative inline-flex h-10 w-full touch-none items-center justify-center gap-2 overflow-hidden rounded-lg border border-brand-500/50 bg-background text-sm font-medium text-strong select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:w-auto sm:px-5"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-400/35 to-brand-600/35"
              style={{ width: `${progress * 100}%` }}
            />
            <span className="relative inline-flex items-center gap-2">
              {progress > 0 ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Hand className="size-4" aria-hidden />}
              {progress > 0 ? APPROVAL.holding : APPROVAL.hold}
            </span>
          </button>
          <p id="hold-to-approve-hint" className="text-xs text-muted-foreground">
            {APPROVAL.hint}
          </p>
        </div>
      )}
    </div>
  );
}
