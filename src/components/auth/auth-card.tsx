import Logo from "@/components/brand/logo";
import { Particles } from "@/components/ui/particles";
import { ShineBorder } from "@/components/ui/shine-border";
import { APP_NAME } from "@/lib/constants";

/**
 * Quiet auth shell shared by login, invite, and no-access.
 * Brand wash and particles sit behind a rounded desk with a moving shine edge.
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
      <div className="auth-stage-atmosphere" aria-hidden>
        <Particles className="absolute inset-0" quantity={56} color="#9A88FC" ease={70} size={0.45} />
        <div className="auth-stage-glow" />
        <div className="auth-stage-glow-aux" />
        <div className="auth-stage-grid" />
      </div>
      <main className="auth-stage-frame">
        <div className={`auth-desk-inner animate-rise ${width === "wide" ? "auth-desk-inner--wide" : ""}`}>
          <ShineBorder
            borderWidth={1}
            duration={14}
            shineColor={["#9A88FC", "#C3B6FE", "#7C63FA"]}
          />
          <Logo markOnly title="" className="auth-mark" />
          {eyebrowLabel ? <p className="auth-eyebrow">{eyebrowLabel}</p> : null}
          <h1 className="auth-title">{title}</h1>
          {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
          {children ? <div className="auth-desk-body">{children}</div> : null}
          <p className="auth-desk-foot">{APP_NAME} is invite only</p>
        </div>
      </main>
    </div>
  );
}
