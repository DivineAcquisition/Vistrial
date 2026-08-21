type LogoProps = {
  className?: string;
  /** Renders the crest on its own, without the wordmark. */
  markOnly?: boolean;
  /** Unused for the raster lockup; kept so existing call sites type-check. */
  tone?: "silver" | "current";
  title?: string;
};

/**
 * Official Vistrial lockup. This is the uploaded PNG, not a redraw.
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
      src={markOnly ? "/brand/vistrial-mark.png" : "/brand/vistrial-lockup.png"}
      alt={title}
      className={className}
    />
  );
}
