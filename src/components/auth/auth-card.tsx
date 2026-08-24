import Logo from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";

function StageTick({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  return (
    <span aria-hidden className={`auth-tick auth-tick--${corner}`}>
      <i />
      <i />
    </span>
  );
}

/**
 * Full-viewport auth stage: a lit gallery for the official crest, and a quiet
 * desk for the form. Shared by login, invite, and no-access.
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
  /** Small line above the title. Used on invite and no-access, not required on login. */
  eyebrowLabel?: string;
  width?: "narrow" | "wide";
  children?: React.ReactNode;
}) {
  return (
    <div className="auth-stage">
      <div className="auth-stage-atmosphere" aria-hidden />
      <div className="auth-stage-grain" aria-hidden />
      <div className="auth-stage-vignette" aria-hidden />

      <StageTick corner="tl" />
      <StageTick corner="tr" />
      <StageTick corner="bl" />
      <StageTick corner="br" />

      <main className="auth-stage-frame">
        <section className="auth-gallery" aria-label={`${APP_NAME} mark`}>
          <div className="auth-gallery-figure">
            <div className="auth-gallery-glow" aria-hidden />
            <div className="auth-gallery-rings" aria-hidden>
              <span className="auth-ring auth-ring-a" />
              <span className="auth-ring auth-ring-b" />
              <span className="auth-ring auth-ring-c" />
            </div>
            <Logo markOnly title="" className="auth-gallery-crest" />
          </div>

          <p className="auth-gallery-name">{APP_NAME}</p>
          <p className="auth-gallery-line">Case files for high-ticket sales teams.</p>
          <span className="auth-gallery-rule" aria-hidden />
          <p className="auth-gallery-invite">Invite only</p>
        </section>

        <div className="auth-split" aria-hidden />

        <section className="auth-desk">
          <div className={`auth-desk-inner ${width === "wide" ? "auth-desk-inner--wide" : ""}`}>
            {eyebrowLabel ? <p className="auth-eyebrow">{eyebrowLabel}</p> : null}
            <h1 className="auth-title">{title}</h1>
            {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
            {children ? <div className="auth-desk-body">{children}</div> : null}
            <p className="auth-desk-foot">
              {APP_NAME} is invite only
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
