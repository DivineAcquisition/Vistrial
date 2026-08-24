import Logo from "@/components/brand/logo";
import { Backdrop } from "@/components/ui/backdrop";
import { APP_NAME, APP_OWNER } from "@/lib/constants";
import { eyebrow } from "@/lib/ui";

/**
 * The single card every unauthenticated surface sits in — sign in, password
 * reset, invitation, onboarding, two-factor. The official metallic crest leads,
 * then a lit panel, so the first screen of the product feels like the brand
 * rather than a generic login box.
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
  /** Small pill above the title. Omitted when unset so the crest can lead. */
  eyebrowLabel?: string;
  width?: "narrow" | "wide";
  children?: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-ink-950 text-white antialiased">
      <Backdrop />

      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-16 sm:px-6">
        <div className="animate-rise flex flex-col items-center">
          <div className="relative flex h-36 w-28 items-center justify-center">
            <div
              aria-hidden
              className="absolute left-1/2 top-[48%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/25 blur-3xl"
            />
            <Logo
              markOnly
              className="relative h-32 w-auto drop-shadow-[0_12px_28px_rgba(255,255,255,0.12)]"
            />
          </div>
          <p className="mt-6 text-[12px] font-semibold tracking-[0.38em] text-white">
            VISTRIAL
          </p>
        </div>

        <div
          className={`auth-panel animate-rise delay-1 relative mt-10 w-full overflow-hidden rounded-[1.75rem] px-7 py-8 sm:px-9 sm:py-9 ${
            width === "wide" ? "max-w-xl" : "max-w-[420px]"
          }`}
        >
          <Logo
            markOnly
            title=""
            className="pointer-events-none absolute -right-6 -top-8 h-52 w-auto select-none opacity-[0.07]"
          />

          <div className="relative text-center">
            {eyebrowLabel ? <p className={eyebrow}>{eyebrowLabel}</p> : null}
            <h1
              className={`text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem] ${
                eyebrowLabel ? "mt-4" : ""
              }`}
            >
              {title}
            </h1>
            {subtitle ? (
              <p className="mx-auto mt-2.5 max-w-[36ch] text-sm leading-relaxed text-silver">
                {subtitle}
              </p>
            ) : null}
          </div>

          {children ? <div className="relative mt-7">{children}</div> : null}
        </div>

        <p className="animate-fade delay-2 mt-8 text-[11px] tracking-wide text-dim">
          {APP_NAME} · {APP_OWNER}
        </p>
      </main>
    </div>
  );
}
