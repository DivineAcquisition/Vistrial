"use client"

import { AnimatePresence, motion } from "motion/react"
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type Step = {
  id: string
  title: string
  description?: string
  targetSelector: string
  completed?: boolean
}

export interface InteractiveOnboardingChecklistProps {
  steps: Step[]
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?(open: boolean): void
  onCompleteStep?(id: string): void
  onFinish?(): void
  /** Panel heading. Defaults to "Getting Started". */
  title?: string
  accentColorVar?: string
  placement?: "left" | "right"
}

type TargetBox = { top: number; left: number; width: number; height: number }

function targetBox(selector: string): TargetBox | null {
  const element = document.querySelector(selector)
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

function CoachmarkOverlay({
  step,
  onNext,
  onPrev,
  onComplete,
  onClose,
  isFirst,
  isLast,
  stepIndex,
  totalSteps,
}: {
  step: Step
  onNext: () => void
  onPrev: () => void
  onComplete: () => void
  onClose: () => void
  isFirst: boolean
  isLast: boolean
  stepIndex: number
  totalSteps: number
}) {
  const [box, setBox] = useState<TargetBox | null>(() => (typeof document === "undefined" ? null : targetBox(step.targetSelector)))

  const update = useCallback(() => setBox(targetBox(step.targetSelector)), [step.targetSelector])

  useEffect(() => {
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    const target = document.querySelector(step.targetSelector)
    const observer = new ResizeObserver(update)
    if (target) observer.observe(target)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
      observer.disconnect()
    }
  }, [step.targetSelector, update])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      else if (event.key === "ArrowRight" && !isLast) onNext()
      else if (event.key === "ArrowLeft" && !isFirst) onPrev()
      else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        onComplete()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose, onNext, onPrev, onComplete, isFirst, isLast])

  if (!box) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coachmark-title"
      >
        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-4 max-w-md rounded-xl border bg-card p-6 shadow-lg">
          <h3 id="coachmark-title" className="mb-2 text-lg font-semibold">
            {step.title}
          </h3>
          <p className="mb-4 text-muted-foreground">That part of the page is not here yet.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" size="sm" onClick={onComplete}>
              Mark complete
            </Button>
          </div>
        </motion.div>
      </motion.div>
    )
  }

  const { top, left, width, height } = box
  const pad = 8
  const radius = Math.max(width, height) / 2 + pad

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coachmark-title"
      style={{
        background: `radial-gradient(circle at ${left + width / 2}px ${top + height / 2}px, transparent ${radius}px, rgba(0,0,0,0.7) ${radius + 1}px)`,
      }}
    >
      <div
        className="absolute rounded-lg border-2 border-primary shadow-lg"
        style={{ top: top - pad, left: left - pad, width: width + pad * 2, height: height + pad * 2 }}
      />
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ type: "spring", damping: 25, stiffness: 400 }}
        className="pointer-events-auto absolute max-w-sm rounded-xl border bg-card p-4 shadow-xl"
        style={cardPosition(box)}
      >
        <div className="mb-3">
          <h3 id="coachmark-title" className="mb-1 text-base font-semibold">
            {step.title}
          </h3>
          <p className="text-sm text-muted-foreground">
            Step {stepIndex + 1} of {totalSteps}
          </p>
        </div>
        {step.description ? <p className="mb-4 text-sm text-foreground">{step.description}</p> : null}
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrev} disabled={isFirst} aria-label="Previous step">
            <ChevronLeft />
            Prev
          </Button>
          <Button variant="outline" size="sm" onClick={onNext} disabled={isLast} aria-label="Next step">
            Next
            <ChevronRight />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function cardPosition(box: TargetBox): { top: number; left: number } {
  const cardWidth = 384
  const cardHeight = 200
  const margin = 16
  const below = { top: box.top + box.height + margin, left: box.left + box.width / 2 - cardWidth / 2 }
  const above = { top: box.top - cardHeight - margin, left: below.left }
  const fits = (spot: { top: number; left: number }) =>
    spot.left >= margin && spot.left + cardWidth <= window.innerWidth - margin && spot.top >= margin && spot.top + cardHeight <= window.innerHeight - margin
  if (fits(below)) return below
  if (fits(above)) return above
  return {
    top: Math.max(margin, Math.min(below.top, window.innerHeight - cardHeight - margin)),
    left: Math.max(margin, Math.min(below.left, window.innerWidth - cardWidth - margin)),
  }
}

