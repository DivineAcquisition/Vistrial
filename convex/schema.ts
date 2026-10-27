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

  areas: defineTable({
    slug: v.string(),
    name: v.string(),
    job: v.string(),
    promise: v.string(),
    sort: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_sort", ["sort"]),

  agents: defineTable({
    slug: v.string(),
    name: v.string(),
    stage,
    area: v.optional(v.union(v.literal("sales"), v.literal("retention"), v.literal("operations"))),
    job: v.string(),
    promise: v.string(),
    sort: v.number(),
    skills: v.optional(
      v.array(
        v.object({
          slug: v.string(),
          name: v.string(),
          handsBack: v.string(),
          sort: v.number(),
        }),
      ),
    ),
    retired: v.optional(v.boolean()),
  })
    .index("by_slug", ["slug"])
    .index("by_sort", ["sort"])
    .index("by_area", ["area", "sort"]),

  skills: defineTable({
    slug: v.string(),
    agentSlug: v.string(),
    name: v.string(),
    job: v.string(),
    promise: v.string(),
    status: v.union(v.literal("available"), v.literal("comingSoon")),
    sort: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_agent", ["agentSlug", "sort"])
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

  businessProfiles: defineTable({
    workspaceId: v.id("workspaces"),
    offer: v.string(),
    price: v.string(),
    audience: v.string(),
    voice: v.string(),
    examples: v.string(),
    pastAds: v.string(),
    competitors: v.string(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  swipeEntries: defineTable({
    workspaceId: v.id("workspaces"),
    excerpt: v.string(),
    sourceName: v.string(),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  libraryAcceptances: defineTable({
    workspaceId: v.id("workspaces"),
    statement: v.string(),
    acceptedAt: v.number(),
    acceptedBy: v.string(),
  }).index("by_workspace", ["workspaceId"]),

  approvalAssets: defineTable({
    workspaceId: v.id("workspaces"),
    agentSlug: v.string(),
    skillSlug: v.string(),
    title: v.string(),
    body: v.string(),
    status: v.union(v.literal("waiting"), v.literal("approved"), v.literal("declined")),
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"]),

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

  profileVersions: defineTable({
    workspaceId: v.id("workspaces"),
    version: v.number(),
    offer: v.string(),
    priceNotes: v.string(),
    audience: v.string(),
    geography: v.string(),
    channels: v.string(),
    brandVoice: v.string(),
    competitors: v.array(v.object({ name: v.string(), url: v.string() })),
    confirmedBy: v.optional(v.string()),
    confirmedAt: v.optional(v.number()),
    status: v.union(v.literal("draft"), v.literal("confirmed")),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_version", ["workspaceId", "version"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  profileExamples: defineTable({
    workspaceId: v.id("workspaces"),
    version: v.number(),
    kind: v.union(v.literal("voiceExample"), v.literal("pastAd"), v.literal("other")),
    storageId: v.optional(v.id("_storage")),
    text: v.optional(v.string()),
  }).index("by_workspace_version", ["workspaceId", "version"]),

  modelRoutes: defineTable({
    workKind: v.string(),
    provider: v.string(),
    model: v.string(),
    fallbackProvider: v.string(),
    fallbackModel: v.string(),
  }).index("by_workKind", ["workKind"]),

  agentRuns: defineTable({
    workspaceId: v.id("workspaces"),
    agentSlug: v.string(),
    skillSlug: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("waiting"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("stopped"),
    ),
    startedBy: v.string(),
    inputRef: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    stopReason: v.optional(
      v.union(v.literal("done"), v.literal("cap"), v.literal("error"), v.literal("cancelled"), v.literal("halted")),
    ),
    costCents: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_agent", ["workspaceId", "agentSlug"])
    .index("by_status", ["status"]),

  runSteps: defineTable({
    workspaceId: v.id("workspaces"),
    runId: v.id("agentRuns"),
    index: v.number(),
    idempotencyKey: v.string(),
    kind: v.union(v.literal("tool"), v.literal("model"), v.literal("note")),
    toolSlug: v.optional(v.string()),
    modelRoute: v.optional(v.string()),
    status: v.union(v.literal("completed"), v.literal("failed")),
    durationMs: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    resultCode: v.string(),
    resultId: v.optional(v.string()),
  })
    .index("by_workspace_run", ["workspaceId", "runId"])
    .index("by_workspace_idempotency", ["workspaceId", "idempotencyKey"]),

  runArtifacts: defineTable({
    workspaceId: v.id("workspaces"),
    runId: v.id("agentRuns"),
    stepId: v.id("runSteps"),
    kind: v.string(),
    storageId: v.optional(v.id("_storage")),
    byteSize: v.number(),
    body: v.optional(v.string()),
  }).index("by_workspace_run", ["workspaceId", "runId"]),

  assets: defineTable({
    workspaceId: v.id("workspaces"),
    kind: v.union(
      v.literal("researchReport"),
      v.literal("adCopySet"),
      v.literal("creativeBrief"),
      v.literal("contentCalendar"),
      v.literal("swipeItem"),
    ),
    title: v.string(),
    status: v.union(v.literal("draft"), v.literal("approved"), v.literal("archived")),
    currentVersion: v.number(),
    createdByRun: v.optional(v.id("agentRuns")),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_kind_status", ["workspaceId", "kind", "status"]),

  assetVersions: defineTable({
    workspaceId: v.id("workspaces"),
    assetId: v.id("assets"),
    version: v.number(),
    body: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    createdBy: v.union(v.literal("agent"), v.literal("person")),
    notes: v.optional(v.string()),
  }).index("by_workspace_asset", ["workspaceId", "assetId"]),

  evidence: defineTable({
    workspaceId: v.id("workspaces"),
    assetVersionId: v.id("assetVersions"),
    claimKey: v.string(),
    sourceId: v.optional(v.string()),
    fetchedAt: v.optional(v.number()),
    computed: v.optional(v.boolean()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_version", ["workspaceId", "assetVersionId"]),

  agentCaps: defineTable({
    workspaceId: v.id("workspaces"),
    agentSlug: v.string(),
    maxCostCentsPerRun: v.number(),
    maxCostCentsPerDay: v.number(),
    maxSteps: v.number(),
    maxDurationMs: v.number(),
  }).index("by_workspace_agent", ["workspaceId", "agentSlug"]),

  capCounters: defineTable({
    workspaceId: v.id("workspaces"),
    agentSlug: v.string(),
    day: v.string(),
    costCents: v.number(),
  }).index("by_workspace_agent_day", ["workspaceId", "agentSlug", "day"]),

  workspaceControls: defineTable({
    workspaceId: v.id("workspaces"),
    agentsPaused: v.boolean(),
  }).index("by_workspace", ["workspaceId"]),

  platformControls: defineTable({
    key: v.literal("platform"),
    halted: v.boolean(),
  }).index("by_key", ["key"]),
});
