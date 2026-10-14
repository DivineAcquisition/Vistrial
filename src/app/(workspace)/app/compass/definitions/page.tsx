import type { Metadata } from "next";
import Link from "next/link";

import { PageFrame } from "@/components/app/page-frame";
import { METRICS, SHARES } from "@/lib/metrics/definitions";
import { captionText } from "@/lib/ui";

export const metadata: Metadata = { title: "How Compass counts" };

/**
 * The definitions behind every number Compass gives. They are the same ones
 * Home and Results use, read from the one list, so an answer and a page can
 * never count the same thing two ways.
 */
export default function CompassDefinitionsPage() {
  const metrics = Object.values(METRICS);
  const shares = Object.values(SHARES);
  return (
    <PageFrame
      title="How Compass counts"
      description="Compass uses the same definitions as Home and Results. When an answer gives a number, this is what it counted."
    >
      <section className="flex flex-col gap-3" aria-labelledby="shares-heading">
        <h2 id="shares-heading" className="font-heading text-base text-card-foreground">
          Rates
        </h2>
        <dl className="flex flex-col gap-3">
          {shares.map((share) => (
            <div key={share.id} id={share.id} className="scroll-mt-24 rounded-lg border border-border px-4 py-3">
              <dt className="font-medium text-card-foreground">{share.label}</dt>
              <dd className="text-sm text-muted-foreground">{share.explain}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="mt-8 flex flex-col gap-3" aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="font-heading text-base text-card-foreground">
          Numbers
        </h2>
        <dl className="flex flex-col gap-3">
          {metrics.map((metric) => (
            <div key={metric.id} id={metric.id} className="scroll-mt-24 rounded-lg border border-border px-4 py-3">
              <dt className="font-medium text-card-foreground">{metric.label}</dt>
              <dd className="text-sm text-muted-foreground">{metric.explain}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className={`${captionText} mt-8`}>
        When fewer than 10 leads sit behind a rate, Compass says so, because a rate from a handful of leads can swing a long way.{" "}
        <Link href="/app/compass" className="underline">
          Back to Compass
        </Link>
      </p>
    </PageFrame>
  );
}
