"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CalendarClock, CheckSquare, Clock3, Mail, Phone, UserRound } from "lucide-react";

import { createCalendarHold, createCalendarTask, loadCalendarRange } from "@/lib/calendar/actions";
import {
  dayKey,
  whenLabel,
  type CalendarEventJson,
  type CalendarFilters,
  type CalendarKind,
  type CalendarPayload,
} from "@/lib/calendar/model";
import { EventCalendar, type EventCalendarRenderEventProps } from "@/components/reui/event-calendar/event-calendar";
import { EventCalendarContent } from "@/components/reui/event-calendar/event-calendar-content";
import { EventCalendarNav, EventCalendarToolbar } from "@/components/reui/event-calendar/event-calendar-nav";
import type { CalendarEvent, CalendarView, EventCalendarRangeInfo, EventCalendarSlotInfo } from "@/components/reui/event-calendar/event-calendar-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetPanel, SheetPopup, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { TaskType } from "@/lib/tasks/model";
import { cn } from "@/lib/utils";

const READ_ONLY = { drag: false, resize: false, selectSlot: false } as const;
const VIEWS: CalendarView[] = ["month", "week", "day", "resource", "agenda"];
const KIND_OPTIONS: Array<{ id: CalendarKind; label: string }> = [
  { id: "call", label: "Calls" },
  { id: "task", label: "Tasks" },
  { id: "draft", label: "Drafts" },
  { id: "window", label: "Replies" },
  { id: "workflow", label: "Workflow" },
  { id: "hold", label: "Holds" },
];
const TASK_OPTIONS: Array<{ type: TaskType; label: string }> = [
  { type: "call", label: "Call" },
  { type: "follow_up", label: "Follow-up" },
  { type: "prepare", label: "Prepare" },
  { type: "review", label: "Review" },
];

const ICONS = {
  call: Phone,
  task: CheckSquare,
  draft: Mail,
  window: Clock3,
  workflow: CalendarClock,
  hold: UserRound,
} as const;

type SlotMenu = { start: string; end: string; resourceId: string | null };

type SavedPrefs = {
  filters: CalendarFilters;
  weekStartsOn: 0 | 1;
  weekends: boolean;
  nowIndicator: boolean;
};

function readSaved(raw: string, fallback: CalendarFilters, canPickRep: boolean): SavedPrefs {
  const base: SavedPrefs = { filters: fallback, weekStartsOn: 0, weekends: true, nowIndicator: true };
  if (!raw) return base;
  try {
    const saved = JSON.parse(raw) as Partial<SavedPrefs>;
    return {
      filters: saved.filters
        ? { ...fallback, ...saved.filters, repId: canPickRep ? (saved.filters.repId ?? null) : fallback.repId }
        : fallback,
      weekStartsOn: saved.weekStartsOn === 1 ? 1 : 0,
      weekends: saved.weekends !== false,
      nowIndicator: saved.nowIndicator !== false,
    };
  } catch {
    return base;
  }
}

function usePhone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(max-width: 767px)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

function cacheKey(start: string, end: string, filters: CalendarFilters): string {
  return `${start}|${end}|${JSON.stringify(filters)}`;
}

