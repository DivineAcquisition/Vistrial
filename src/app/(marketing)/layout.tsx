import { ConsentShell } from "@/components/marketing/consent-shell";
import { PublicTrackers } from "@/components/marketing/public-trackers";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicTrackers />
      {children}
      <ConsentShell />
      <noscript>
        <p className="px-4 py-3 text-sm text-silver">Optional analytics and advertising stay off when JavaScript is disabled.</p>
      </noscript>
    </div>
  );
}
