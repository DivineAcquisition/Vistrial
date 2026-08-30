import { marketingBtnPrimary } from "@/lib/marketing/ui";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { CRM } from "@/lib/marketing/copy";
import { ghlMarketplaceListingUrl } from "@/lib/marketing/config";
import { helperClass } from "@/lib/ui";

/**
 * The connect surface operators actually see — not a stock collage, and not a
 * screenshot of someone else's CRM account.
 */
export function GhlConnectVisual() {
  const listingUrl = ghlMarketplaceListingUrl();

  const visual = (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-sm text-white">Connect LeadConnector</h3>
            <p className={helperClass}>
              Your conversations, your calendar, your pipeline stay where they are.
            </p>
          </div>
          <StatusBadge label="Not connected" tone="neutral" />
        </div>
        <ul className="mt-5 list-disc space-y-1.5 pl-5 text-sm text-silver">
          <li>Lead volume, sources, and how far history goes are read, not asked.</li>
          <li>Real speed to lead is measured from the CRM, not assumed.</li>
          <li>Message bodies are never pulled. Only metadata: who, when, which channel.</li>
        </ul>
        <div className="mt-6">
          <span className={marketingBtnPrimary} aria-hidden>Connect LeadConnector</span>
        </div>
      </Panel>

      <Panel className="p-4">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-300 uppercase">
          Choose a location
        </p>
        <p className="mt-2 text-sm text-silver">
          LeadConnector opens the location picker. One click. The workspace is live on that location.
        </p>
        <ul className="mt-5 space-y-2">
          <li className="rounded-lg border border-brand-500/30 bg-brand-500/[0.08] px-4 py-3">
            <p className="text-sm font-medium text-white">Your agency · Main location</p>
            <p className="mt-1 text-xs text-dim">Illustration — not a client account.</p>
          </li>
          <li className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3">
            <p className="text-sm text-silver">A second location, if you have one</p>
          </li>
        </ul>
        <div className="mt-5 flex items-center gap-2">
          <StatusBadge label="Connected" tone="good" />
          <span className="text-xs text-dim">Nothing to migrate.</span>
        </div>
      </Panel>
    </div>
  );

  if (!listingUrl) return visual;

  return (
    <figure>
      {visual}
      <figcaption className="mt-4 text-sm text-silver">
        <a
          href={listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-300 underline-offset-4 hover:text-white hover:underline"
        >
          {CRM.listingLive}
        </a>
      </figcaption>
    </figure>
  );
}
