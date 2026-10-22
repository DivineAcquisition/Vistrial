export default function CalendarLoading() {
  return (
    <div aria-busy="true" className="space-y-3">
      <span className="sr-only">Loading the calendar.</span>
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="h-[32rem] rounded-xl border border-border bg-muted/40" />
    </div>
  );
}
