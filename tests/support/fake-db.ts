/**
 * An in-memory stand-in for the Supabase client, covering the query shapes the
 * ingestion pipeline uses. It enforces the parts of the schema the pipeline
 * relies on for correctness — generated match keys, the idempotency index, and
 * the one-first-touch-per-type index — so the tests exercise the same guarantees
 * the database provides rather than a friendlier version of them.
 */

export type Row = Record<string, unknown>;

type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "is"
  | "notIs";

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
  stripe_events: [{ columns: ["stripe_event_id"] }],
  charge_attempts: [{ columns: ["charge_id", "attempt_no"] }],
  appointments: [
    {
      columns: ["client_id", "provider_appointment_id"],
      where: (row) => row.provider_appointment_id != null && isLive(row),
    },
    { columns: ["client_id", "lead_id", "scheduled_for"], where: isLive },
  ],
};

const LIVE = new Set(["pending", "confirmed", "disputed"]);

function isLive(row: Row): boolean {
  return LIVE.has(String(row.status));
}

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
    origin: "inquiry",
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
  charges: () => ({
    appointment_count: 0,
    appointments_subtotal: 0,
    minimum_adjustment: 0,
    credits_applied: 0,
    total: 0,
    currency: "usd",
    status: "draft",
    minimum_month: null,
    notified_at: null,
    scheduled_for: null,
    processed_at: null,
    attempts: 0,
    last_attempt_at: null,
    next_attempt_at: null,
    stripe_payment_intent_id: null,
    failure_code: null,
    failure_reason: null,
  }),
  charge_lines: () => ({ appointment_id: null, credit_id: null, sort: 0 }),
  charge_notifications: () => ({
    channel: null,
    recipient: null,
    subject: null,
    body: null,
    status: "pending",
    error: null,
    attempts: 0,
    sent_at: null,
  }),
  charge_attempts: () => ({
    processor_reference: null,
    failure_code: null,
    failure_message: null,
    processor_mode: null,
  }),
  stripe_events: () => ({
    livemode: false,
    status: "pending",
    charge_id: null,
    client_id: null,
    note: null,
    error: null,
    received_at: new Date().toISOString(),
    processed_at: null,
  }),
  credits: () => ({
    appointment_id: null,
    created_by: null,
    created_by_label: null,
    applied_charge_id: null,
    applied_at: null,
  }),
  job_runs: () => ({
    kind: "cycle",
    trigger: "schedule",
    started_at: new Date().toISOString(),
    finished_at: null,
    assembled: 0,
    notified: 0,
    processed: 0,
    failed: 0,
    skipped: 0,
    error: null,
  }),
  job_run_entries: () => ({ client_id: null, charge_id: null }),
  appointment_notifications: () => ({
    kind: "confirmation",
    channel: null,
    recipient: null,
    subject: null,
    body: null,
    status: "pending",
    error: null,
    attempts: 0,
    sent_at: null,
  }),
  appointments: () => ({
    status: "pending",
    appointment_type: null,
    showed: null,
    show_recorded_at: null,
    confirmed_at: null,
    review_window_ends_at: null,
    rejected_reason: null,
    disputed_at: null,
    dispute_reason: null,
    dispute_resolution: null,
    charge_id: null,
    rate_applied: null,
    booking_source: "webhook",
    provider_appointment_id: null,
    previous_scheduled_for: null,
    reschedule_count: 0,
    notified_at: null,
    created_by: null,
    last_actor: null,
    last_actor_id: null,
    last_actor_label: null,
    last_reason_code: null,
    last_reason: null,
  }),
};

/**
 * The parts of `appointments_guard` and `appointments_history` in migration 006
 * that the pipeline depends on. Derived values are computed by the database and
 * never by the caller, so a test that trusted the caller would prove nothing.
 */
