import Logo from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";

function CornerMark({
  side,
}: {
  side: "start" | "end";
}) {
  const position = side === "start" ? "-left-3 -top-3" : "-right-3 -bottom-3";
  return (
    <span aria-hidden className={`pointer-events-none absolute ${position} size-6`}>
      <span className="absolute top-3 left-0 h-px w-6 bg-white/35" />
      <span className="absolute top-0 left-3 h-6 w-px bg-white/35" />
    </span>
  );
}

/**
 * The frame every unauthenticated surface sits in. One dark plate, the official
 * crest, then the form — built to read like a product login, not a marketing
 * hero.
 */
export function AuthCard({
  title,
  subtitle,
  eyebrowLabel,
  width = "narrow",
  children,
}: {
  title: string;
  subtitle?: string;
  /** Small line above the title. Used on invite and no-access, not on login. */
  eyebrowLabel?: string;
  width?: "narrow" | "wide";
  children?: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-[#111113] text-white antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_50%_at_50%_0%,rgba(154,136,252,0.12),transparent_58%)]"
      />

      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-16 sm:px-6">
        <div className={`relative w-full ${width === "wide" ? "max-w-xl" : "max-w-[400px]"}`}>
          <CornerMark side="start" />
          <CornerMark side="end" />

          <div className="auth-panel rounded-xl px-7 py-8 sm:px-8 sm:py-9">
            <Logo markOnly className="h-10 w-auto" />

            <div className="mt-6">
              {eyebrowLabel ? (
                <p className="mb-2 text-[11px] font-medium tracking-[0.16em] text-white/45 uppercase">
                  {eyebrowLabel}
                </p>
              ) : null}
              <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight text-white sm:text-[1.75rem]">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-2 text-sm leading-relaxed text-white/45">{subtitle}</p>
              ) : null}
            </div>

            {children ? <div className="mt-7">{children}</div> : null}
          </div>
        </div>

        <p className="mt-8 text-[11px] text-white/35">
          {APP_NAME} is invite only
        </p>
      </main>
    </div>
  );
}
