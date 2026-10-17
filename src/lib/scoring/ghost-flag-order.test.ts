import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { runGhostDetectorForOrg, GHOST_REENGAGEMENT_KIND } from "@/lib/scoring/ghost";
import type { ScoringClient } from "@/lib/scoring/store";

/**
 * The soft-threshold branch writes two things: an open re-engagement action and
 * the ghost_approaching_at flag. The flag is also what makes the lead a noop on
 * every later run, so the order decides what a partial failure costs.
 *
 * Flag first, and a failed action insert leaves a flagged lead with nothing
 * telling anyone to re-engage — and no later run revisits it. Action first, and
 * the same failure leaves the lead unflagged for the next run to retry.
 */

const ORG = "org-1";
const LEAD = "lead-1";

type OpLog = { table: string; op: string; payload?: Record<string, unknown> };

function fakeClient(options: {
  nextActionError?: { code?: string; message: string } | null;
  leadUpdateError?: { message: string } | null;
}): { client: ScoringClient; ops: OpLog[] } {
  const ops: OpLog[] = [];

  const resultFor = (table: string, op: string) => {
    if (table === "organizations") {
      return { data: { id: ORG, timezone: "America/New_York" }, error: null };
    }
    if (table === "score_configs") {
      return {
        data: {
          org_id: ORG,
          timeline_weight: 35,
          investment_capacity_weight: 30,
          decision_authority_weight: 20,
          pain_severity_weight: 15,
          ready_threshold: 70,
          speed_to_lead_minutes: 5,
          ghost_days_soft: 14,
          ghost_days_hard: 30,
        },
        error: null,
      };
    }
    if (table === "leads" && op === "select") {
      return {
        data: [
          {
            id: LEAD,
            status: "working",
            // 21 days before `now` below: inside the soft window, short of hard.
            last_touch_at: "2026-06-01T12:00:00.000Z",
            opted_in_at: "2026-06-01T12:00:00.000Z",
            ghost_approaching_at: null,
          },
        ],
        error: null,
      };
    }
    if (table === "leads" && op === "update") {
      return { data: null, error: options.leadUpdateError ?? null };
    }
    if (table === "next_actions" && op === "insert") {
      return { data: null, error: options.nextActionError ?? null };
    }
    return { data: null, error: null };
  };

  const builder = (table: string, op: string, payload?: Record<string, unknown>) => {
    ops.push({ table, op, payload });
    const result = resultFor(table, op);
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "in", "order", "limit", "neq"]) {
      chain[method] = () => chain;
    }
    chain.maybeSingle = async () => result;
    chain.single = async () => result;
    chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  };

  const client = {
    from: (table: string) => ({
      select: () => builder(table, "select"),
      insert: (payload: Record<string, unknown>) => builder(table, "insert", payload),
      update: (payload: Record<string, unknown>) => builder(table, "update", payload),
      delete: () => builder(table, "delete"),
    }),
  } as unknown as ScoringClient;

  return { client, ops };
}

// 21 local days after the lead's last touch: flag territory, not ghost yet.
const NOW = new Date("2026-06-22T12:00:00.000Z");

function flagWrites(ops: OpLog[]) {
  return ops.filter(
    (entry) =>
      entry.table === "leads" &&
      entry.op === "update" &&
      entry.payload?.ghost_approaching_at !== undefined &&
      entry.payload?.ghost_approaching_at !== null
  );
}

function actionInserts(ops: OpLog[]) {
  return ops.filter((entry) => entry.table === "next_actions" && entry.op === "insert");
}

describe("ghost detector soft-threshold write order", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates the re-engagement action before flagging the lead", async () => {
    const { client, ops } = fakeClient({});
    const result = await runGhostDetectorForOrg(client, ORG, NOW);

    const insertIndex = ops.findIndex(
      (entry) => entry.table === "next_actions" && entry.op === "insert"
    );
    const flagIndex = ops.findIndex(
      (entry) =>
        entry.table === "leads" &&
        entry.op === "update" &&
        entry.payload?.ghost_approaching_at !== undefined &&
        entry.payload?.ghost_approaching_at !== null
    );

    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(flagIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeLessThan(flagIndex);
    expect(actionInserts(ops)[0]?.payload?.kind).toBe(GHOST_REENGAGEMENT_KIND);
    expect(result.changed).toBe(1);
  });

  it("leaves the lead unflagged when the action could not be created, so the next run retries", async () => {
    const { client, ops } = fakeClient({
      nextActionError: { code: "42501", message: "permission denied" },
    });
    const result = await runGhostDetectorForOrg(client, ORG, NOW);

    expect(actionInserts(ops)).toHaveLength(1);
    expect(flagWrites(ops)).toHaveLength(0);
    expect(result.changed).toBe(0);
  });

  it("logs the failure rather than swallowing it", async () => {
    const { client } = fakeClient({
      nextActionError: { code: "42501", message: "permission denied" },
    });
    await runGhostDetectorForOrg(client, ORG, NOW);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("re-engagement action"),
      expect.objectContaining({ leadId: LEAD, orgId: ORG })
    );
  });

  it("still flags when an open action already exists, so a retry finishes the pair", async () => {
    const { client, ops } = fakeClient({
      // The unique partial index on open ghost_reengagement rows.
      nextActionError: { code: "23505", message: "duplicate key value" },
    });
    const result = await runGhostDetectorForOrg(client, ORG, NOW);

    expect(flagWrites(ops)).toHaveLength(1);
    expect(result.changed).toBe(1);
  });

  it("does not count a lead as changed when the flag write itself fails", async () => {
    const { client, ops } = fakeClient({ leadUpdateError: { message: "write conflict" } });
    const result = await runGhostDetectorForOrg(client, ORG, NOW);

    expect(actionInserts(ops)).toHaveLength(1);
    expect(result.changed).toBe(0);
  });

  it("reports the lead as evaluated either way", async () => {
    const { client } = fakeClient({
      nextActionError: { code: "42501", message: "permission denied" },
    });
    const result = await runGhostDetectorForOrg(client, ORG, NOW);
    expect(result.evaluated).toBe(1);
  });
});
