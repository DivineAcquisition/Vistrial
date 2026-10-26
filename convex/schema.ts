import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const memberRole = v.union(v.literal("owner"), v.literal("manager"), v.literal("rep"));
const consentState = v.union(v.literal("unknown"), v.literal("granted"), v.literal("revoked"));
const identityKind = v.union(
  v.literal("email"),
  v.literal("phone"),
  v.literal("crmId"),
  v.literal("calendarAttendee"),
  v.literal("other"),
);
const stageKind = v.union(v.literal("open"), v.literal("won"), v.literal("lost"));
const leadStatus = v.union(v.literal("open"), v.literal("won"), v.literal("lost"), v.literal("closed"));
const channelKind = v.union(v.literal("email"), v.literal("text"), v.literal("call"), v.literal("other"));
const bookingStatus = v.union(
  v.literal("booked"),
  v.literal("completed"),
  v.literal("canceled"),
  v.literal("noShow"),
);
const inviteRole = v.union(v.literal("manager"), v.literal("rep"));
const stage = v.union(v.literal("foundation"), v.literal("organization"), v.literal("execution"));
const agentState = v.union(v.literal("off"), v.literal("suggesting"), v.literal("on"));

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    timezone: v.string(),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  members: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: memberRole,
    displayName: v.string(),
    active: v.boolean(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"]),

  invitations: defineTable({
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: inviteRole,
    tokenHash: v.string(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_token", ["tokenHash"])
    .index("by_workspace", ["workspaceId"]),

  staff: defineTable({
    userId: v.string(),
    role: v.union(v.literal("platform_admin"), v.literal("service_team")),
  }).index("by_user", ["userId"]),

  staffAccessGrants: defineTable({
    staffUserId: v.string(),
    workspaceId: v.id("workspaces"),
    reason: v.string(),
    startsAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_staff", ["staffUserId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_staff_workspace", ["staffUserId", "workspaceId"]),

  auditLog: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    actorType: v.union(v.literal("user"), v.literal("staff"), v.literal("system")),
    actorId: v.string(),
    action: v.string(),
    subject: v.string(),
    count: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  agents: defineTable({
    slug: v.string(),
    name: v.string(),
    stage,
    job: v.string(),
    promise: v.string(),
    sort: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_sort", ["sort"]),

  workspaceAgents: defineTable({
    workspaceId: v.id("workspaces"),
    agentId: v.id("agents"),
    state: agentState,
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_agent", ["workspaceId", "agentId"]),

  workspaceSettings: defineTable({
    workspaceId: v.id("workspaces"),
    setupDone: v.boolean(),
    themeDefault: v.union(v.literal("light"), v.literal("dark")),
    /** ISO country for phone parsing. Missing means US until the owner sets it. */
    defaultCountry: v.optional(v.string()),
  }).index("by_workspace", ["workspaceId"]),

  people: defineTable({
    workspaceId: v.id("workspaces"),
    displayName: v.string(),
    normalizedName: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    timezone: v.optional(v.string()),
    emailConsent: consentState,
    textConsent: consentState,
    callConsent: consentState,
    emailConsentAt: v.optional(v.number()),
    textConsentAt: v.optional(v.number()),
    callConsentAt: v.optional(v.number()),
    consentSource: v.string(),
    doNotContact: v.boolean(),
    optedOutAt: v.optional(v.number()),
    createdFromSource: v.string(),
    mergedIntoPersonId: v.optional(v.id("people")),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_name", ["workspaceId", "normalizedName"])
    .index("by_workspace_merged", ["workspaceId", "mergedIntoPersonId"]),

  identities: defineTable({
    workspaceId: v.id("workspaces"),
    personId: v.id("people"),
    kind: identityKind,
    value: v.string(),
    source: v.string(),
  })
    .index("by_workspace_kind_value", ["workspaceId", "kind", "value"])
    .index("by_workspace_person", ["workspaceId", "personId"]),

  pipelineStages: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    sort: v.number(),
    kind: stageKind,
    meaning: v.string(),
  }).index("by_workspace_sort", ["workspaceId", "sort"]),

  /**
   * Step 1 stub fields were workspaceId, assignedMemberId, createdAt.
   * assignedMemberId stays optional so a backfill can copy it to ownerMemberId
   * before a later deploy removes it. New writes set ownerMemberId and the rest.
   */
  leads: defineTable({
    workspaceId: v.id("workspaces"),
    assignedMemberId: v.optional(v.id("members")),
    personId: v.optional(v.id("people")),
    stageId: v.optional(v.id("pipelineStages")),
    source: v.optional(v.string()),
    ownerMemberId: v.optional(v.id("members")),
    status: v.optional(leadStatus),
    closedAt: v.optional(v.number()),
    closedReason: v.optional(v.string()),
    historic: v.optional(v.boolean()),
    lastActivityAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_assignee", ["workspaceId", "assignedMemberId"])
    .index("by_workspace_activity", ["workspaceId", "lastActivityAt"])
    .index("by_workspace_owner_activity", ["workspaceId", "ownerMemberId", "lastActivityAt"])
    .index("by_workspace_stage_activity", ["workspaceId", "stageId", "lastActivityAt"])
    .index("by_workspace_status_activity", ["workspaceId", "status", "lastActivityAt"])
    .index("by_workspace_source_activity", ["workspaceId", "source", "lastActivityAt"])
    .index("by_workspace_owner_stage_activity", ["workspaceId", "ownerMemberId", "stageId", "lastActivityAt"])
    .index("by_workspace_owner_status_activity", ["workspaceId", "ownerMemberId", "status", "lastActivityAt"])
    .index("by_workspace_owner_source_activity", ["workspaceId", "ownerMemberId", "source", "lastActivityAt"])
    .index("by_workspace_stage_status_activity", ["workspaceId", "stageId", "status", "lastActivityAt"])
    .index("by_workspace_stage_source_activity", ["workspaceId", "stageId", "source", "lastActivityAt"])
    .index("by_workspace_status_source_activity", ["workspaceId", "status", "source", "lastActivityAt"])
    .index("by_workspace_owner_stage_status_activity", [
      "workspaceId",
      "ownerMemberId",
      "stageId",
      "status",
      "lastActivityAt",
    ])
    .index("by_workspace_owner_stage_source_activity", [
      "workspaceId",
      "ownerMemberId",
      "stageId",
      "source",
      "lastActivityAt",
    ])
    .index("by_workspace_owner_status_source_activity", [
      "workspaceId",
      "ownerMemberId",
      "status",
      "source",
      "lastActivityAt",
    ])
    .index("by_workspace_stage_status_source_activity", [
      "workspaceId",
      "stageId",
      "status",
      "source",
      "lastActivityAt",
    ])
    .index("by_workspace_owner_stage_status_source_activity", [
      "workspaceId",
      "ownerMemberId",
      "stageId",
      "status",
      "source",
      "lastActivityAt",
    ])
    .index("by_workspace_person", ["workspaceId", "personId"]),

  conversations: defineTable({
    workspaceId: v.id("workspaces"),
    leadId: v.id("leads"),
    channel: channelKind,
    externalThreadId: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
  }).index("by_workspace_lead", ["workspaceId", "leadId"]),

  messages: defineTable({
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
    leadId: v.id("leads"),
    direction: v.union(v.literal("in"), v.literal("out")),
    channel: channelKind,
    at: v.number(),
    sourceRecordId: v.optional(v.id("sourceRecords")),
    hasBody: v.boolean(),
  }).index("by_workspace_lead_at", ["workspaceId", "leadId", "at"]),

  messageBodies: defineTable({
    workspaceId: v.id("workspaces"),
    messageId: v.id("messages"),
    text: v.string(),
  }).index("by_workspace_message", ["workspaceId", "messageId"]),

  calls: defineTable({
    workspaceId: v.id("workspaces"),
    leadId: v.id("leads"),
    ownerMemberId: v.id("members"),
    scheduledAt: v.optional(v.number()),
    occurredAt: v.optional(v.number()),
    durationSec: v.optional(v.number()),
    outcome: v.optional(v.string()),
    source: v.string(),
  }).index("by_workspace_lead", ["workspaceId", "leadId"]),

  transcripts: defineTable({
    workspaceId: v.id("workspaces"),
    callId: v.id("calls"),
    storageId: v.id("_storage"),
  }).index("by_workspace_call", ["workspaceId", "callId"]),

  bookings: defineTable({
    workspaceId: v.id("workspaces"),
    leadId: v.id("leads"),
    ownerMemberId: v.id("members"),
    startsAt: v.number(),
    endsAt: v.number(),
    status: bookingStatus,
    source: v.string(),
    externalId: v.optional(v.string()),
  }).index("by_workspace_lead", ["workspaceId", "leadId"]),

  tasks: defineTable({
    workspaceId: v.id("workspaces"),
    leadId: v.optional(v.id("leads")),
    assignedMemberId: v.id("members"),
    kind: v.string(),
    title: v.string(),
    dueAt: v.optional(v.number()),
    status: v.union(v.literal("open"), v.literal("done")),
    createdBy: v.union(v.literal("person"), v.literal("agent")),
    purposeKey: v.string(),
  }).index("by_workspace_lead_purpose", ["workspaceId", "leadId", "purposeKey", "status"]),

  notes: defineTable({
    workspaceId: v.id("workspaces"),
    leadId: v.id("leads"),
    authorMemberId: v.id("members"),
    body: v.string(),
    at: v.number(),
  }).index("by_workspace_lead", ["workspaceId", "leadId"]),

  leadTimeline: defineTable({
    workspaceId: v.id("workspaces"),
    leadId: v.id("leads"),
    kind: v.string(),
    refTable: v.string(),
    refId: v.string(),
    at: v.number(),
    actorMemberId: v.optional(v.id("members")),
  }).index("by_workspace_lead_at", ["workspaceId", "leadId", "at"]),

  sources: defineTable({
    workspaceId: v.id("workspaces"),
    key: v.string(),
    kind: v.string(),
    status: v.string(),
  }).index("by_workspace_key", ["workspaceId", "key"]),

  importRuns: defineTable({
    workspaceId: v.id("workspaces"),
    source: v.string(),
    startedBy: v.id("members"),
    fileStorageId: v.id("_storage"),
    mappingJson: v.string(),
    createdCount: v.number(),
    updatedCount: v.number(),
    skippedCount: v.number(),
    reviewCount: v.number(),
    phoneUnreadableCount: v.number(),
    missingContactCount: v.number(),
    missingActivityCount: v.number(),
    similarNameCount: v.number(),
    similarNameKept: v.number(),
    issuesJson: v.string(),
    /**
     * Dry-run only. Normalized names introduced by this run so a later batch can
     * count an exact name match without writing people. Cleared when the run ends.
     * Never returned to the client.
     */
    dryNameKeysJson: v.optional(v.string()),
    status: v.string(),
    historic: v.boolean(),
    dryRun: v.boolean(),
    errorKind: v.optional(v.string()),
  }).index("by_workspace", ["workspaceId"]),

  sourceRecords: defineTable({
    workspaceId: v.id("workspaces"),
    source: v.string(),
    sourceId: v.string(),
    kind: v.string(),
    importRunId: v.optional(v.id("importRuns")),
    historic: v.boolean(),
    checksum: v.string(),
    status: v.string(),
    leadId: v.optional(v.id("leads")),
    normalizedEmail: v.optional(v.string()),
    normalizedPhone: v.optional(v.string()),
    displayName: v.optional(v.string()),
    activityAt: v.optional(v.number()),
  })
    .index("by_workspace_source_record", ["workspaceId", "source", "sourceId", "kind"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  mergeRecords: defineTable({
    workspaceId: v.id("workspaces"),
    survivorPersonId: v.id("people"),
    mergedPersonId: v.id("people"),
    performedBy: v.id("members"),
    at: v.number(),
    snapshotJson: v.string(),
    revertedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_merged", ["workspaceId", "mergedPersonId"])
    .index("by_workspace_survivor", ["workspaceId", "survivorPersonId"]),

  possibleMatches: defineTable({
    workspaceId: v.id("workspaces"),
    personAId: v.id("people"),
    personBId: v.id("people"),
    sourceRecordId: v.optional(v.id("sourceRecords")),
    reason: v.union(v.literal("email_phone_split"), v.literal("similar_name")),
    status: v.union(v.literal("pending"), v.literal("dismissed"), v.literal("merged")),
  })
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_record", ["workspaceId", "sourceRecordId"]),

  consentChanges: defineTable({
    workspaceId: v.id("workspaces"),
    personId: v.id("people"),
    channel: v.string(),
    next: consentState,
    reason: v.string(),
    at: v.number(),
  }).index("by_workspace_person", ["workspaceId", "personId"]),

  events: defineTable({
    workspaceId: v.id("workspaces"),
    kind: v.string(),
    subjectId: v.optional(v.string()),
    count: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),
});
