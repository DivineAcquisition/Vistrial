import Logo from "@/components/brand/logo";
import { Backdrop } from "@/components/ui/backdrop";
import { APP_NAME, APP_OWNER } from "@/lib/constants";
import { eyebrow } from "@/lib/ui";

/**
 * The single card every unauthenticated surface sits in — sign in, password
 * reset, invitation, onboarding, two-factor. Same backdrop, lockup, and panel
 * as the hiring site's hero, so the first screen of the product looks like the
 * page that brought people here.
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
  /** Small pill above the title; defaults to the workspace name. */
  eyebrowLabel?: string;
  width?: "narrow" | "wide";
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-ink-950 text-white antialiased">
      <Backdrop />

      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-12 sm:px-6">
        <Logo className="animate-rise h-7 w-auto" />

        <div
          className={`panel animate-rise delay-1 mt-8 w-full rounded-3xl px-6 py-8 sm:px-8 ${
            width === "wide" ? "max-w-xl" : "max-w-[400px]"
          }`}
        >
          <div className="text-center">
            <p className={eyebrow}>{eyebrowLabel ?? APP_OWNER}</p>
            <h1 className="mt-4 text-xl font-semibold text-white sm:text-2xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm leading-relaxed text-silver">
                {subtitle}
              </p>
            ) : null}
          </div>

          <div className="mt-6">{children}</div>
        </div>

        <p className="animate-fade delay-2 mt-8 text-xs text-dim">
          {APP_NAME} · {APP_OWNER}
        </p>
      </main>
    </div>
  );
}