export function SalesCalendarScreen({
  initial,
  memberId,
}: {
  initial: CalendarPayload;
  memberId: string;
}) {
  const phone = usePhone();
  const savedRaw = useSyncExternalStore(
    () => () => undefined,
    () => window.localStorage.getItem(`vistrial.calendar.${memberId}`) ?? "",
    () => "",
  );
  const saved = useMemo(() => readSaved(savedRaw, initial.filters, initial.canPickRep), [initial.canPickRep, initial.filters, savedRaw]);
  const [draft, setDraft] = useState<SavedPrefs | null>(null);
  const filters = draft?.filters ?? saved.filters;
  const weekStartsOn = draft?.weekStartsOn ?? saved.weekStartsOn;
  const weekends = draft?.weekends ?? saved.weekends;
  const nowIndicator = draft?.nowIndicator ?? saved.nowIndicator;
  const [pickedView, setPickedView] = useState<CalendarView | null>(null);
  const view = pickedView ?? (phone ? "agenda" : "week");
  const [payload, setPayload] = useState(initial);
  const [date, setDate] = useState(() => new Date());
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CalendarEventJson | null>(null);
  const [slot, setSlot] = useState<SlotMenu | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const range = useRef({ start: "", end: "" });
  const cache = useRef(new Map<string, CalendarPayload>());
  const filtersRef = useRef(filters);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const remember = (next: SavedPrefs) => {
    setDraft(next);
    window.localStorage.setItem(`vistrial.calendar.${memberId}`, JSON.stringify(next));
  };

  const refresh = useCallback(async (start: string, end: string) => {
    if (!start || !end) return;
    const key = cacheKey(start, end, filtersRef.current);
    const hit = cache.current.get(key);
    if (hit) {
      setPayload(hit);
      return;
    }
    setLoading(true);
    const result = await loadCalendarRange({ start, end, filters: filtersRef.current });
    setLoading(false);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    cache.current.set(key, result.data);
    if (cache.current.size > 12) {
      const oldest = cache.current.keys().next().value;
      if (oldest) cache.current.delete(oldest);
    }
    setPayload(result.data);
  }, []);

  useEffect(() => {
    if (!range.current.start) return;
    const handle = window.setTimeout(() => {
      void refresh(range.current.start, range.current.end);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [filters, refresh]);

  const events = useMemo<CalendarEvent<CalendarEventJson["data"]>[]>(
    () =>
      payload.events.map((event) => ({
        id: event.id,
        title: event.title,
        start: new Date(event.start),
        end: new Date(event.end),
        allDay: event.allDay,
        color: event.color,
        resourceId: event.resourceId ?? undefined,
        readOnly: true,
        data: event.data,
      })),
    [payload.events],
  );

  const onRangeChange = useCallback(
    (info: EventCalendarRangeInfo) => {
      const start = info.range.start.toISOString();
      const end = info.range.end.toISOString();
      if (range.current.start === start && range.current.end === end) return;
      range.current = { start, end };
      void refresh(start, end);
    },
    [refresh],
  );

  const openEvent = (event: CalendarEvent<CalendarEventJson["data"]>) => {
    const match = payload.events.find((item) => item.id === event.id) ?? null;
    setSelected(match);
    setSlot(null);
  };

  const openSlot = (info: EventCalendarSlotInfo) => {
    if (!payload.canCreateTask && !payload.canCreateHold) return;
    const start = info.date;
    const end = info.end ?? new Date(start.getTime() + (info.allDay ? 60 : 30) * 60_000);
    setSelected(null);
    setSlot({ start: start.toISOString(), end: end.toISOString(), resourceId: info.resourceId ?? filters.repId });
  };

  const dayCue = (day: Date) => payload.capacity.byDay[dayKey(day, payload.timeZone)]?.label ?? null;

  return (
    <div className="sales-calendar flex min-h-[70vh] flex-col gap-3 motion-reduce:[&_*]:transition-none in-data-[calm=true]:[&_*]:transition-none">
      <FilterBar
        payload={payload}
        filters={filters}
        onChange={(next) => {
          cache.current.clear();
          remember({ filters: next, weekStartsOn, weekends, nowIndicator });
        }}
      />
      <div className="flex flex-wrap gap-2" aria-label="Coverage">
        {Object.entries(payload.capacity.byDay)
          .filter(([, cell]) => cell.label)
          .slice(0, 10)
          .map(([key, cell]) => (
            <Badge key={key} variant="outline" size="sm">
              {key.slice(5)} {cell.label}
            </Badge>
          ))}
      </div>
      <div className={cn("min-h-0 flex-1 rounded-xl border border-border bg-card", loading && "opacity-80")}>
        <EventCalendar
          events={events}
          resources={payload.resources}
          view={view}
          onViewChange={(next) => setPickedView(next)}
          date={date}
          onDateChange={setDate}
          views={VIEWS}
          timeZone={payload.timeZone}
          weekStartsOn={weekStartsOn}
          dayStartHour={payload.dayStartHour}
          dayEndHour={payload.dayEndHour}
          interactions={READ_ONLY}
          viewSettings={{ weekends, nowIndicator }}
          showDayAddButton={payload.canCreateTask || payload.canCreateHold}
          scrollbars="native"
          loading={loading}
          onRangeChange={onRangeChange}
          onEventClick={(occurrence) => openEvent(occurrence.event)}
          onSlotClick={(info) => openSlot(info)}
          renderEvent={renderEvent}
          renderDayHeader={({ day, view: headerView }) => {
            if (headerView === "month") return undefined;
            const cue = dayCue(day);
            return (
              <span className="flex flex-col items-start gap-0.5">
                <span>{whenLabel(day, payload.timeZone).replace(/,.*/, "")}</span>
                {cue ? <span className="text-[10px] font-normal text-muted-foreground">{cue}</span> : null}
              </span>
            );
          }}
          renderMonthCell={({ day, isOutside, defaultContent }) => {
            const cue = !isOutside ? dayCue(day) : null;
            return (
              <>
                {defaultContent}
                {cue ? <span className="px-1 pb-1 text-[10px] text-muted-foreground">{cue}</span> : null}
              </>
            );
          }}
          renderResourceHeader={({ resource }) => {
            const cue = payload.capacity.byRep[resource.id]?.label;
            return (
              <span className="flex flex-col items-start">
                <span>{resource.title}</span>
                {cue ? <span className="text-[10px] font-normal text-muted-foreground">{cue}</span> : null}
              </span>
            );
          }}
          i18n={{
            labels: { addEvent: "Add", noEvents: "Nothing scheduled" },
            viewNames: { resource: "Team" },
          }}
          className="min-h-[32rem]"
        >
          <EventCalendarToolbar className="flex items-center gap-2 px-2 py-2">
            <EventCalendarNav />
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger className="ms-auto" render={<Button variant="ghost" size="sm" />}>
                Settings
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-3 p-3" align="end">
                <p className="text-sm font-medium">Calendar settings</p>
                <p className="text-xs text-muted-foreground">Times use {payload.timeZone}.</p>
                <label className="flex items-center justify-between gap-3 text-sm">
                  Week starts Monday
                  <Switch checked={weekStartsOn === 1} onCheckedChange={(on) => remember({ filters, weekStartsOn: on ? 1 : 0, weekends, nowIndicator })} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  Show weekends
                  <Switch checked={weekends} onCheckedChange={(on) => remember({ filters, weekStartsOn, weekends: on, nowIndicator })} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  Now indicator
                  <Switch checked={nowIndicator} onCheckedChange={(on) => remember({ filters, weekStartsOn, weekends, nowIndicator: on })} />
                </label>
                <p className="text-xs text-muted-foreground">
                  Working hours {payload.dayStartHour}:00 to {payload.dayEndHour}:00, from the workspace schedule.
                </p>
              </PopoverContent>
            </Popover>
          </EventCalendarToolbar>
          <EventCalendarContent />
        </EventCalendar>
      </div>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      <EventSheet event={selected} timeZone={payload.timeZone} phone={phone} onClose={() => setSelected(null)} />
      <SlotSheet
        slot={slot}
        phone={phone}
        canHold={payload.canCreateHold}
        onClose={() => setSlot(null)}
        onDone={(message) => {
          setNotice(message);
          cache.current.clear();
          void refresh(range.current.start, range.current.end);
        }}
      />
    </div>
  );
}

function renderEvent({ occurrence, view }: EventCalendarRenderEventProps<CalendarEventJson["data"]>) {
  const data = occurrence.event.data;
  if (!data) return undefined;
  const Icon = ICONS[data.kind];
  return (
    <span className="flex w-full min-w-0 items-center gap-1">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{occurrence.event.title}</span>
      <span className="sr-only">{data.kindLabel}</span>
      {data.overdue ? <span className="shrink-0 text-[10px]">Overdue</span> : null}
      {data.quietNote ? <span className={view === "agenda" ? "truncate text-[10px]" : "sr-only"}>{data.quietNote}</span> : null}
      {data.approvalNote ? <span className="sr-only">{data.approvalNote}</span> : null}
      {data.outcomeLabel ? <span className={view === "agenda" ? "shrink-0 text-[10px]" : "sr-only"}>{data.outcomeLabel}</span> : null}
    </span>
  );
}

function FilterBar({
  payload,
  filters,
  onChange,
}: {
  payload: CalendarPayload;
  filters: CalendarFilters;
  onChange: (next: CalendarFilters) => void;
}) {
  const toggleKind = (kind: CalendarKind) => {
    const kinds = filters.kinds.includes(kind) ? filters.kinds.filter((item) => item !== kind) : [...filters.kinds, kind];
    onChange({ ...filters, kinds });
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Kind">
        {KIND_OPTIONS.map((option) => {
          const on = filters.kinds.length === 0 || filters.kinds.includes(option.id);
          return (
            <Button key={option.id} size="sm" variant={on && filters.kinds.length > 0 ? "secondary" : "outline"} onClick={() => toggleKind(option.id)}>
              {option.label}
            </Button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-muted-foreground">
          Rep
          <select
            className="ms-2 rounded-md border border-border bg-transparent px-2 py-1 text-sm text-foreground"
            value={filters.repId ?? ""}
            disabled={!payload.canPickRep}
            onChange={(event) => onChange({ ...filters, repId: event.target.value || null })}
          >
            {payload.canPickRep ? <option value="">Everyone</option> : null}
            {payload.resources.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.title}
              </option>
            ))}
          </select>
        </label>
        <TextFilter label="Tier" value={filters.tiers[0] ?? ""} options={["hot", "warm", "cool", "cold"]} onChange={(tier) => onChange({ ...filters, tiers: tier ? [tier] : [] })} />
        <TextFilter
          label="Source"
          value={filters.sources[0] ?? ""}
          options={["calls", "approval", "sentry", "workflow", "person", "playbook", "booking"]}
          onChange={(source) => onChange({ ...filters, sources: source ? [source] : [] })}
        />
        <label className="text-xs text-muted-foreground">
          Stage
          <input
            className="ms-2 w-36 rounded-md border border-border bg-transparent px-2 py-1 text-sm text-foreground"
            value={filters.stages[0] ?? ""}
            onChange={(event) => onChange({ ...filters, stages: event.target.value.trim() ? [event.target.value.trim()] : [] })}
            aria-label="Stage"
          />
        </label>
      </div>
    </div>
  );
}

function TextFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <select
        className="ms-2 rounded-md border border-border bg-transparent px-2 py-1 text-sm text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function EventSheet({
  event,
  timeZone,
  phone,
  onClose,
}: {
  event: CalendarEventJson | null;
  timeZone: string;
  phone: boolean;
  onClose: () => void;
}) {
  const data = event?.data;
  const start = event ? new Date(event.start) : null;
  return (
    <Sheet open={Boolean(event)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetPopup side={phone ? "bottom" : "right"}>
        <SheetHeader>
          <SheetTitle>{event?.title}</SheetTitle>
          <SheetDescription>{data?.kindLabel}</SheetDescription>
        </SheetHeader>
        {data && start ? (
          <SheetPanel className="space-y-3 text-sm">
            <Row label="Kind" value={data.kindLabel} />
            {data.leadName ? <Row label="Lead" value={data.leadName} /> : null}
            {data.repName ? <Row label="Rep" value={data.repName} /> : null}
            {data.tier ? <Badge variant="outline">{data.tier}</Badge> : null}
            {data.outcomeLabel ? <Row label="Outcome" value={data.outcomeLabel} /> : null}
            {data.overdue ? <p>Overdue</p> : null}
            <Row label="Workspace time" value={whenLabel(start, timeZone)} />
            <Row label="Lead's time" value={whenLabel(start, data.leadTimeZone || timeZone)} />
            {data.quietNote ? <p>{data.quietNote}</p> : null}
            {data.approvalNote ? <p>{data.approvalNote}</p> : null}
            {data.past ? <p className="text-muted-foreground">This already happened.</p> : null}
            {data.href ? (
              <Button render={<Link href={data.href} />}>{data.kind === "draft" ? "Review draft" : "Open lead record"}</Button>
            ) : null}
          </SheetPanel>
        ) : null}
      </SheetPopup>
    </Sheet>
  );
}

function SlotSheet({
  slot,
  phone,
  canHold,
  onClose,
  onDone,
}: {
  slot: SlotMenu | null;
  phone: boolean;
  canHold: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (work: () => Promise<{ ok: boolean; error?: string }>, message: string) => {
    if (!slot) return;
    setPending(true);
    setError(null);
    const result = await work();
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save that.");
      return;
    }
    onClose();
    onDone(message);
  };
  return (
    <Sheet open={Boolean(slot)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetPopup side={phone ? "bottom" : "right"}>
        <SheetHeader>
          <SheetTitle>Add to this time</SheetTitle>
          <SheetDescription>A task or a hold. This does not book a call or send an invite.</SheetDescription>
        </SheetHeader>
        <SheetPanel className="space-y-2">
          {TASK_OPTIONS.map((option) => (
            <Button
              key={option.type}
              variant="outline"
              className="w-full justify-start"
              disabled={pending || !slot}
              onClick={() => slot && run(() => createCalendarTask({ type: option.type, dueAt: slot.start }), "Task added.")}
            >
              Add {option.label}
            </Button>
          ))}
          {canHold ? (
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={pending || !slot}
              onClick={() =>
                slot &&
                run(
                  () => createCalendarHold({ start: slot.start, end: slot.end, memberId: slot.resourceId }),
                  "Hold added.",
                )
              }
            >
              Add a team hold
            </Button>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-muted-foreground">{label}. </span>
      {value}
    </p>
  );
}
