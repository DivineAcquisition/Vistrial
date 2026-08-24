import Logo from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";

function CornerMark({
  side,
}: {
  side: "start" | "end";
}) {
  const position = side === "start" ? "-left-3.5 -top-3.5" : "-right-3.5 -bottom-3.5";
  return (
    <span aria-hidden className={`pointer-events-none absolute ${position} size-7`}>
      <span className="absolute top-[13px] left-0 h-px w-7 bg-white/32" />
      <span className="absolute top-0 left-[13px] h-7 w-px bg-white/32" />
    </span>
  );
}

/**
 * The frame every unauthenticated surface sits in. The uploaded crest file
 * sits at the top of the plate as the file itself — black square, silver mark.
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
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_42%_at_50%_0%,rgba(154,136,252,0.1),transparent_55%)]"
      />

      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-16 sm:px-6">
        <div className={`relative w-full ${width === "wide" ? "max-w-xl" : "max-w-[400px]"}`}>
          <CornerMark side="start" />
          <CornerMark side="end" />

          <div className="auth-panel overflow-hidden">
            <div className="bg-black">
              <Logo markOnly className="block h-auto w-full" />
            </div>

            <div className="px-7 pt-6 pb-7 sm:px-8 sm:pt-7 sm:pb-8">
              <div className="text-center">
                {eyebrowLabel ? (
                  <p className="mb-2 text-[11px] font-medium tracking-[0.16em] text-white/45 uppercase">
                    {eyebrowLabel}
                  </p>
                ) : null}
                <h1 className="text-[1.85rem] leading-[1.15] font-semibold tracking-tight text-white">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-2 text-[13.5px] leading-relaxed text-white/42">{subtitle}</p>
                ) : null}
              </div>

              {children ? <div className="mt-7">{children}</div> : null}

              <p className="mt-8 text-center text-[13px] text-white/38">
                {APP_NAME} is invite only
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
