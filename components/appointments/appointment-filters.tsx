import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { APPOINTMENT_STATUSES, STATUS_LABELS } from "@/lib/appointments/status";
import {
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";

export type AppointmentFilterValues = {
  client: string;
  status: string;
  from: string;
  to: string;
  version: string;
};

/** A plain GET form, so a filtered view is a link an admin can keep. */
export function AppointmentFilters({
  clients,
  versions,
  values,
}: {
  clients: { id: string; name: string }[];
  versions: number[];
  values: AppointmentFilterValues;
}) {
  return (
    <Panel className="mb-6 px-5 py-4">
      <form method="get" action="/appointments" className="flex flex-wrap items-end gap-4">
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
            {APPOINTMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-32">
          <label className={labelClass} htmlFor="version">
            Definition
          </label>
          <select
            id="version"
            name="version"
            defaultValue={values.version}
            className={selectClass}
          >
            <option value="">Any version</option>
            {versions.map((version) => (
              <option key={version} value={String(version)}>
                v{version}
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

        <div className="ml-auto flex items-center gap-2 pb-1">
          <Link href="/appointments" className={`${btnSecondary} ${btnSizeSm}`}>
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
