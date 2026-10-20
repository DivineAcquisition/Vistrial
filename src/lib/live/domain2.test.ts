import { describe, expect, it } from "vitest";

import { directoryFallbackSwitch } from "@/lib/directory/choose";
import { interruptCapped, shouldGroup } from "@/lib/notifications/decisions";
import { NOTIFICATION_BATCH_WINDOW_MS, NOTIFICATION_HOURLY_CAP, NOTIFICATION_WORKSPACE_HOURLY_CAP } from "@/lib/notifications/constants";
import { HOURLY_CAP, WORKSPACE_HOURLY_CAP, shouldGroup as convexGroup, interruptCapped as convexCap } from "../../../convex/notifyRules";
import {
  commitActivity,
  decideOutbound,
  displayLeadPhrase,
  drainInOrder,
  liveRecordSink,
  prepareActivity,
  projectRun,
  type ActivityWrite,
} from "@/lib/live/words";

function op(seq: number, id: string): ActivityWrite {
  return {
    idempotencyKey: id,
    seq,
    occurredAt: `2026-03-01T00:00:0${seq}.000Z`,
    workspaceId: "ws-a",
    job: "relay",
    kind: "event",
    action: "insert",
    leadName: "June Hart",
    row: { id, label: "Draft for June Hart", body: 'The lead replied: "See you Tuesday."' },
  };
}

describe("domain 2 writer", () => {
  it("keeps every event when Convex cannot be reached, once and in order, without repeating the work", async () => {
    const outbox: ActivityWrite[] = [];
    let workRuns = 0;
    const deps = {
      sink: () => "convex" as const,
      convex: async () => {
        throw new Error("unreachable");
      },
      outbox: async (row: ActivityWrite) => {
        outbox.push(row);
      },
      postgres: async () => {
        throw new Error("rollback is off");
      },
    };
    async function agentBurst() {
      workRuns += 1;
      await commitActivity(op(2, "e2"), deps);
      await commitActivity(op(1, "e1"), deps);
      await commitActivity(op(3, "e3"), deps);
    }
    await agentBurst();
    expect(workRuns).toBe(1);
    const delivered: string[] = [];
    const seen = new Set<string>();
    for (const row of drainInOrder(outbox, seen)) {
      delivered.push(row.idempotencyKey);
      seen.add(row.idempotencyKey);
    }
    expect(delivered).toEqual(["e1", "e2", "e3"]);
    expect(drainInOrder(outbox, seen)).toEqual([]);
    expect(outbox[0]?.row.label).toBe("Draft for a lead");
    expect(String(outbox[0]?.row.body)).not.toContain("See you Tuesday");
    expect(JSON.stringify(outbox)).not.toContain("June Hart");
  });

  it("sends writes back to Postgres when the rollback switch is on", async () => {
    expect(directoryFallbackSwitch({})).toBe("off");
    expect(liveRecordSink({})).toBe("convex");
    expect(liveRecordSink({ LIVE_RECORD_SINK: "postgres" })).toBe("postgres");
    const postgres: string[] = [];
    const where = await commitActivity(op(1, "e1"), {
      sink: () => liveRecordSink({ LIVE_RECORD_SINK: "postgres" }),
      convex: async () => {
        throw new Error("convex should not be called");
      },
      outbox: async () => {
        throw new Error("outbox should not be called");
      },
      postgres: async (row) => {
        postgres.push(row.idempotencyKey);
      },
    });
    expect(where).toBe("postgres");
    expect(postgres).toEqual(["e1"]);
  });

  it("waits when pause state cannot be read, and shows a lead without exposing an id", () => {
    expect(decideOutbound({ ok: false, reason: "paused" })).toBe("wait");
    expect(decideOutbound({ ok: false, reason: "unreadable" })).toBe("wait");
    expect(decideOutbound({ ok: true })).toBe("allow");
    expect(
      displayLeadPhrase({ verbatim: false, stored: "Call with a lead", leadName: null, canSeeLead: false }),
    ).toBe("Call with a lead");
    expect(
      displayLeadPhrase({
        verbatim: false,
        stored: "Call with a lead",
        leadName: "June Hart",
        canSeeLead: true,
      }),
    ).toBe("Call with June Hart");
    expect(
      displayLeadPhrase({ verbatim: true, stored: "Call with June Hart", leadName: null, canSeeLead: false }),
    ).toBe("Call with June Hart");
  });

  it("projects the same columns the staff SQL readers count", () => {
    const source = {
      id: "run-1",
      org_id: "ws-a",
      agent_id: "scribe",
      lead_id: "lead-1",
      status: "failed",
      created_at: "2026-03-01T00:00:00.000Z",
      last_progress_at: "2026-03-01T00:01:00.000Z",
      simulated: false,
      subject_label: "Call with a lead",
    };
    expect(projectRun(source)).toEqual({
      id: "run-1",
      org_id: "ws-a",
      agent_id: "scribe",
      lead_id: "lead-1",
      status: "failed",
      created_at: source.created_at,
      last_progress_at: source.last_progress_at,
      simulated: false,
    });
  });

  it("keeps the notification caps and grouping identical to the current rules", () => {
    expect(HOURLY_CAP).toBe(NOTIFICATION_HOURLY_CAP);
    expect(WORKSPACE_HOURLY_CAP).toBe(NOTIFICATION_WORKSPACE_HOURLY_CAP);
    expect(NOTIFICATION_BATCH_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(convexGroup("speed_to_lead")).toBe(shouldGroup("speed_to_lead"));
    expect(convexGroup("ingestion_stalled")).toBe(shouldGroup("ingestion_stalled"));
    expect(
      convexCap({ personCount: 8, workspaceCount: 0, eventType: "speed_to_lead", isTest: false }),
    ).toBe(interruptCapped({ personCount: 8, workspaceCount: 0, eventType: "speed_to_lead", isTest: false }));
  });

  it("strips the name before a new event is stored", () => {
    const prepared = prepareActivity(op(1, "e1"));
    expect(prepared.row.label).toBe("Draft for a lead");
    expect(prepared).not.toHaveProperty("leadName");
  });
});
