import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import {
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";
import type { LeadSource } from "@/types/database";

const SOURCES: LeadSource[] = ["Paid", "Direct", "Referral", "Organic", "Other"];

export type LeadFilterValues = {
  client: string;
  source: string;
  from: string;
  to: string;
  awaiting: boolean;
};

/**
 * A plain GET form: filters live in the URL, so a filtered view is a link an
 * admin can keep.
 */
export function LeadFilters({
  clients,
  values,
}: {
  clients: { id: string; name: string }[];
  values: LeadFilterValues;
}) {
  return (
    <Panel className="mb-6 px-5 py-4">
      <form
        method="get"
        action="/leads"
        className="flex flex-wrap items-end gap-4"
      >
        <div className="min-w-44 flex-1">
          <label className={labelClass} htmlFor="client">
            Client
          </label>
          <select
            id="client"
            name="client"
            defaultValue={values.client}
            className={selectClass}
          >
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-36 flex-1">
          <label className={labelClass} htmlFor="source">
            Source
          </label>
          <select
            id="source"
            name="source"
            defaultValue={values.source}
            className={selectClass}
          >
            <option value="">All sources</option>
            {SOURCES.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="from">
            From
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={values.from}
            className={`${inputClass} [color-scheme:dark]`}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="to">
            To
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={values.to}
            className={`${inputClass} [color-scheme:dark]`}
          />
        </div>

        <label className="flex items-center gap-2 pb-2.5 text-sm text-silver">
          <input
            type="checkbox"
            name="awaiting"
            value="1"
            defaultChecked={values.awaiting}
            className="size-4 accent-brand-500"
          />
          Awaiting a human touch
        </label>

        <div className="ml-auto flex items-center gap-2 pb-1">
          <Link href="/leads" className={`${btnSecondary} ${btnSizeSm}`}>
            Clear
          </Link>
          <button type="submit" className={`${btnPrimary} ${btnSizeSm}`}>
            Apply
          </button>
        </div>
      </form>
    </Panel>
  );
}
