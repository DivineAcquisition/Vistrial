/**
 * An in-memory stand-in for the Supabase client, covering the query shapes the
 * ingestion pipeline uses. It enforces the parts of the schema the pipeline
 * relies on for correctness — generated match keys, the idempotency index, and
 * the one-first-touch-per-type index — so the tests exercise the same guarantees
 * the database provides rather than a friendlier version of them.
 */

export type Row = Record<string, unknown>;

type FilterOperator = "eq" | "gte" | "lte" | "in";

type Filter = { op: FilterOperator; column: string; value: unknown };

export type QueryError = { code?: string; message: string } | null;

export type QueryResult = {
  data: Row | Row[] | null;
  error: QueryError;
  count?: number;
};

type UniqueIndex = {
  columns: string[];
  /** Partial index predicate, matching the `where` clause in the migration. */
  where?: (row: Row) => boolean;
};

const UNIQUE_INDEXES: Record<string, UniqueIndex[]> = {
  inbound_events: [
    { columns: ["idempotency_key"], where: (row) => row.idempotency_key != null },
  ],
  touches: [
    { columns: ["lead_id", "touch_type"], where: (row) => row.is_first_of_type === true },
  ],
  campaigns: [
    {
      columns: ["client_id", "external_campaign_id"],
      where: (row) => row.external_campaign_id != null,
    },
    {
      columns: ["client_id", "utm_campaign"],
      where: (row) => row.utm_campaign != null,
    },
  ],
  clients: [{ columns: ["ghl_location_id"], where: (row) => row.ghl_location_id != null }],
};

const DEFAULTS: Record<string, () => Row> = {
  clients: () => ({
    status: "Onboarding",
    rate_per_appointment: 150,
    monthly_minimum: 0,
    billing_cycle_days: 14,
    review_window_hours: 72,
    bill_on: "booked",
    duplicate_window_days: 30,
    ghl_location_id: null,
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    service_area: null,
    accepted_job_types: null,
    stripe_customer_id: null,
    stripe_payment_method_id: null,
  }),
  leads: () => ({
    campaign_id: null,
    name: null,
    phone: null,
    email: null,
    source: "Direct",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    job_type: null,
    raw_payload: null,
    arrival_source: "received",
    duplicate_of: null,
  }),
  touches: () => ({ channel: null, is_first_of_type: false, inbound_event_id: null }),
  inbound_events: () => ({
    client_id: null,
    event_type: null,
    canonical_type: null,
    status: "pending",
    provider_event_id: null,
    idempotency_key: null,
    declared_location_id: null,
    location_mismatch: false,
    lead_id: null,
    touch_id: null,
    error: null,
    resolved_at: null,
    resolution_note: null,
  }),
  lead_submissions: () => ({
    inbound_event_id: null,
    is_original: false,
    payload: null,
  }),
  campaigns: () => ({
    platform: "facebook",
    external_campaign_id: null,
    utm_campaign: null,
  }),
};

/** Mirrors the generated columns in migration 003. */
function generated(table: string, row: Row): Row {
  if (table !== "leads") return row;

  const phone = typeof row.phone === "string" ? row.phone : "";
  const email = typeof row.email === "string" ? row.email : "";
  const digits = phone.replace(/[^0-9]/g, "").slice(-10);

  return {
    ...row,
    phone_key: digits === "" ? null : digits,
    email_key: email.trim().toLowerCase() === "" ? null : email.trim().toLowerCase(),
  };
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const value = row[filter.column];
    switch (filter.op) {
      case "eq":
        return value === filter.value;
      case "gte":
        return String(value) >= String(filter.value);
      case "lte":
        return String(value) <= String(filter.value);
      case "in":
        return Array.isArray(filter.value) && filter.value.includes(value);
    }
  });
}

export class FakeDb {
  readonly tables: Record<string, Row[]> = {};
  private sequence = 0;

  rows(table: string): Row[] {
    this.tables[table] ??= [];
    return this.tables[table];
  }

  /** Seeds a row directly, bypassing the pipeline, as a fixture would. */
  seed(table: string, row: Row): Row {
    const stored = generated(table, {
      id: row.id ?? this.nextId(),
      created_at: row.created_at ?? new Date().toISOString(),
      ...DEFAULTS[table]?.(),
      ...row,
    });
    this.rows(table).push(stored);
    return stored;
  }

