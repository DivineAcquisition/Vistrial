import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Renders the crest on its own, without the wordmark. */
  markOnly?: boolean;
  title?: string;
};

const ART = {
  crest: { silver: "/brand/vistrial-crest.png", ink: "/brand/vistrial-crest-ink.png", width: 1080, height: 1080 },
  lockup: { silver: "/brand/vistrial-lockup.png", ink: "/brand/vistrial-lockup-ink.png", width: 460, height: 132 },
} as const;

/**
 * Official Vistrial artwork: the ink mark on the white workspace, the silver
 * mark wherever the dark theme is on. Both are in the page and the theme picks
 * one, so switching themes never waits on an image.
 */
export default function Logo({ className, markOnly = false, title = "Vistrial" }: LogoProps) {
  const art = markOnly ? ART.crest : ART.lockup;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art.ink}
        alt={title}
        width={art.width}
        height={art.height}
        className={cn(className, "dark:hidden!")}
        aria-hidden={title ? undefined : true}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art.silver}
        alt={title}
        width={art.width}
        height={art.height}
        className={cn(className, "not-dark:hidden!")}
        aria-hidden={title ? undefined : true}
      />
    </>
  );
}
