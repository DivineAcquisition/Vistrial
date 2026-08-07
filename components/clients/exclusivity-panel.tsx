"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addTerritoryAction,
  deleteTerritoryAction,
  overrideConflictAction,
  saveClientCategoriesAction,
} from "@/lib/actions/territory";
import type { ClientConflict } from "@/lib/territory/conflict";
import {
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  helperClass,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";
import type {
  ExclusivityOverride,
  ExclusivityStatus,
  ServiceCategory,
  Territory,
} from "@/types/database";

export function ExclusivityPanel({
  clientId,
  exclusivityStatus,
  categories,
  selectedCategoryIds,
  territories,
  overrides,
  peersSharingCategory,
  definitionServiceArea,
}: {
  clientId: string;
  exclusivityStatus: ExclusivityStatus;
  categories: ServiceCategory[];
  selectedCategoryIds: string[];
  territories: Territory[];
  overrides: ExclusivityOverride[];
  peersSharingCategory: number;
  /** Appointment-definition service area — stored separately, shown for contrast. */
  definitionServiceArea: string | null;
}) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>(selectedCategoryIds);
  const [status, setStatus] = useState<ExclusivityStatus>(exclusivityStatus);
  const [conflicts, setConflicts] = useState<ClientConflict[]>([]);
  const [overrideReason, setOverrideReason] = useState("");

  const activeCategories = useMemo(
    () => categories.filter((category) => category.active || selected.includes(category.id)),
    [categories, selected]
  );

  return (
    <div className="space-y-10">
      {overrides.length > 0 ? (
        <div className="rounded-2xl border border-flag-warning/40 bg-flag-warning/10 px-5 py-4">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-flag-warning uppercase">
            Exclusivity overridden
          </p>
          <p className="mt-2 text-sm text-silver">
            Divine Acquisition has consciously not promised exclusivity against
            at least one other client. Everyone touching this account should know.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-silver">
            {overrides.map((override) => (
              <li key={override.id}>
                <span className="text-white">{override.overlap_summary}</span>
                <span className="block text-xs text-dim">
                  Reason: {override.reason}
                  {override.overridden_by_label
                    ? ` · ${override.overridden_by_label}`
                    : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Service categories</h3>
          <p className={helperClass}>
            From the maintained list only. {peersSharingCategory} other active
            client{peersSharingCategory === 1 ? "" : "s"} share at least one of
            these categories (geography aside).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {activeCategories.map((category) => {
            const on = selected.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                className={`${on ? btnPrimary : btnSecondary} ${btnSizeSm}`}
                onClick={() =>
                  setSelected((current) =>
                    on
                      ? current.filter((id) => id !== category.id)
                      : [...current, category.id]
                  )
                }
              >
                {category.name}
              </button>
            );
          })}
        </div>

        <div className="max-w-xs">
          <label className={labelClass} htmlFor="excl-status">
            Exclusivity status
          </label>
          <select
            id="excl-status"
            className={selectClass}
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ExclusivityStatus)
            }
          >
            <option value="active">Active</option>
            {/* Not a choice — it is what recording an override leaves behind. */}
            {status === "overridden" ? (
              <option value="overridden">Overridden</option>
            ) : null}
            <option value="not_offered">Not offered</option>
          </select>
          <p className={helperClass}>
            {status === "overridden"
              ? "Overridden names one specific client. Every other client is still checked on save."
              : "Not offered is the only setting that stops conflict checking."}
          </p>
        </div>

        <button
          type="button"
          disabled={pending}
          className={`${btnPrimary} ${btnSizeSm}`}
          onClick={() =>
            start(async () => {
              const result = await saveClientCategoriesAction({
                client_id: clientId,
                category_ids: selected,
                exclusivity_status: status,
              });
              if (!result.ok) {
                toast.error(result.error);
                setConflicts(result.conflicts ?? []);
                return;
              }
              setConflicts([]);
              toast.success("Categories saved.");
            })
          }
        >
          {pending ? "Saving…" : "Save categories"}
        </button>
      </section>

      {conflicts.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-flag-critical/40 bg-flag-critical/10 px-5 py-4">
          <p className="text-sm font-semibold text-flag-critical">
            Save blocked — conflict detected
          </p>
          {conflicts.map((conflict) => (
            <div key={conflict.otherClientId} className="space-y-2 text-sm text-silver">
              <p>
                <span className="text-white">{conflict.otherClientName}</span>
                {" · "}
                {conflict.certainty === "possible" ? "Possible overlap" : "Overlap"}
                {" · "}
                {conflict.sharedCategoryNames.join(", ")}
              </p>
              <p className="text-xs text-dim">{conflict.nature}</p>
              <label className={labelClass} htmlFor={`override-${conflict.otherClientId}`}>
                Override reason
              </label>
              <textarea
                id={`override-${conflict.otherClientId}`}
                className={inputClass}
                rows={2}
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
              />
              <button
                type="button"
                disabled={pending}
                className={`${btnSecondary} ${btnSizeSm}`}
                onClick={() =>
                  start(async () => {
                    const result = await overrideConflictAction({
                      client_id: clientId,
                      other_client_id: conflict.otherClientId,
                      shared_category_ids: conflict.sharedCategoryIds,
                      overlap_summary: `${conflict.sharedCategoryNames.join(", ")} — ${conflict.nature}`,
                      reason: overrideReason,
                    });
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Override recorded on both clients.");
                    setConflicts([]);
                    setOverrideReason("");
                  })
                }
              >
                Override and record
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Exclusivity territories</h3>
          <p className={helperClass}>
            What Divine Acquisition sold. Separate from the appointment-definition
            service area below — neither is derived from the other.
          </p>
        </div>

        {territories.length === 0 ? (
          <p className="text-sm text-dim">No exclusivity territories yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05] rounded-xl border border-border">
            {territories.map((territory) => (
              <li
                key={territory.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="text-white">
                    {territory.label || territory.kind.replace("_", " ")}
                  </p>
                  <p className="text-xs text-dim">{describeTerritory(territory)}</p>
                </div>
                <button
                  type="button"
                  className={`${btnSecondary} ${btnSizeSm}`}
                  onClick={() =>
                    start(async () => {
                      const result = await deleteTerritoryAction({
                        id: territory.id,
                        client_id: clientId,
                      });
                      if (!result.ok) toast.error(result.error);
                      else toast.success("Territory removed.");
                    })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <AddTerritoryForm clientId={clientId} onConflicts={setConflicts} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-white">
          Appointment-definition service area
        </h3>
        <p className={helperClass}>
          Criterion for whether a lead is in area for billing — not the
          exclusivity promise. Edit it by publishing a new definition version.
        </p>
        <p className="rounded-xl border border-border px-4 py-3 text-sm text-silver">
          {definitionServiceArea ?? "Not set on the current definition."}
        </p>
      </section>
    </div>
  );
}

function describeTerritory(territory: Territory): string {
  if (territory.kind === "radius") {
    return `${territory.radius_miles} mi radius · ${territory.center_lat?.toFixed(4)}, ${territory.center_lng?.toFixed(4)}${
      territory.center_address ? ` · ${territory.center_address}` : ""
    }`;
  }
  if (territory.kind === "postal_codes") {
    return `${territory.postal_codes.length} postal code${
      territory.postal_codes.length === 1 ? "" : "s"
    }: ${territory.postal_codes.slice(0, 6).join(", ")}${
      territory.postal_codes.length > 6 ? "…" : ""
    }`;
  }
  return `${territory.region_names.length} region${
    territory.region_names.length === 1 ? "" : "s"
  }: ${territory.region_names.slice(0, 4).join(", ")}`;
}

function AddTerritoryForm({
  clientId,
  onConflicts,
}: {
  clientId: string;
  onConflicts: (conflicts: ClientConflict[]) => void;
}) {
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"radius" | "postal_codes" | "named_regions">(
    "radius"
  );
  const [label, setLabel] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");
  const [miles, setMiles] = useState("25");
  const [codes, setCodes] = useState("");
  const [regions, setRegions] = useState("");

  return (
    <form
      className="space-y-3 rounded-xl border border-border px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const payload =
            kind === "radius"
              ? {
                  client_id: clientId,
                  kind: "radius" as const,
                  label,
                  center_lat: Number(lat),
                  center_lng: Number(lng),
                  center_address: address,
                  radius_miles: Number(miles),
                }
              : kind === "postal_codes"
                ? {
                    client_id: clientId,
                    kind: "postal_codes" as const,
                    label,
                    postal_codes: codes,
                  }
                : {
                    client_id: clientId,
                    kind: "named_regions" as const,
                    label,
                    region_names: regions,
                  };

          const result = await addTerritoryAction(payload);
          if (!result.ok) {
            toast.error(result.error);
            onConflicts(result.conflicts ?? []);
            return;
          }
          onConflicts([]);
          toast.success("Territory added.");
          setLabel("");
          setCodes("");
          setRegions("");
        });
      }}
    >
      <div className="flex flex-wrap gap-2">
        {(["radius", "postal_codes", "named_regions"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`${kind === value ? btnPrimary : btnSecondary} ${btnSizeSm}`}
            onClick={() => setKind(value)}
          >
            {value === "radius"
              ? "Radius"
              : value === "postal_codes"
                ? "Postal codes"
                : "Named regions"}
          </button>
        ))}
      </div>

      <div>
        <label className={labelClass} htmlFor="terr-label">
          Label
        </label>
        <input
          id="terr-label"
          className={inputClass}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Optional"
        />
      </div>

      {kind === "radius" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="terr-lat">
              Latitude
            </label>
            <input
              id="terr-lat"
              className={inputClass}
              value={lat}
              onChange={(event) => setLat(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="terr-lng">
              Longitude
            </label>
            <input
              id="terr-lng"
              className={inputClass}
              value={lng}
              onChange={(event) => setLng(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="terr-miles">
              Radius (miles)
            </label>
            <input
              id="terr-miles"
              className={inputClass}
              value={miles}
              onChange={(event) => setMiles(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="terr-address">
              Center address (label)
            </label>
            <input
              id="terr-address"
              className={inputClass}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
            <p className={helperClass}>
              Stored as a label. Coordinates are the source of truth for overlap.
            </p>
          </div>
        </div>
      ) : null}

      {kind === "postal_codes" ? (
        <div>
          <label className={labelClass} htmlFor="terr-codes">
            Postal codes
          </label>
          <textarea
            id="terr-codes"
            className={inputClass}
            rows={3}
            value={codes}
            onChange={(event) => setCodes(event.target.value)}
            placeholder="One per line or comma-separated"
            required
          />
        </div>
      ) : null}

      {kind === "named_regions" ? (
        <div>
          <label className={labelClass} htmlFor="terr-regions">
            Counties or municipalities
          </label>
          <textarea
            id="terr-regions"
            className={inputClass}
            rows={3}
            value={regions}
            onChange={(event) => setRegions(event.target.value)}
            placeholder="One per line or comma-separated"
            required
          />
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={`${btnPrimary} ${btnSizeSm}`}
      >
        {pending ? "Checking…" : "Add territory"}
      </button>
    </form>
  );
}
