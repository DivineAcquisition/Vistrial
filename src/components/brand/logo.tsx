type LogoProps = {
  className?: string;
  /** Renders the crest on its own, without the wordmark. */
  markOnly?: boolean;
  /** `on-light` is the black mark for the white operator app. */
  tone?: "silver" | "current" | "on-light";
  title?: string;
};

/**
 * Official Vistrial artwork.
 * Dark surfaces use the silver crest / lockup.
 * The operator app, portal, and auth desk use the black mark on white.
 */
export default function Logo({
  className,
  markOnly = false,
  tone = "silver",
  title = "Vistrial",
}: LogoProps) {
  const onLight = tone === "on-light";
  const src = onLight
    ? "/brand/vistrial-black-logo.png"
    : markOnly
      ? "/brand/vistrial-crest.png"
      : "/brand/vistrial-lockup.png";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title}
      width={onLight || markOnly ? 1080 : 460}
      height={onLight || markOnly ? 1080 : 132}
      className={className}
      aria-hidden={title ? undefined : true}
    />
  );
}
