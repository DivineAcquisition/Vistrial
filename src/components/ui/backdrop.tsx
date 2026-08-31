/**
 * Ambient page background from the DA hiring site: a fine brand-tinted grid
 * that fades out below the fold, a spotlight behind the top of the page, and
 * two slow-drifting orbs. Purely decorative — it sits behind everything at
 * z-0, ignores pointer events, and never carries meaning.
 */
export function Backdrop({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden ${className}`}
    >
      <div
        className="absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(154,136,252,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(154,136,252,0.9) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage:
            "radial-gradient(ellipse 90% 60% at 50% 0%, #000 25%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 60% at 50% 0%, #000 25%, transparent 78%)",
        }}
      />

      <div
        className="absolute -top-[38%] left-1/2 h-[820px] w-[1500px] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(154,136,252,0.30) 0%, rgba(102,80,216,0.16) 38%, transparent 72%)",
          filter: "blur(90px)",
        }}
      />

      <div
        className="animate-drift absolute -right-40 top-[52%] h-[560px] w-[560px] rounded-full opacity-70"
        style={{
          background:
            "radial-gradient(circle, rgba(154,136,252,0.20) 0%, transparent 68%)",
          filter: "blur(80px)",
        }}
      />

      <div
        className="animate-drift-lag absolute -left-52 top-[28%] h-[520px] w-[520px] rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgba(102,80,216,0.20) 0%, transparent 68%)",
          filter: "blur(80px)",
        }}
      />

      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
    </div>
  );
}
