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
  })
    .index("by_legacyId", ["legacyId"])
    .index("by_workspace", ["workspaceId"]),

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
