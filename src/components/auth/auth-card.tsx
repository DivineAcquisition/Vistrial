import Logo from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";

/**
 * Quiet auth shell shared by login, invite, and no-access.
 * Small official crest, no gallery backdrop.
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
      <main className="auth-stage-frame">
        <div className={`auth-desk-inner ${width === "wide" ? "auth-desk-inner--wide" : ""}`}>
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
