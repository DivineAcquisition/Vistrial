type LogoProps = {
  className?: string;
  /** Renders the crest on its own, without the wordmark. */
  markOnly?: boolean;
  /** Unused for the raster lockup; kept so existing call sites type-check. */
  tone?: "silver" | "current";
  title?: string;
};

/**
 * Official Vistrial artwork. The crest is the provided metallic PNG.
 * Native img so the file is shown as-is — no next/image resampling.
 */
export default function Logo({
  className,
  markOnly = false,
  title = "Vistrial",
}: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={markOnly ? "/brand/vistrial-crest.png" : "/brand/vistrial-lockup.png"}
      alt={title}
      width={markOnly ? 999 : 460}
      height={markOnly ? 1350 : 132}
      className={className}
      aria-hidden={title ? undefined : true}
    />
  );
}
