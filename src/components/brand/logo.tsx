type LogoProps = {
  className?: string;
  /** Renders the crest on its own, without the wordmark. */
  markOnly?: boolean;
  title?: string;
};

/**
 * Official Vistrial artwork. The app is dark everywhere, so the silver
 * crest / lockup is the only mark.
 */
export default function Logo({ className, markOnly = false, title = "Vistrial" }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={markOnly ? "/brand/vistrial-crest.png" : "/brand/vistrial-lockup.png"}
      alt={title}
      width={markOnly ? 1080 : 460}
      height={markOnly ? 1080 : 132}
      className={className}
      aria-hidden={title ? undefined : true}
    />
  );
}
