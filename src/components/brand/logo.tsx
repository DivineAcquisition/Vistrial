type LogoProps = {
  className?: string;
  /** Renders the crest on its own, without the wordmark. */
  markOnly?: boolean;
  /** Unused for the raster lockup; kept so existing call sites type-check. */
  tone?: "silver" | "current";
  title?: string;
};

/**
 * Official Vistrial artwork. The crest is the uploaded metallic PNG, shown
 * as-is through a native img — no next/image resampling, no traced SVG.
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
      width={markOnly ? 1667 : 460}
      height={markOnly ? 1667 : 132}
      className={className}
      aria-hidden={title ? undefined : true}
    />
  );
}
