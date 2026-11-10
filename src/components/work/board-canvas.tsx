"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Minus, Plus } from "@/components/icons";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { edgePath, fitBoard, type Board, type BoardNode } from "@/lib/work/board";
import { cn } from "@/lib/utils";

export type WorkView = "cards" | "canvas";

const VIEW_STORE = "vistrial.workView.v1";

/** The view a person last chose, remembered on this device. Cards when nothing is remembered. */
export function readWorkView(): WorkView {
  try {
    return window.localStorage.getItem(VIEW_STORE) === "canvas" ? "canvas" : "cards";
  } catch {
    return "cards";
  }
}

function writeWorkView(view: WorkView) {
  try {
    window.localStorage.setItem(VIEW_STORE, view);
  } catch {
    // Private windows and blocked storage: the switch still works, it just is not remembered.
  }
}

/** Remembers Cards or Canvas across the work tabs. `initial` pins it (stories and deep links). */
export function useWorkView(initial?: WorkView) {
  const [view, setView] = useState<WorkView>(() => initial ?? (typeof window === "undefined" ? "cards" : readWorkView()));
  return [
    view,
    (next: WorkView) => {
      setView(next);
      writeWorkView(next);
    },
  ] as const;
}

/** Cards or Canvas: two ways to look at the same data. Shown on every screen size. */
export function ViewSwitch({ view, onChange }: { view: WorkView; onChange: (view: WorkView) => void }) {
  return (
    <SegmentedRadioGroup
      aria-label="View"
      size="sm"
      value={view}
      onValueChange={(next) => onChange(next === "canvas" ? "canvas" : "cards")}
      options={[
        { value: "cards", label: "Cards" },
        { value: "canvas", label: "Canvas" },
      ]}
    />
  );
}

type View = { x: number; y: number; k: number };

const MIN = 0.2;
/** Below this zoom a card's text is too small to read. */
const READABLE = 0.62;
const MAX = 1.5;
const INTERACTIVE = "a,button,select,input,textarea,label,summary";

function clamp(value: number) {
  return Math.min(MAX, Math.max(MIN, value));
}

/**
 * A read-only board: cards laid out in code, joined by lines, on a surface a person can drag to pan and
 * pinch or use the buttons to zoom. Nothing a person does here is stored. Buttons and links inside a card
 * work as usual; dragging starts only on the background or on a card's plain text.
 */
