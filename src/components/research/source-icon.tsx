import { FileSpreadsheet, Globe, Paperclip } from "@/components/icons";

import { PlatformLogo } from "@/components/marketing/platform-logo";
import { cn } from "@/lib/utils";

/** Research platforms drawn with the platform's own logo from `public/brand/platforms`. */
const LOGO: Record<string, string> = {
  youtube: "youtube",
  tiktok: "tiktok",
  instagram: "instagram",
  // Meta has no separate Ad Library mark; Meta's brand rules say to use the Meta logo.
  metaAdLibrary: "meta",
  meta: "meta",
};

/**
 * The icon for a research source: the real YouTube, TikTok, Instagram and Meta logos, a globe for the open
 * web, and plain icons for the business's own data and files. Decorative: the name is always written beside it.
 */
export function SourceIcon({ platform, size = 14, className }: { platform: string; size?: number; className?: string }) {
  const logo = LOGO[platform];
  if (logo) return <PlatformLogo id={logo} size={size} decorative className={className} />;
  const Icon = platform === "customerData" ? FileSpreadsheet : platform === "upload" ? Paperclip : Globe;
  return <Icon aria-hidden className={cn("shrink-0", className)} style={{ width: size, height: size }} />;
}
