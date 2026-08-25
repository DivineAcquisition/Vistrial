"use client";

import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { SETTINGS_SECTIONS } from "@/lib/settings/constants";
import { helperClass, labelClass } from "@/lib/ui";
import type { Json } from "@/types/database";

export function ActivityLog({
  rows,
  members,
  section,
  person,
}: {
  rows: Array<{
    id: string;
    created_at: string;
    actor_label: string;
    actor_kind: string;
    section: string;
    action: string;
    from_value: Json | null;
    to_value: Json | null;
    actor_member_id: string | null;
  }>;
  members: Array<{ id: string; display_name: string }>;
  section: string;
  person: string;
}) {
  const router = useRouter();

  function apply(nextSection: string, nextPerson: string) {
    const params = new URLSearchParams();
    if (nextSection) params.set("section", nextSection);
    if (nextPerson) params.set("person", nextPerson);
    const query = params.toString();
    router.push(query ? `/app/settings/advanced/activity?${query}` : "/app/settings/advanced/activity");
  }

  return (
    <div className="space-y-6">
      <p className={helperClass}>This log cannot be edited. It answers why the queue looks different this week.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="activity-section">
            Section
          </label>
          <Select
            id="activity-section"
            value={section}
            onChange={(event) => apply(event.target.value, person)}
          >
            <option value="">All sections</option>
            {SETTINGS_SECTIONS.map((item) => (
              <option key={item} value={item}>
                {item.replace("_", " ")}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className={labelClass} htmlFor="activity-person">
            Person
          </label>
          <Select
            id="activity-person"
            value={person}
            onChange={(event) => apply(section, event.target.value)}
          >
            <option value="">Anyone</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <DataTable
        columns={[
          { key: "when", label: "When" },
          { key: "who", label: "Who" },
          { key: "section", label: "Section" },
          { key: "what", label: "What" },
        ]}
        empty="No configuration changes recorded yet."
        rows={rows.map((row) => ({
          when: new Date(row.created_at).toLocaleString(),
          who: `${row.actor_label}${row.actor_kind === "da_operator" ? "" : ""}`,
          section: row.section.replace("_", " "),
          what: describeChange(row.action, row.from_value, row.to_value),
        }))}
      />
    </div>
  );
}

function describeChange(action: string, from: Json | null, to: Json | null): string {
  if (!from && !to) return action;
  try {
    const fromText = from ? JSON.stringify(from) : "—";
    const toText = to ? JSON.stringify(to) : "—";
    if (fromText === toText) return action;
    return `${action}. ${fromText} → ${toText}`;
  } catch {
    return action;
  }
}
