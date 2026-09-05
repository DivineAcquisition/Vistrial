import LoaderOneDemo from "@/components/loader-one-demo";

/** Full-card wait on login and invite. Too large for a button; those keep the spinner. */
export function AuthLoader({ label = "Working" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-5">
      <LoaderOneDemo />
      <span role="status" className="text-sm text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
