"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { labelClass, selectClass } from "@/lib/ui";

export function AttentionClientFilter({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("client") ?? "";

  return (
    <div className="w-full max-w-xs">
      <label className={labelClass} htmlFor="attention-client">
        Client
      </label>
      <select
        id="attention-client"
        className={selectClass}
        value={current}
        onChange={(event) => {
          const value = event.target.value;
          const next = new URLSearchParams(params.toString());
          if (value) next.set("client", value);
          else next.delete("client");
          const query = next.toString();
          router.push(query ? `/attention?${query}` : "/attention");
        }}
      >
        <option value="">All clients</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </div>
  );
}