function appointmentTriggers(db: FakeDb, before: Row | null, after: Row): void {
  const event = (extra: Row) => {
    db.rows("appointment_events").push({
      id: db.nextId(),
      appointment_id: after.id,
      from_status: null,
      to_status: null,
      previous_scheduled_for: null,
      new_scheduled_for: null,
      showed: null,
      actor: after.last_actor ?? "system",
      actor_label: after.last_actor_label ?? null,
      reason_code: after.last_reason_code ?? null,
      reason: after.last_reason ?? null,
      occurred_at: new Date().toISOString(),
      ...extra,
    });
  };

  if (before === null) {
    event({ kind: "created", to_status: after.status, new_scheduled_for: after.scheduled_for });
    return;
  }

  if (before.scheduled_for !== after.scheduled_for) {
    after.previous_scheduled_for = before.scheduled_for;
    after.reschedule_count = Number(before.reschedule_count ?? 0) + 1;
    event({
      kind: "rescheduled",
      previous_scheduled_for: before.scheduled_for,
      new_scheduled_for: after.scheduled_for,
    });
  }

  if (before.showed !== after.showed && after.showed != null) {
    after.show_recorded_at = new Date().toISOString();
    event({ kind: "show_recorded", showed: after.showed as boolean });
  }

  if (before.status !== after.status) {
    if (after.status === "rejected") after.rejected_reason = after.last_reason ?? null;
    event({ kind: "status_changed", from_status: before.status, to_status: after.status });
  }
}

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

function compare(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right;

  const a = String(left ?? "");
  const b = String(right ?? "");
  return a < b ? -1 : a > b ? 1 : 0;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const value = row[filter.column];
    switch (filter.op) {
      case "eq":
        return value === filter.value;
      case "neq":
        return value !== filter.value;
      case "gt":
        return value != null && compare(value, filter.value) > 0;
      case "gte":
        return value != null && compare(value, filter.value) >= 0;
      case "lt":
        return value != null && compare(value, filter.value) < 0;
      case "lte":
        return value != null && compare(value, filter.value) <= 0;
      case "in":
        return Array.isArray(filter.value) && filter.value.includes(value);
      case "is":
        return filter.value === null ? value === null || value === undefined : value === filter.value;
      case "notIs":
        return filter.value === null ? value !== null && value !== undefined : value !== filter.value;
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

    // The exclusion constraint from migration 007: a client never holds two
    // charges for overlapping periods, whatever the caller believes.
    if (table === "charges") {
      const clash = this.rows("charges").some(
        (row) =>
          row.client_id === candidate.client_id &&
          String(row.period_start) <= String(candidate.period_end) &&
          String(row.period_end) >= String(candidate.period_start)
      );

      if (clash) {
        return {
          row: null,
          error: {
            code: "23P01",
            message:
              "conflicting key value violates exclusion constraint charges_no_overlapping_periods",
          },
        };
      }
    }

    this.rows(table).push(candidate);
    if (table === "appointments") appointmentTriggers(this, null, candidate);

    return { row: candidate, error: null };
  }

  /**
   * `capture_appointment` from migration 006. The definition version is read
   * and stamped inside the insert, which is the whole reason it is a function.
   */
  rpc(name: string, params: Record<string, unknown>): Promise<QueryResult> {
    if (name !== "capture_appointment") {
      return Promise.resolve({
        data: null,
        error: { message: `unknown function ${name}` },
      });
    }

    const [definition] = this.rows("appointment_definitions")
      .filter((row) => row.client_id === params.p_client_id)
      .sort((a, b) => Number(b.version) - Number(a.version));

    if (!definition) {
      return Promise.resolve({
        data: null,
        error: {
          message:
            "This client has no appointment definition to judge the appointment against.",
        },
      });
    }

    const { row, error } = this.insertRow("appointments", {
      client_id: params.p_client_id,
      lead_id: params.p_lead_id,
      definition_version: definition.version,
      definition_id: definition.id,
      scheduled_for: params.p_scheduled_for,
      appointment_type: params.p_appointment_type ?? null,
      provider_appointment_id: params.p_provider_appointment_id ?? null,
      booking_source: params.p_booking_source ?? "webhook",
      showed: params.p_showed ?? null,
      last_actor: params.p_actor,
      last_actor_id: params.p_actor_id ?? null,
      last_actor_label: params.p_actor_label ?? null,
    });

    return Promise.resolve({ data: row, error });
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

  neq(column: string, value: unknown): this {
    this.filters.push({ op: "neq", column, value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ op: "gt", column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ op: "gte", column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ op: "lt", column, value });
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

  is(column: string, value: unknown): this {
    this.filters.push({ op: "is", column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    if (operator !== "is") throw new Error(`not(${operator}) is not modelled`);
    this.filters.push({ op: "notIs", column, value });
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
        const difference = compare(a[column], b[column]);
        return ascending ? difference : -difference;
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
      const before = { ...row };
      Object.assign(row, this.values ?? {});
      const regenerated = generated(this.table, row);
      Object.assign(row, regenerated);
      if (this.table === "appointments") appointmentTriggers(this.db, before, row);
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
