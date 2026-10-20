/**
 * An in-memory stand-in for the PostgREST query builder, for seeded-workspace
 * tests only. It applies the filters the loaders use (eq, in, is, not, gte,
 * lt, or, order, limit, count) to plain rows. It does not model row-level
 * security: tests seed only what the person's policies would return.
 */

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Filter = (row: Row) => boolean;

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return String(a) < String(b) ? -1 : 1;
}

function parseList(value: string): string[] {
  return value.replace(/^\(|\)$/g, "").split(",").map((item) => item.trim());
}

class Query implements PromiseLike<{ data: unknown; count: number | null; error: null }> {
  private filters: Filter[] = [];
  private sorts: Array<{ column: string; ascending: boolean }> = [];
  private max: number | null = null;
  private head = false;
  private counting = false;
  private one: "maybe" | "single" | null = null;

  constructor(private rows: Row[]) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    this.counting = Boolean(options?.count);
    this.head = Boolean(options?.head);
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  not(column: string, op: string, value: unknown) {
    if (op === "is") this.filters.push((row) => (row[column] ?? null) !== value);
    else if (op === "in") {
      const list = parseList(String(value));
      this.filters.push((row) => !list.includes(String(row[column])));
    }
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== null && row[column] !== undefined && cmp(row[column], value) >= 0);
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== null && row[column] !== undefined && cmp(row[column], value) <= 0);
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== null && row[column] !== undefined && cmp(row[column], value) < 0);
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== null && row[column] !== undefined && cmp(row[column], value) > 0);
    return this;
  }
  contains(column: string, values: unknown[]) {
    this.filters.push((row) => Array.isArray(row[column]) && values.every((value) => (row[column] as unknown[]).includes(value)));
    return this;
  }
  or(expression: string) {
    const parts = expression.split(",").map((part) => {
      const [column, op, ...rest] = part.split(".");
      return { column, op, value: rest.join(".") };
    });
    this.filters.push((row) => parts.some((part) => part.op === "eq" && String(row[part.column]) === part.value));
    return this;
  }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.sorts.push({ column, ascending: options?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }

  private run() {
    let rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    for (const sort of [...this.sorts].reverse()) {
      rows = [...rows].sort((a, b) => (sort.ascending ? cmp(a[sort.column], b[sort.column]) : cmp(b[sort.column], a[sort.column])));
    }
    const count = rows.length;
    if (this.max !== null) rows = rows.slice(0, this.max);
    if (this.one) return { data: rows[0] ?? null, count, error: null };
    return { data: this.head ? null : rows, count: this.counting ? count : null, error: null };
  }

  then<A, B>(resolve?: ((value: { data: unknown; count: number | null; error: null }) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}

export function fakeDb(tables: Tables, rpc: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  return {
    from(table: string) {
      return new Query(tables[table] ?? []);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      const handler = rpc[name];
      return handler ? { data: handler(args), error: null } : { data: null, error: { message: `no rpc ${name}`, code: "42883" } };
    },
  };
}