export function BoardCanvas({ board, label, renderNode, focus, className }: { board: Board; label: string; renderNode: (node: BoardNode) => ReactNode; /** The card a small screen opens on, at a readable size. */ focus?: string; className?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 24, y: 24, k: 1 });
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; k: number } | null>(null);

  const fit = useCallback(() => {
    const box = frame.current?.getBoundingClientRect();
    if (box) setView(fitBoard(board, { width: box.width, height: box.height }));
  }, [board]);

  // When the board first shows, and whenever its shape changes: the whole board if that stays readable,
  // otherwise (a phone) a readable zoom centred on the main card. Fit still shows everything.
  useLayoutEffect(() => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    const whole = fitBoard(board, { width: box.width, height: box.height - 48 });
    const node = board.nodes.find((row) => row.id === focus) ?? board.nodes[0];
    if (whole.k >= READABLE || !node) {
      setView(whole);
      return;
    }
    setView({ k: READABLE, x: Math.round(box.width / 2 - (node.x + node.w / 2) * READABLE), y: Math.round(Math.max(16, box.height / 2 - (node.y + node.h / 2) * READABLE - 24)) });
  }, [board, focus]);

  const zoomAt = useCallback((factor: number, at?: { x: number; y: number }) => {
    setView((current) => {
      const box = frame.current?.getBoundingClientRect();
      const point = at ?? { x: (box?.width ?? 0) / 2, y: (box?.height ?? 0) / 2 };
      const k = clamp(current.k * factor);
      const ratio = k / current.k;
      return { k, x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio };
    });
  }, []);

  // Ctrl or ⌘ + wheel zooms; a plain wheel still scrolls the page, so the board never traps it.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const box = node.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, { x: event.clientX - box.left, y: event.clientY - box.top });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const control = "flex size-10 items-center justify-center text-card-foreground outline-none hover:bg-overlay/[0.06] focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-muted/30", className)}>
      <div
        ref={frame}
        role="group"
        aria-label={label}
        tabIndex={0}
        className={cn("relative h-[68dvh] min-h-[420px] w-full touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring", dragging ? "cursor-grabbing select-none" : "cursor-grab")}
        style={{ backgroundImage: "radial-gradient(color-mix(in srgb, currentColor 16%, transparent) 1px, transparent 1px)", backgroundSize: `${24 * view.k}px ${24 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
        onPointerDown={(event) => {
          if ((event.target as Element).closest(INTERACTIVE)) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
          }
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const last = pointers.current.get(event.pointerId);
          if (!last) return;
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.current.size === 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()];
            const box = event.currentTarget.getBoundingClientRect();
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            const target = clamp(pinch.current.k * (distance / (pinch.current.distance || 1)));
            setView((current) => {
              const point = { x: (a.x + b.x) / 2 - box.left, y: (a.y + b.y) / 2 - box.top };
              const ratio = target / current.k;
              return { k: target, x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio };
            });
            return;
          }
          setView((current) => ({ ...current, x: current.x + event.clientX - last.x, y: current.y + event.clientY - last.y }));
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          if (pointers.current.size === 0) setDragging(false);
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          pinch.current = null;
          if (pointers.current.size === 0) setDragging(false);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const step = 48;
          const move: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
          if (move[event.key]) {
            event.preventDefault();
            setView((current) => ({ ...current, x: current.x + move[event.key][0], y: current.y + move[event.key][1] }));
          } else if (event.key === "+" || event.key === "=") zoomAt(1.2);
          else if (event.key === "-") zoomAt(1 / 1.2);
          else if (event.key === "0") fit();
        }}
      >
        <div className="absolute top-0 left-0 origin-top-left" style={{ width: board.width, height: board.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg aria-hidden width={board.width} height={board.height} className="pointer-events-none absolute top-0 left-0 overflow-visible">
            {board.edges.map((edge) => (
              <path key={`${edge.from}-${edge.to}`} d={edgePath(board, edge)} fill="none" strokeWidth={2} className={edge.strong ? "stroke-primary" : "stroke-muted-foreground/45"} />
            ))}
          </svg>
          {board.nodes.map((node) => (
            <div key={node.id} className="absolute" style={{ left: node.x, top: node.y, width: node.w, height: node.h }}>
              {renderNode(node)}
            </div>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Zoom" className="absolute right-3 bottom-3 flex items-center overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <button type="button" aria-label="Zoom out" className={control} onClick={() => zoomAt(1 / 1.2)}>
          <Minus aria-hidden className="size-4" />
        </button>
        <span aria-live="polite" className="min-w-11 text-center text-xs text-muted-foreground tabular-nums">
          {Math.round(view.k * 100)}%
        </span>
        <button type="button" aria-label="Zoom in" className={control} onClick={() => zoomAt(1.2)}>
          <Plus aria-hidden className="size-4" />
        </button>
        <button type="button" className={cn(control, "w-auto border-l border-border px-3 text-xs font-medium")} onClick={fit}>
          Fit
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-lg bg-card/90 px-2 py-1 text-[11px] text-muted-foreground sm:block">Drag to move · pinch or use the buttons to zoom</p>
    </div>
  );
}

/** A card on the board: fills its slot, clips what does not fit. */
export function BoardCard({ tone = "plain", className, children }: { tone?: "plain" | "accent" | "dark" | "warning" | "current"; className?: string; children: ReactNode }) {
  const tones = {
    plain: "border-border bg-card",
    accent: "border-primary/40 bg-primary/[0.09]",
    current: "border-2 border-primary bg-card shadow-lg shadow-primary/10",
    dark: "border-transparent bg-[#0b0a11] text-white dark:bg-white dark:text-[#0b0a11]",
    warning: "border-warning/50 bg-warning/[0.08]",
  } as const;
  return <div className={cn("grid h-full w-full content-start gap-1.5 overflow-hidden rounded-xl border p-3.5 text-left", tones[tone], className)}>{children}</div>;
}