  nextId(): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`;
  }

  from(table: string) {
    return new FakeTable(this, table);
  }

  insertRow(table: string, values: Row): { row: Row | null; error: QueryError } {
    const candidate = generated(table, {
      id: this.nextId(),
      created_at: new Date().toISOString(),
      received_at: new Date().toISOString(),
      ...DEFAULTS[table]?.(),
      ...values,
    });

    for (const index of UNIQUE_INDEXES[table] ?? []) {
      if (index.where && !index.where(candidate)) continue;

      const clash = this.rows(table).some(
        (row) =>
          (!index.where || index.where(row)) &&
          index.columns.every((column) => row[column] === candidate[column])
      );

      if (clash) {
        return {
          row: null,
          error: {
            code: "23505",
            message: `duplicate key value violates unique constraint on ${table} (${index.columns.join(", ")})`,
          },
        };
      }
    }

    this.rows(table).push(candidate);
    return { row: candidate, error: null };
  }
}

class FakeTable {
  private readonly db: FakeDb;
  private readonly table: string;

  constructor(db: FakeDb, table: string) {
    this.db = db;
    this.table = table;
  }

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    return new FakeQuery(this.db, this.table, "select", undefined, options);
  }

  insert(values: Row) {
    return new FakeQuery(this.db, this.table, "insert", values);
  }

  update(values: Row) {
    return new FakeQuery(this.db, this.table, "update", values);
  }

  delete() {
    return new FakeQuery(this.db, this.table, "delete");
  }
}

class FakeQuery implements PromiseLike<QueryResult> {
  private readonly filters: Filter[] = [];
  private ordering: { column: string; ascending: boolean } | null = null;
  private rowLimit: number | null = null;
  private shape: "many" | "single" | "maybeSingle" = "many";
  private returning = false;

  private readonly db: FakeDb;
  private readonly table: string;
  private readonly mode: "select" | "insert" | "update" | "delete";
  private readonly values?: Row;
  private readonly options?: { count?: string; head?: boolean };

  constructor(
    db: FakeDb,
    table: string,
    mode: "select" | "insert" | "update" | "delete",
    values?: Row,
    options?: { count?: string; head?: boolean }
  ) {
    this.db = db;
    this.table = table;
    this.mode = mode;
    this.values = values;
    this.options = options;
    if (mode === "select") this.returning = true;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ op: "gte", column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ op: "lte", column, value });
    return this;
  }

  in(column: string, value: unknown[]): this {
    this.filters.push({ op: "in", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.ordering = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number): this {
    this.rowLimit = count;
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mirrors the supabase-js signature
  select(_columns?: string): this {
    this.returning = true;
    return this;
  }

  returns(): this {
    return this;
  }

  single(): this {
    this.shape = "single";
    return this;
  }

  maybeSingle(): this {
    this.shape = "maybeSingle";
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private run(): QueryResult {
    if (this.mode === "insert") return this.runInsert();
    if (this.mode === "update") return this.runUpdate();
    if (this.mode === "delete") return this.runDelete();
    return this.runSelect();
  }

  private selected(): Row[] {
    let rows = this.db.rows(this.table).filter((row) => matches(row, this.filters));

    if (this.ordering) {
      const { column, ascending } = this.ordering;
      rows = [...rows].sort((a, b) => {
        const left = String(a[column] ?? "");
        const right = String(b[column] ?? "");
        return ascending ? left.localeCompare(right) : right.localeCompare(left);
      });
    }

    if (this.rowLimit !== null) rows = rows.slice(0, this.rowLimit);
    return rows;
  }

  private shaped(rows: Row[]): QueryResult {
    if (this.shape === "single") {
      return rows.length === 1
        ? { data: rows[0], error: null }
        : { data: null, error: { code: "PGRST116", message: "expected exactly one row" } };
    }
    if (this.shape === "maybeSingle") {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  private runSelect(): QueryResult {
    const rows = this.selected();

    if (this.options?.head) {
      return { data: null, error: null, count: rows.length };
    }

    return { ...this.shaped(rows), count: rows.length };
  }

  private runInsert(): QueryResult {
    const { row, error } = this.db.insertRow(this.table, this.values ?? {});
    if (error) return { data: null, error };
    if (!this.returning) return { data: null, error: null };
    return this.shaped(row ? [row] : []);
  }

  private runUpdate(): QueryResult {
    const updated = this.db
      .rows(this.table)
      .filter((row) => matches(row, this.filters));

    for (const row of updated) {
      Object.assign(row, this.values ?? {});
      const regenerated = generated(this.table, row);
      Object.assign(row, regenerated);
    }

    if (!this.returning) return { data: null, error: null };
    return this.shaped(updated);
  }

  private runDelete(): QueryResult {
    const remaining = this.db
      .rows(this.table)
      .filter((row) => !matches(row, this.filters));
    this.db.tables[this.table] = remaining;
    return { data: null, error: null };
  }
}