export function InteractiveOnboardingChecklist({
  steps,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  onCompleteStep,
  onFinish,
  title = "Getting Started",
  placement = "right",
}: InteractiveOnboardingChecklistProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const [extraDone, setExtraDone] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const signature = steps.map((step) => `${step.id}:${step.completed ? 1 : 0}`).join(",")
  const done = useMemo(() => {
    const next = new Set(extraDone)
    for (const step of steps) if (step.completed) next.add(step.id)
    return next
    // signature tracks the completed flags without following a new array each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, extraDone])

  const firstOpenId = steps.find((step) => !done.has(step.id))?.id ?? null
  const finishRef = useRef(onFinish)
  finishRef.current = onFinish

  useEffect(() => {
    if (!open || activeId || !firstOpenId) return
    const timer = setTimeout(() => setActiveId(firstOpenId), 400)
    return () => clearTimeout(timer)
  }, [open, activeId, firstOpenId])

  useEffect(() => {
    if (!activeId || !done.has(activeId)) return
    const index = steps.findIndex((step) => step.id === activeId)
    const following = steps.slice(index + 1).find((step) => !done.has(step.id))
    const finished = steps.every((step) => done.has(step.id))
    const timer = setTimeout(() => {
      setActiveId(following?.id ?? null)
      if (finished) finishRef.current?.()
    }, 400)
    return () => clearTimeout(timer)
    // signature and extraDone cover completion. The steps array itself is often new each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, signature, extraDone])

  const close = () => {
    setActiveId(null)
    if (!isControlled) setInternalOpen(false)
    onOpenChange?.(false)
  }

  const complete = (id: string) => {
    setExtraDone((prev) => new Set([...prev, id]))
    onCompleteStep?.(id)
  }

  const activeIndex = steps.findIndex((step) => step.id === activeId)
  const active = activeIndex >= 0 ? steps[activeIndex] : null
  const completedCount = steps.filter((step) => done.has(step.id)).length
  const progress = steps.length === 0 ? 0 : (completedCount / steps.length) * 100
  const hasPrev = steps.slice(0, activeIndex).some((step) => !done.has(step.id))
  const hasNext = steps.slice(activeIndex + 1).some((step) => !done.has(step.id))

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="dialog"
            aria-labelledby="onboarding-title"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className={cn(
              "fixed bottom-4 z-[60] flex max-h-[calc(100vh-2rem)] w-[min(20rem,calc(100vw-2rem))] flex-col rounded-xl border bg-card shadow-xl",
              placement === "left" ? "left-4" : "right-4",
            )}
          >
            <div className="border-b p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 id="onboarding-title" className="text-lg font-semibold">
                  {title}
                </h2>
                <Button variant="ghost" size="icon-xs" aria-label="Close" onClick={close}>
                  <X />
                </Button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">
                    {completedCount}/{steps.length}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <motion.div className="h-2 rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <ul role="list" className="space-y-3">
                {steps.map((step) => {
                  const isCompleted = done.has(step.id)
                  const isActive = activeId === step.id
                  return (
                    <li key={step.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isCompleted) setActiveId(step.id)
                        }}
                        disabled={isCompleted}
                        className={cn(
                          "w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring",
                          isCompleted && "cursor-default border-success/30 bg-success/10",
                          isActive && "ring-2 ring-primary",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {isCompleted ? (
                              <div className="flex size-5 items-center justify-center rounded-full bg-success">
                                <Check className="size-3 text-background" />
                              </div>
                            ) : (
                              <Circle className="size-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className={cn("text-sm font-medium", isCompleted ? "text-muted-foreground line-through" : "text-foreground")}>{step.title}</span>
                            {step.description ? <p className="text-xs text-muted-foreground">{step.description}</p> : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            {completedCount === steps.length && steps.length > 0 ? (
              <div className="border-t p-6">
                <Button variant="primary" className="w-full" onClick={() => { onFinish?.(); close() }}>
                  <CheckCircle2 />
                  Finish setup
                </Button>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {active ? (
          <CoachmarkOverlay
            key={active.id}
            step={active}
            stepIndex={activeIndex}
            totalSteps={steps.length}
            isFirst={!hasPrev}
            isLast={!hasNext}
            onNext={() => {
              const following = steps.slice(activeIndex + 1).find((step) => !done.has(step.id))
              if (following) setActiveId(following.id)
            }}
            onPrev={() => {
              const earlier = [...steps.slice(0, activeIndex)].reverse().find((step) => !done.has(step.id))
              if (earlier) setActiveId(earlier.id)
            }}
            onComplete={() => complete(active.id)}
            onClose={() => setActiveId(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  )
}
