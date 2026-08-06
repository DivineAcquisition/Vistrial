import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { TonePill } from "@/components/ui/tone";
import type { AttentionItem } from "@/lib/db/billing";

/**
 * Everything that needs a person, loudest first. A failed payment that goes
 * unnoticed for three weeks is a client who has quietly left, so an item gets
 * more prominent the longer it has been sitting here.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <Panel className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <TonePill tone="good">Nothing needs a person</TonePill>
          <span className="text-sm text-silver">
            Every client has a payment method that works and no charge is stuck.
          </span>
        </div>
      </Panel>
    );
  }

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const stale = (item.ageDays ?? 0) >= 3;

        return (
          <li key={item.id}>
            <Link
              href={item.href}
              className={`panel panel-hover block rounded-2xl border-l-2 px-5 py-4 ${
                item.severity === "critical"
                  ? "border-l-flag-critical"
                  : "border-l-flag-warning"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <TonePill tone={item.severity === "critical" ? "critical" : "warning"}>
                  {item.headline}
                </TonePill>
                <span className="text-sm font-medium text-white">{item.clientName}</span>
                {stale ? (
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      (item.ageDays ?? 0) >= 7 ? "text-flag-critical" : "text-flag-warning"
                    }`}
                  >
                    {item.ageDays} days
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-silver">{item.detail}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
