import { FileSpreadsheet } from "@/components/icons";
import { platform } from "@/lib/marketing/platforms";
import { cn } from "@/lib/utils";

/**
 * Connection keys used across the app (onboarding cards, Settings, Connections, the HighLevel pages) mapped to
 * the brand files in `public/brand/platforms`. One place, so every screen shows the same real mark.
 */
const PLATFORM_FOR: Record<string, string> = {
  meta: "meta",
  meta_ads: "meta",
  google_calendar: "google-calendar",
  "google-calendar": "google-calendar",
  calendly: "calendly",
  outlook: "outlook",
  highlevel: "gohighlevel",
  gohighlevel: "gohighlevel",
  leadconnector: "gohighlevel",
  hubspot: "hubspot",
  salesforce: "salesforce",
  airtable: "airtable",
  fathom: "fathom",
  fireflies: "fireflies",
  google_drive: "google-drive",
  "google-drive": "google-drive",
};

/** True when `id` has a brand mark, or is the results file (which has a file icon). */
export function hasConnectionLogo(id: string): boolean {
  return id === "results" || id in PLATFORM_FOR;
}

/**
 * The connection's logo on a small white tile, so each brand keeps its own colors in light and dark themes.
 * The results file has no brand, so it gets a file icon in the same tile. Decorative: the name is always
 * written next to it.
 */
export function ConnectionLogo({ id, size = 32, className }: { id: string; size?: number; className?: string }) {
  const entry = PLATFORM_FOR[id] ? platform(PLATFORM_FOR[id]) : undefined;
  if (!entry && id !== "results") return null;
  const inner = Math.round(size * 0.62);
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-white shadow-xs", className)}
      style={{ width: size, height: size }}
    >
      {entry ? (
        // Plain img: tiny static brand files; next/image does not optimize SVG.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.color} alt="" width={inner} height={inner} className="object-contain" />
      ) : (
        <FileSpreadsheet className="text-emerald-700" style={{ width: inner, height: inner }} />
      )}
    </span>
  );
}
