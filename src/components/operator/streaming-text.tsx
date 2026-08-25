import { cn } from "@/lib/utils";

/** Token-by-token text that grows downward in a reserved block instead of shoving the layout. */
export function StreamingText({
  text,
  done = false,
  className,
}: {
  text: string;
  done?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-rows-[1fr]", className)}>
      <p className="min-h-[4.5rem] whitespace-pre-wrap break-words text-sm leading-6 text-silver">
        {text}
        {done ? null : (
          <span
            className="ml-0.5 inline-block h-[1em] w-[0.45ch] animate-pulse bg-brand-300 align-[-0.15em]"
            aria-hidden
          />
        )}
      </p>
    </div>
  );
}
