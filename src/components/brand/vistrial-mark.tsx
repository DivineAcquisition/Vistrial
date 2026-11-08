import Logo from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const SIZE = { sm: "size-8 p-1", md: "size-11 p-1.5", xs: "size-5 p-0.5" } as const;

/** Vistrial speaking: the crest in a round tile, used wherever an agent talks or acts. */
export function VistrialMark({ size = "sm", className, title = "" }: { size?: keyof typeof SIZE; className?: string; title?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-card ring-1 ring-border shadow-sm", SIZE[size], className)}>
      <Logo markOnly title={title} className="size-full object-contain" />
    </span>
  );
}
