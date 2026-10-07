/**
 * A tiny stand-in for the Supabase query builder, enough to drive the inbound
 * paths in tests: it answers selects from fixed tables and records every write.
 */
export type FakeWrite = { table: string; action: "insert" | "update" | "upsert" | "delete"; values: unknown };
type Filter = { op: string; column: string; value: unknown };

export function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  const writes: FakeWrite[] = [];

  function from(table: string) {
    let action: "select" | FakeWrite["action"] = "select";
    let values: unknown = null;
    const filters: Filter[] = [];
    let single = false;

    const rows = () =>
      (tables[table] ?? []).filter((row) =>
        filters.every((f) => {
          const cell = row[f.column];
          if (f.op === "eq") return cell === f.value;
          if (f.op === "in") return (f.value as unknown[]).includes(cell);
          return true;
        })
      );

    const result = () => {
      if (action !== "select") {
        writes.push({ table, action, values });
        return { data: single ? null : [], error: null };
      }
      const found = rows();
      return { data: single ? (found[0] ?? null) : found, error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (v: unknown) => ((action = "insert"), (values = v), builder),
      update: (v: unknown) => ((action = "update"), (values = v), builder),
      upsert: (v: unknown) => ((action = "upsert"), (values = v), builder),
      delete: () => ((action = "delete"), builder),
      eq: (column: string, value: unknown) => (filters.push({ op: "eq", column, value }), builder),
      in: (column: string, value: unknown) => (filters.push({ op: "in", column, value }), builder),
      neq: () => builder,
      is: () => builder,
      lte: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => ((single = true), builder),
      single: () => ((single = true), builder),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return builder;
  }

  return { db: { from, rpc: async () => ({ data: null, error: null }) } as never, writes };
}
