type LogoProps = {
  className?: string;
  /** Renders the crest on its own, without the wordmark. */
  markOnly?: boolean;
  /** Unused for the raster lockup; kept so existing call sites type-check. */
  tone?: "silver" | "current";
  title?: string;
};

/**
 * Official Vistrial lockup. The crest is the provided mark, drawn as a
 * silver-metal SVG so it stays sharp at any size. The horizontal lockup
 * remains the uploaded PNG.
 */
export default function Logo({
  className,
  markOnly = false,
  title = "Vistrial",
}: LogoProps) {
  return (
    // Native img so we display the file as-is (no next/image optimization
    // that could resample the artwork).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={markOnly ? "/brand/vistrial-crest.svg" : "/brand/vistrial-lockup.png"}
      alt={title}
      width={markOnly ? 620 : 460}
      height={markOnly ? 833 : 132}
      className={className}
      aria-hidden={title ? undefined : true}
    />
  );
}
