import Link from "next/link";

import { CHARGE_STATUS_LABELS } from "@/components/billing/types";
import { Panel } from "@/components/ui/panel";
import {
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";
import type { ChargeStatus } from "@/types/database";

const STATUSES: ChargeStatus[] = [
  "draft",
  "notified",
  "processing",
  "paid",
  "failed",
  "credited",
];

export type ChargeFilterValues = {
  client: string;
  status: string;
  from: string;
  to: string;
};

export function ChargeFilters({
  clients,
  values,
}: {
  clients: { id: string; name: string }[];
  values: ChargeFilterValues;
}) {
  return (
    <Panel className="mb-6 px-5 py-4">
      <form method="get" action="/billing" className="flex flex-wrap items-end gap-4">
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
          <label className={labelClass} htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={values.status}
            className={selectClass}
          >
            <option value="">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {CHARGE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="from">
            Period from
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
            Period to
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={values.to}
            className={`${inputClass} [color-scheme:dark]`}
          />
        </div>

        <div className="ml-auto flex items-center gap-2 pb-1">
          <Link href="/billing" className={`${btnSecondary} ${btnSizeSm}`}>
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
