import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Domain 1: workspaces, members, assignments, invites, and platform staff.
 * Customer rows carry workspaceId (the existing organizations uuid).
 * Platform staff has no workspace id; it is platform scope.
 */
export default defineSchema({
  workspaces: defineTable({
    legacyId: v.string(),
    name: v.string(),
    slug: v.string(),
    timezone: v.string(),
    status: v.string(),
    product: v.string(),
    isPlatformWorkspace: v.boolean(),
    row: v.any(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_slug", ["slug"]),

  members: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    userId: v.string(),
    role: v.string(),
    seat: v.string(),
    active: v.boolean(),
    email: v.string(),
    displayName: v.string(),
    canExport: v.boolean(),
    canApprove: v.boolean(),
    row: v.any(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"])
    .searchIndex("search_name", {
      searchField: "displayName",
      filterFields: ["workspaceId"],
    })
    .searchIndex("search_email", {
      searchField: "email",
      filterFields: ["workspaceId"],
    }),

  assignments: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    userId: v.string(),
    active: v.boolean(),
    row: v.any(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"]),

  invites: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    email: v.string(),
    role: v.string(),
    token: v.string(),
    accepted: v.boolean(),
    row: v.any(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_token", ["token"]),

  platformStaff: defineTable({
    userId: v.string(),
    role: v.string(),
    active: v.boolean(),
    templateAccess: v.boolean(),
    billingAccess: v.boolean(),
    canCreateWorkspaces: v.boolean(),
    displayName: v.string(),
    email: v.string(),
    row: v.any(),
  }).index("by_userId", ["userId"]),

  /**
   * Domain 2: the shared event record, approvals, and notification rows.
   * workspaceId is the existing organizations id.
   */
  activityRuns: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    agentId: v.string(),
    leadId: v.optional(v.string()),
    actorMemberId: v.optional(v.string()),
    setterMemberId: v.optional(v.string()),
    closerMemberId: v.optional(v.string()),
    status: v.string(),
    subjectLabel: v.string(),
    row: v.any(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_workspace", ["workspaceId"]),

  activitySteps: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    runId: v.string(),
    agentId: v.string(),
    leadId: v.optional(v.string()),
    actorMemberId: v.optional(v.string()),
    seq: v.number(),
    status: v.string(),
    row: v.any(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_run", ["runId"]),

  activityEvents: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    runId: v.string(),
    agentId: v.string(),
    leadId: v.optional(v.string()),
    actorMemberId: v.optional(v.string()),
    occurredAt: v.string(),
    seq: v.optional(v.number()),
    row: v.any(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_workspace", ["workspaceId"]),

  activityOutputs: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    runId: v.string(),
    agentId: v.string(),
    leadId: v.optional(v.string()),
    actorMemberId: v.optional(v.string()),
    row: v.any(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_workspace", ["workspaceId"]),

  activityStaff: defineTable({
    runId: v.string(),
    workspaceId: v.string(),
    row: v.any(),
  }).index("by_run", ["runId"]),

  presenceControls: defineTable({
    workspaceId: v.string(),
    agentId: v.string(),
    paused: v.boolean(),
    row: v.any(),
  }).index("by_workspace", ["workspaceId"]),

  approvalItems: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    status: v.string(),
    assignedMemberId: v.optional(v.string()),
    title: v.string(),
    row: v.any(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_workspace", ["workspaceId"]),

  notifications: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    status: v.string(),
    queuedAt: v.string(),
    row: v.any(),
    recipientUserId: v.optional(v.string()),
    recipientMemberId: v.optional(v.string()),
    eventType: v.optional(v.string()),
    channel: v.optional(v.string()),
    dedupeKey: v.optional(v.string()),
    leadId: v.optional(v.string()),
    sendAfter: v.optional(v.string()),
    receipt: v.optional(v.string()),
    attempt: v.optional(v.number()),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_dedupe", ["dedupeKey"])
    .index("by_status", ["status"]),

  /**
   * One-way copy of lead assignment. Ids only. Postgres remains the owner.
   * A missing row denies an operator. It is not treated as unassigned.
   */
  leadAccess: defineTable({
    leadId: v.string(),
    workspaceId: v.string(),
    setterMemberId: v.optional(v.string()),
    closerMemberId: v.optional(v.string()),
    syncedAt: v.number(),
    drifted: v.boolean(),
  })
    .index("by_lead", ["leadId"])
    .index("by_workspace", ["workspaceId"]),

  platformHalts: defineTable({
    agentId: v.string(),
    halted: v.boolean(),
    actorId: v.string(),
    actorName: v.string(),
    reason: v.optional(v.string()),
    at: v.string(),
    job: v.string(),
  }).index("by_agent", ["agentId"]),

  activityReceipts: defineTable({
    key: v.string(),
  }).index("by_key", ["key"]),

  importUses: defineTable({
    at: v.string(),
    purpose: v.string(),
    redacted: v.number(),
    counts: v.any(),
  }),

  notificationPreferences: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    memberId: v.string(),
    eventType: v.string(),
    channel: v.string(),
    enabled: v.boolean(),
    row: v.any(),
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_workspace", ["workspaceId"]),

  notificationMutes: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    memberId: v.string(),
    mutedUntil: v.string(),
    row: v.any(),
  })
    .index("by_member", ["memberId"])
    .index("by_workspace", ["workspaceId"]),

  notificationDigestLog: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    userId: v.string(),
    kind: v.string(),
    sentOn: v.string(),
    row: v.any(),
  }).index("by_user_day", ["workspaceId", "userId", "kind", "sentOn"]),

  notificationEscalations: defineTable({
    legacyId: v.string(),
    workspaceId: v.string(),
    eventType: v.string(),
    subjectId: v.string(),
    step: v.number(),
    row: v.any(),
  }).index("by_subject", ["workspaceId", "eventType", "subjectId", "step"]),

  notificationPresence: defineTable({
    userId: v.string(),
    workspaceId: v.string(),
    path: v.string(),
    seenAt: v.string(),
    row: v.any(),
  }).index("by_user", ["workspaceId", "userId"]),

  notificationPushSettings: defineTable({
    userId: v.string(),
    showFirstNames: v.boolean(),
    row: v.any(),
  }).index("by_user", ["userId"]),

  notificationPushSubscriptions: defineTable({
    legacyId: v.string(),
    userId: v.string(),
    endpoint: v.string(),
    row: v.any(),
  }).index("by_endpoint", ["endpoint"]),

  notificationTeamChannels: defineTable({
    workspaceId: v.string(),
    row: v.any(),
  }).index("by_workspace", ["workspaceId"]),

  /**
   * Domain 3: the agentic workspace. Workspace switches set by staff, the
   * Owner's outcome choice, and each person's own view of Home. Nothing here
   * is lead content: ids, counts, and choices only.
   */
  workspaceHome: defineTable({
    workspaceId: v.string(),
    enabled: v.boolean(),
    outcomeMetrics: v.array(v.string()),
    changedBy: v.string(),
    changedAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  memberHome: defineTable({
    workspaceId: v.string(),
    userId: v.string(),
    collapsed: v.array(v.string()),
    workOrder: v.union(v.literal("best"), v.literal("oldest")),
    workScope: v.union(v.literal("mine"), v.literal("everyone"), v.literal("auto")),
    lastVisitAt: v.union(v.number(), v.null()),
    visitDay: v.union(v.string(), v.null()),
    sinceAt: v.union(v.number(), v.null()),
    briefingSeenDay: v.union(v.string(), v.null()),
    firstSeenAt: v.number(),
    welcomeDismissedAt: v.union(v.number(), v.null()),
  }).index("by_workspace_user", ["workspaceId", "userId"]),

  briefings: defineTable({
    workspaceId: v.string(),
    userId: v.string(),
    day: v.string(),
    sinceAt: v.union(v.number(), v.null()),
    facts: v.any(),
    savedAt: v.number(),
  }).index("by_workspace_user_day", ["workspaceId", "userId", "day"]),

  workSnoozes: defineTable({
    workspaceId: v.string(),
    userId: v.string(),
    leadId: v.string(),
    until: v.number(),
  })
    .index("by_workspace_user", ["workspaceId", "userId"])
    .index("by_workspace_user_lead", ["workspaceId", "userId", "leadId"]),
});
