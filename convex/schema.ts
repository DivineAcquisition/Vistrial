import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { assetStatus } from "./lib/assetStatus";
import { factSourceType, factStatus, feedbackKind } from "./lib/factShapes";
import { availability, basis, classification, embed, platform, projectStatus, sourceKind, sourceState } from "./lib/researchShapes";

const resultFigureFields = {
  spend: v.optional(v.number()),
  impressions: v.optional(v.number()),
  clicks: v.optional(v.number()),
  conversions: v.optional(v.number()),
  revenue: v.optional(v.number()),
};
const resultFigures = v.object(resultFigureFields);
const decisionResult = v.union(v.literal("better"), v.literal("same"), v.literal("worse"), v.literal("tooEarly"), v.literal("notTried"));
const decisionFigures = v.object({
  source: v.union(v.literal("meta"), v.literal("upload")),
  label: v.string(),
  currency: v.string(),
  dateStart: v.union(v.string(), v.null()),
  dateStop: v.union(v.string(), v.null()),
  spend: v.optional(v.number()),
  conversions: v.optional(v.number()),
  revenue: v.optional(v.number()),
  capturedAt: v.number(),
});
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
    /** Sign-in email, kept so Settings can list it. Missing on members who have not opened Settings since. */
    email: v.optional(v.string()),
    /** When an owner removed this member. The row stays (inactive) for the audit trail. */
    removedAt: v.optional(v.number()),
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
    /** An owner withdrew the invite before it was used. A cancelled invite cannot be accepted. */
    canceledAt: v.optional(v.number()),
    invitedBy: v.optional(v.string()),
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

  /** Posts from the public site's forms. Read by staff on /admin/submissions. */
  publicSubmissions: defineTable({
    kind: v.string(),
    name: v.string(),
    email: v.string(),
    business: v.optional(v.string()),
    summary: v.string(),
    fields: v.array(v.object({ label: v.string(), value: v.string() })),
    pagePath: v.optional(v.string()),
    status: v.union(v.literal("new"), v.literal("reviewed"), v.literal("archived")),
    emailStatus: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    emailError: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  auditLog: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    actorType: v.union(v.literal("user"), v.literal("staff"), v.literal("system")),
    actorId: v.string(),
    action: v.string(),
    subject: v.string(),
    count: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  /** Deprecated: replaced by departments. Kept until the agent migration has run on every deployment. */
  areas: defineTable({
    slug: v.string(),
    name: v.string(),
    job: v.string(),
    promise: v.string(),
    sort: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_sort", ["sort"]),

  departments: defineTable({
    slug: v.string(),
    name: v.string(),
    job: v.string(),
    sort: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_sort", ["sort"]),

  agents: defineTable({
    slug: v.string(),
    name: v.string(),
    /** Deprecated with areas. Optional while old rows are rewritten by the catalog sync. */
    stage: v.optional(stage),
    /** Deprecated: replaced by department. */
    area: v.optional(v.union(v.literal("sales"), v.literal("retention"), v.literal("operations"))),
    department: v.optional(v.string()),
    /** Workforce number shown next to the name, 1 to 7. */
    number: v.optional(v.number()),
    /** Only a live agent can start runs or be turned on. */
    status: v.optional(v.union(v.literal("live"), v.literal("planned"))),
    /** Where the agent works in the customer lifecycle, in a few words. */
    lifecycle: v.optional(v.string()),
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

  /**
   * A workspace's credit account. Autumn (over Stripe) holds the real balance; this mirror lets every
   * mutation check it without a network call. Amounts are cents of what the customer pays.
   */
  billingAccounts: defineTable({
    workspaceId: v.id("workspaces"),
    balanceCents: v.number(),
    planId: v.optional(v.string()),
    planStatus: v.optional(v.string()),
    nextResetAt: v.optional(v.number()),
    autoRefill: v.optional(v.object({ enabled: v.boolean(), thresholdCents: v.number(), amountCents: v.number() })),
    refreshedAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  /** Every charge for AI work: what it really cost, the markup, and what the customer paid. */
  billingLedger: defineTable({
    workspaceId: v.id("workspaces"),
    source: v.union(v.literal("run"), v.literal("followup"), v.literal("intake"), v.literal("file")),
    ref: v.string(),
    costCents: v.number(),
    priceCents: v.number(),
    markup: v.number(),
    at: v.number(),
    /** Set once Autumn has the usage. Unsynced rows are retried. */
    syncedAt: v.optional(v.number()),
    syncError: v.optional(v.string()),
  })
    .index("by_workspace_at", ["workspaceId", "at"])
    .index("by_synced", ["syncedAt"]),

  /**
   * A new customer's way in: the wizard before paying (about you, the business, what you sell, your goal),
   * the free research session, paying, and the guided chat after. Keyed by the person; the workspace is
   * created when the wizard finishes, so nothing typed is ever asked again.
   */
  onboarding: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    stage: v.union(
      v.literal("about"),
      v.literal("business"),
      v.literal("offer"),
      v.literal("goal"),
      v.literal("review"),
      v.literal("freeSession"),
      v.literal("paywall"),
      v.literal("guide"),
      v.literal("done"),
    ),
    person: v.object({ fullName: v.string(), role: v.string(), phone: v.string(), heardFrom: v.string() }),
    business: v.object({ name: v.string(), website: v.string(), offer: v.string(), area: v.string(), audience: v.string() }),
    goal: v.object({ kind: v.string(), text: v.string() }),
    site: v.object({
      status: v.union(v.literal("idle"), v.literal("reading"), v.literal("read"), v.literal("failed")),
      url: v.string(),
      summary: v.string(),
      offer: v.string(),
      area: v.string(),
      audience: v.string(),
      competitors: v.array(v.string()),
      costCents: v.number(),
    }),
    freeProjectId: v.optional(v.id("researchProjects")),
    freeRunId: v.optional(v.id("agentRuns")),
    /** How many free sessions were started. One retry is allowed when the first one stops without a report. */
    freeAttempts: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"]),

  /** People who asked to hear when a planned agent goes live. One row per person and agent. */
  agentWaitlist: defineTable({
    workspaceId: v.id("workspaces"),
    agentSlug: v.string(),
    userId: v.string(),
    at: v.number(),
  }).index("by_workspace_agent_user", ["workspaceId", "agentSlug", "userId"]),

  workspaceSettings: defineTable({
    workspaceId: v.id("workspaces"),
    setupDone: v.boolean(),
    themeDefault: v.union(v.literal("light"), v.literal("dark")),
    /** ISO country for phone parsing. Missing means US until the owner sets it. */
    defaultCountry: v.optional(v.string()),
    /** The owner lets the Vistrial service team open time-limited, logged access. On by default from onboarding. */
    serviceTeamAccess: v.optional(v.boolean()),
    /** The research quality a new chat starts with. Missing means thorough. */
    defaultResearchMode: v.optional(v.union(v.literal("fast"), v.literal("thorough"))),
  }).index("by_workspace", ["workspaceId"]),

  /** One member's own choices: theme and which in-app notices they want. Missing fields mean the default. */
  memberPreferences: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("system"))),
    notifyCheckInsDue: v.optional(v.boolean()),
    notifyQuestionsWaiting: v.optional(v.boolean()),
    notifyReportReady: v.optional(v.boolean()),
    /** Off stops reminder emails for this member. Missing means on. The switches above still choose which notices. */
    notifyByEmail: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_workspace_user", ["workspaceId", "userId"]),

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
      v.literal("needsInput"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("stopped"),
    ),
    /** Set while the run waits on a person (doctrine D8). A new question gets a new id. */
    waitingFor: v.optional(v.object({ questionId: v.string(), questionKey: v.string(), question: v.string(), askedAt: v.number() })),
    /** Time spent waiting, which the time cap does not count. */
    waitedMs: v.optional(v.number()),
    /** Why a run needs input: it waited seven days with no answer. */
    needsInputReason: v.optional(v.literal("timedOut")),
    startedBy: v.string(),
    inputRef: v.string(),
    /** Quality mode: thorough (the default) or fast (faster models, lower cap). */
    mode: v.optional(v.union(v.literal("thorough"), v.literal("fast"))),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    stopReason: v.optional(
      v.union(v.literal("done"), v.literal("cap"), v.literal("error"), v.literal("cancelled"), v.literal("halted")),
    ),
    costCents: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    /** The free research session from onboarding. Vistrial pays for it; it never touches the workspace's credits. */
    free: v.optional(v.boolean()),
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
    /** The kind of work a model step did. Workspace screens show this, never the model name. */
    workKind: v.optional(v.string()),
    /** Web searches and fetches a model step made. Counts only, never page text. */
    webSearches: v.optional(v.number()),
    webFetches: v.optional(v.number()),
    status: v.union(v.literal("completed"), v.literal("failed")),
    durationMs: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    resultCode: v.string(),
    resultId: v.optional(v.string()),
    /** The skill's name for this step (brief, classify, write...). Skills find their own earlier steps by it. */
    phase: v.optional(v.string()),
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
      v.literal("marketReport"),
      v.literal("offerAnalysis"),
      v.literal("adCopySet"),
      v.literal("creativeBrief"),
      v.literal("contentCalendar"),
      v.literal("swipeItem"),
      v.literal("growthDiagnosis"),
    ),
    title: v.string(),
    status: assetStatus,
    currentVersion: v.number(),
    createdByRun: v.optional(v.id("agentRuns")),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_kind_status", ["workspaceId", "kind", "status"])
    .index("by_workspace_kind", ["workspaceId", "kind"])
    .index("by_workspace_run", ["workspaceId", "createdByRun"]),

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
    /** The claim as written in the asset. Asset content, never copied into logs. */
    statement: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    fetchedAt: v.optional(v.number()),
    computed: v.optional(v.boolean()),
    /** What supports the claim. Missing on claims written before bases existed; those keep the old rule. */
    basis: v.optional(basis),
    /** The collected sources behind the claim. Each must be in the same workspace. */
    sourceRefIds: v.optional(v.array(v.id("sourceRefs"))),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_version", ["workspaceId", "assetVersionId"]),

  /**
   * Caps per workspace and agent. A row with a skillSlug holds the caps of a skill that has its own
   * (Market Intelligence); a row without one holds the caps every other skill of the agent shares.
   */
  agentCaps: defineTable({
    workspaceId: v.id("workspaces"),
    agentSlug: v.string(),
    skillSlug: v.optional(v.string()),
    maxCostCentsPerRun: v.number(),
    maxCostCentsPerDay: v.number(),
    maxSteps: v.number(),
    maxDurationMs: v.number(),
  })
    .index("by_workspace_agent", ["workspaceId", "agentSlug"])
    .index("by_workspace_agent_skill", ["workspaceId", "agentSlug", "skillSlug"]),

  /** Spend per day, in the same scope as the caps row: a skill with its own caps counts on its own. */
  capCounters: defineTable({
    workspaceId: v.id("workspaces"),
    agentSlug: v.string(),
    skillSlug: v.optional(v.string()),
    day: v.string(),
    costCents: v.number(),
  })
    .index("by_workspace_agent_day", ["workspaceId", "agentSlug", "day"])
    .index("by_workspace_agent_skill_day", ["workspaceId", "agentSlug", "skillSlug", "day"]),

  workspaceControls: defineTable({
    workspaceId: v.id("workspaces"),
    agentsPaused: v.boolean(),
  }).index("by_workspace", ["workspaceId"]),

  /**
   * A fact about the business that can change on its own and that a later agent must be able to trust or
   * doubt (doctrine D6). One live row per key; replacing a fact inserts a new row that supersedes the old.
   * Rows are never edited into a new value and never hard-deleted.
   */
  businessFacts: defineTable({
    workspaceId: v.id("workspaces"),
    factKey: v.string(),
    value: v.string(),
    sourceType: factSourceType,
    /** A sourceRefs id, asset id, feedback id, or a short note such as "onboarding". Empty only for owner and assumption. */
    sourceReference: v.optional(v.string()),
    recordedAt: v.number(),
    /** The user who wrote the row, or "agent" for a run. */
    recordedBy: v.string(),
    /** The run that wrote it, for an agent fact. */
    runId: v.optional(v.id("agentRuns")),
    verifiedAt: v.optional(v.number()),
    verifiedBy: v.optional(v.string()),
    status: factStatus,
    supersedesFactId: v.optional(v.id("businessFacts")),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.string()),
  })
    .index("by_workspace_key", ["workspaceId", "factKey", "recordedAt"])
    .index("by_workspace_status", ["workspaceId", "status", "recordedAt"]),

  /** A person's reason when they reject an asset or ask for a revision. Reusable only once a person promotes it. */
  feedback: defineTable({
    workspaceId: v.id("workspaces"),
    assetId: v.id("assets"),
    assetVersionId: v.id("assetVersions"),
    kind: feedbackKind,
    reason: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    promotedFactId: v.optional(v.id("businessFacts")),
  })
    .index("by_workspace", ["workspaceId", "createdAt"])
    .index("by_workspace_asset", ["workspaceId", "assetId", "createdAt"]),

  /** One piece of market research: what to find out, and where to look. */
  researchProjects: defineTable({
    workspaceId: v.id("workspaces"),
    title: v.string(),
    objective: v.string(),
    market: v.string(),
    geography: v.string(),
    competitors: v.array(v.object({ name: v.string(), url: v.optional(v.string()) })),
    platforms: v.array(platform),
    /** Links a person pasted in to be analyzed. */
    suppliedUrls: v.array(v.string()),
    status: projectStatus,
    latestRunId: v.optional(v.id("agentRuns")),
    /** The confirmed profile version the project was scoped against. */
    profileVersionId: v.optional(v.id("profileVersions")),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId", "updatedAt"])
    .index("by_workspace_status", ["workspaceId", "status", "updatedAt"]),

  /**
   * One thing the agent found or a person supplied: a page, video, post or ad. Only metadata, a short
   * attributed excerpt, and official embed ids. Media is never downloaded or rehosted.
   */
  sourceRefs: defineTable({
    workspaceId: v.id("workspaces"),
    projectId: v.id("researchProjects"),
    runId: v.optional(v.id("agentRuns")),
    /** The raw fetch this came from, for provenance. Never shown in place of the source. */
    artifactId: v.optional(v.id("runArtifacts")),
    origin: v.union(v.literal("found"), v.literal("supplied")),
    platform,
    kind: sourceKind,
    url: v.string(),
    canonicalUrl: v.string(),
    title: v.string(),
    /** Creator, advertiser or site. */
    publisher: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    observedAt: v.number(),
    embed: v.optional(embed),
    availability,
    /** 300 characters or less, from the source and attributed to it. */
    excerpt: v.optional(v.string()),
    classification: v.optional(classification),
    /** What this source cannot show, in a few words. */
    limitation: v.optional(v.string()),
  })
    .index("by_workspace_project", ["workspaceId", "projectId"])
    .index("by_workspace_project_platform", ["workspaceId", "projectId", "platform"])
    .index("by_workspace_project_canonical", ["workspaceId", "projectId", "canonicalUrl"])
    .index("by_workspace_run", ["workspaceId", "runId"]),

  /** Each source adapter's status for one run, with a reason code. Never page text. */
  sourceStatus: defineTable({
    workspaceId: v.id("workspaces"),
    projectId: v.id("researchProjects"),
    runId: v.id("agentRuns"),
    platform,
    state: sourceState,
    reasonCode: v.string(),
    found: v.number(),
    checkedAt: v.number(),
  })
    .index("by_workspace_run", ["workspaceId", "runId", "platform"])
    .index("by_workspace_project", ["workspaceId", "projectId"]),

  /** A saved group of source references. With an owner it is personal; without one it is the workspace's. */
  collections: defineTable({
    workspaceId: v.id("workspaces"),
    projectId: v.optional(v.id("researchProjects")),
    name: v.string(),
    ownerUserId: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_workspace_owner", ["workspaceId", "ownerUserId"])
    .index("by_workspace_project", ["workspaceId", "projectId"]),

  collectionItems: defineTable({
    workspaceId: v.id("workspaces"),
    collectionId: v.id("collections"),
    sourceRefId: v.id("sourceRefs"),
    note: v.optional(v.string()),
    addedBy: v.string(),
    addedAt: v.number(),
  })
    .index("by_workspace_collection", ["workspaceId", "collectionId", "sourceRefId"])
    .index("by_workspace_ref", ["workspaceId", "sourceRefId"]),

  /**
   * A workspace's read-only connection to Meta ads (Marketing API). The token is server-only: no public
   * query returns it. One connection per workspace.
   */
  /**
   * A results file the business uploaded (ad platform, CRM, booking or email export). Only totals and
   * per-campaign figures are kept; the file is deleted once read, and personal columns are never read.
   * Its figures become "Your data" sources for the agents it is granted to.
   */
  /**
   * A report opportunity the business chose to try, and what happened. Figures are read from the business's
   * own Meta results and results files when the decision is made (baseline) and when the outcome is recorded.
   */
  decisions: defineTable({
    workspaceId: v.id("workspaces"),
    projectId: v.id("researchProjects"),
    runId: v.id("agentRuns"),
    assetId: v.optional(v.id("assets")),
    /** Position of the opportunity in the report, and its words as written, so a later report cannot change them. */
    opportunityIndex: v.number(),
    opportunity: v.string(),
    proposedAction: v.string(),
    validationMethod: v.string(),
    /**
     * What was chosen, when it is not a report opportunity: an offer change from an offer analysis, or a
     * step of a growth diagnosis's 90-day roadmap. Missing means a report opportunity.
     */
    itemKind: v.optional(v.union(v.literal("offerChange"), v.literal("roadmapStep"))),
    /** The roadmap phase of a roadmap step. */
    phase: v.optional(v.union(v.literal("fix"), v.literal("build"), v.literal("scale"))),
    checkInAt: v.number(),
    /** When the check-in-due email went out. Set once, so the reminder is never sent twice. */
    remindedAt: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
    baseline: v.array(decisionFigures),
    outcome: v.optional(
      v.object({
        result: decisionResult,
        /** The owner's own words, 500 characters at most. Stays in this workspace. */
        note: v.string(),
        after: v.array(decisionFigures),
        recordedAt: v.number(),
        recordedBy: v.string(),
      }),
    ),
  })
    .index("by_workspace", ["workspaceId", "checkInAt"])
    .index("by_workspace_project", ["workspaceId", "projectId"])
    .index("by_workspace_asset", ["workspaceId", "assetId"]),

  /**
   * The growth goal the owner set in the Diagnostics workspace, in their own words ("40 more bookings a
   * month"). The newest row is the current goal; older rows are its history. Growth Diagnostics reads it.
   */
  growthGoals: defineTable({
    workspaceId: v.id("workspaces"),
    text: v.string(),
    /** Read from the owner's words in code, when they name a number: 40, "bookings", "month". */
    target: v.optional(v.number()),
    metric: v.optional(v.string()),
    period: v.optional(v.union(v.literal("week"), v.literal("month"), v.literal("quarter"), v.literal("year"))),
    setBy: v.string(),
    setAt: v.number(),
  }).index("by_workspace", ["workspaceId", "setAt"]),

  /** One offer the business sells, shown as an offer card. Its content lives in versions. */
  offerCards: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    currentVersion: v.number(),
    archived: v.optional(v.boolean()),
    /** The card this one was started from as a copy, when it was. */
    copiedFrom: v.optional(v.id("offerCards")),
    /** Each time "Analyse this offer" ran Offer Intelligence on this card: the run and the version it read. Newest last. */
    analyses: v.optional(v.array(v.object({ runId: v.id("agentRuns"), version: v.number(), at: v.number() }))),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId", "updatedAt"]),

  /**
   * One version of an offer card. A person writes one in the offer builder or by answering in the chat;
   * an offer analysis writes one from what the business stated. Never overwritten: a change is a new version.
   */
  offerCardVersions: defineTable({
    workspaceId: v.id("workspaces"),
    cardId: v.id("offerCards"),
    version: v.number(),
    name: v.string(),
    price: v.string(),
    included: v.array(v.string()),
    guarantee: v.string(),
    terms: v.string(),
    targetCustomer: v.string(),
    // The offer builder's fields. All optional: versions from before the builder, the chat or an analysis have none.
    /** The outcome the customer gets. */
    outcome: v.optional(v.string()),
    /** The structured price. `price` above is its plain-text form. */
    pricing: v.optional(
      v.object({
        kind: v.union(v.literal("oneTime"), v.literal("monthly"), v.literal("tiered")),
        amount: v.string(),
        /** The optional "was" price. */
        was: v.string(),
        tiers: v.array(v.object({ name: v.string(), price: v.string() })),
      }),
    ),
    /** Line items, each with an optional value. `included` above is their names. */
    items: v.optional(v.array(v.object({ text: v.string(), value: v.string() }))),
    bonuses: v.optional(v.array(v.string())),
    guaranteeType: v.optional(v.union(v.literal("none"), v.literal("results"), v.literal("moneyBack"), v.literal("satisfaction"), v.literal("custom"))),
    cta: v.optional(v.string()),
    channel: v.optional(v.string()),
    origin: v.union(v.literal("person"), v.literal("chat"), v.literal("analysis")),
    /** The offer analysis this version came from, when it came from one. */
    assetId: v.optional(v.id("assets")),
    note: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_workspace_card", ["workspaceId", "cardId", "version"]),

  /**
   * Vistrial's own learning from outcomes, across businesses. Internal only: no public function reads it,
   * and no screen shows it. Holds no workspace, person, place, business name or owner note: only the market
   * in a few words, the action as the report wrote it, the result, and changes as percentages.
   * `decisionId` exists only so deleting a decision deletes its row.
   */
  learningSignals: defineTable({
    decisionId: v.id("decisions"),
    market: v.string(),
    opportunity: v.string(),
    proposedAction: v.string(),
    result: decisionResult,
    daysToOutcome: v.number(),
    /** Percent change per measure, e.g. { spend: -12.5, conversions: 30 }, from the same source before and after. */
    changes: v.array(v.object({ source: v.string(), metric: v.string(), percent: v.number() })),
    month: v.string(),
  }).index("by_decision", ["decisionId"]),

  resultUploads: defineTable({
    workspaceId: v.id("workspaces"),
    fileName: v.string(),
    /** Where the figures come from, in the person's words ("Google Ads", "Jobber bookings"). */
    label: v.string(),
    currency: v.string(),
    uploadedBy: v.string(),
    createdAt: v.number(),
    status: v.union(v.literal("processing"), v.literal("ready"), v.literal("refused")),
    /** Why a file was refused: empty, too_large, too_many_rows, personal_data, no_metrics, parse_failed, file_missing. */
    code: v.optional(v.string()),
    /** Present only until the file is read, then deleted from storage. */
    storageId: v.optional(v.id("_storage")),
    /** Agents granted use of these figures. Missing means the Growth Architect only. */
    agents: v.optional(v.array(v.string())),
    summary: v.optional(
      v.object({
        rows: v.number(),
        dateStart: v.union(v.string(), v.null()),
        dateStop: v.union(v.string(), v.null()),
        metrics: v.array(v.string()),
        totals: resultFigures,
        groupBy: v.union(v.string(), v.null()),
        groups: v.array(v.object({ name: v.string(), ...resultFigureFields })),
        otherGroups: v.number(),
        ignoredColumns: v.array(v.string()),
      }),
    ),
    /** Header names of personal columns skipped in a refused file. Names only. */
    ignoredColumns: v.optional(v.array(v.string())),
  }).index("by_workspace", ["workspaceId"]),

  metaConnections: defineTable({
    workspaceId: v.id("workspaces"),
    /** "oauth" from Facebook Login; "serverToken" for the operator's own token in development. */
    source: v.union(v.literal("oauth"), v.literal("serverToken")),
    accessToken: v.string(),
    tokenExpiresAt: v.optional(v.number()),
    scopes: v.array(v.string()),
    metaUserId: v.string(),
    metaUserName: v.string(),
    connectedBy: v.string(),
    connectedAt: v.number(),
    status: v.union(v.literal("connected"), v.literal("needsReconnect")),
    /** Agents granted use of this workspace connection. Missing means the Growth Architect only. */
    agents: v.optional(v.array(v.string())),
    adAccountId: v.optional(v.string()),
    adAccountName: v.optional(v.string()),
    currency: v.optional(v.string()),
    /** The window to read: last_30d, last_90d or maximum. */
    range: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    lastSyncCode: v.optional(v.string()),
    /** Marketing API calls this connection made, for the person and for Meta's access tier. */
    callsOk: v.number(),
    callsFailed: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  /** One Facebook Login attempt: bound to a workspace and person, used once, short-lived. */
  metaOauthStates: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    nonce: v.string(),
    returnOrigin: v.optional(v.string()),
    /** A page inside the app to come back to, such as the chat that started the connection. */
    returnPath: v.optional(v.string()),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_nonce", ["nonce"]),

  /** The last read of a connected ad account: 30-day totals, a daily series and each campaign. */
  metaAdSnapshots: defineTable({
    workspaceId: v.id("workspaces"),
    adAccountId: v.string(),
    currency: v.string(),
    /** last_30d, last_90d or maximum. */
    range: v.optional(v.string()),
    dateStart: v.string(),
    dateStop: v.string(),
    syncedAt: v.number(),
    totals: v.object({
      spend: v.number(),
      impressions: v.number(),
      clicks: v.number(),
      reach: v.number(),
      active: v.number(),
      ctr: v.union(v.number(), v.null()),
      cpc: v.union(v.number(), v.null()),
    }),
    daily: v.array(v.object({ date: v.string(), spend: v.number(), impressions: v.number(), clicks: v.number() })),
    campaigns: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        status: v.string(),
        objective: v.union(v.string(), v.null()),
        spend: v.number(),
        impressions: v.number(),
        reach: v.number(),
        clicks: v.number(),
        ctr: v.union(v.number(), v.null()),
        cpc: v.union(v.number(), v.null()),
        resultLabel: v.union(v.string(), v.null()),
        results: v.union(v.number(), v.null()),
        costPerResult: v.union(v.number(), v.null()),
      }),
    ),
  }).index("by_workspace_account", ["workspaceId", "adAccountId"]),

  /** One read of a connected ad account, step by step, so the person can watch it and look back. */
  metaSyncRuns: defineTable({
    workspaceId: v.id("workspaces"),
    trigger: v.union(v.literal("manual"), v.literal("schedule"), v.literal("connect")),
    adAccountId: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
    code: v.optional(v.string()),
    steps: v.array(
      v.object({
        key: v.string(),
        status: v.union(v.literal("waiting"), v.literal("working"), v.literal("done"), v.literal("failed")),
        calls: v.number(),
        rows: v.optional(v.number()),
        ms: v.optional(v.number()),
      }),
    ),
    callsOk: v.number(),
    callsFailed: v.number(),
  }).index("by_workspace", ["workspaceId", "startedAt"]),

  /** Marketing API calls per workspace per UTC day, for the person and Meta's 15-day access tier. */
  metaCallDays: defineTable({
    workspaceId: v.id("workspaces"),
    day: v.string(),
    ok: v.number(),
    failed: v.number(),
  }).index("by_workspace_day", ["workspaceId", "day"]),

  /**
   * A research intake: the conversation before a session. Slots are filled from business memory, then
   * from what the person says; code decides what is missing. Nothing runs or spends on research until the
   * person presses Start on the plan.
   */
  intakes: defineTable({
    workspaceId: v.id("workspaces"),
    agentSlug: v.string(),
    createdBy: v.string(),
    status: v.union(v.literal("chatting"), v.literal("thinking"), v.literal("ready"), v.literal("started"), v.literal("abandoned")),
    slots: v.any(),
    questionsAsked: v.number(),
    /** The checklist item the last question asked about. */
    asking: v.optional(v.string()),
    costCents: v.number(),
    capCents: v.number(),
    /** Answers the person may want remembered; cleared once they choose. */
    pendingRemember: v.array(v.object({ factKey: v.string(), label: v.string(), value: v.string() })),
    platformNote: v.optional(v.string()),
    /** Quality mode chosen in the chat box; thorough when missing. */
    mode: v.optional(v.union(v.literal("thorough"), v.literal("fast"))),
    projectId: v.optional(v.id("researchProjects")),
    /**
     * The skill this conversation is for. Missing means Market Intelligence (the research intake). Offer
     * Intelligence and Growth Diagnostics ask their own short checklist, held in code (`skillIntake.ts`).
     * "undecided" while the agent chat is still asking which of the three the person wants.
     */
    skillSlug: v.optional(v.string()),
    /** What the skill checklist gathered, keyed by question. */
    answers: v.optional(v.record(v.string(), v.string())),
    /** The run a skill conversation started. */
    runId: v.optional(v.id("agentRuns")),
    /**
     * What the person attached with "Refine in chat": a result (an asset) or an offer card of this
     * workspace. The title is kept so the conversation still names it if the item is later archived.
     */
    context: v.optional(v.object({ kind: v.union(v.literal("asset"), v.literal("offer")), id: v.string(), title: v.string() })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId", "updatedAt"])
    .index("by_project", ["projectId"]),

  intakeMessages: defineTable({
    workspaceId: v.id("workspaces"),
    intakeId: v.id("intakes"),
    role: v.union(v.literal("you"), v.literal("agent")),
    /** text, question, known (memory cards), remember (chips), found (competitors found), plan, note, route (which skill?), choice (the answer to it), context (an attached item). */
    kind: v.string(),
    text: v.string(),
    chips: v.optional(v.array(v.string())),
    data: v.optional(v.any()),
    at: v.number(),
  }).index("by_intake", ["intakeId", "at"]),

  /**
   * A file a person added to a conversation or session: an image, a PDF or a spreadsheet. Claude reads it
   * into an attributed summary; a spreadsheet of the business's own results is first-party evidence.
   */
  sessionFiles: defineTable({
    workspaceId: v.id("workspaces"),
    intakeId: v.optional(v.id("intakes")),
    projectId: v.optional(v.id("researchProjects")),
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
    kind: v.union(v.literal("image"), v.literal("pdf"), v.literal("csv")),
    status: v.union(v.literal("reading"), v.literal("read"), v.literal("failed")),
    summary: v.optional(v.string()),
    costCents: v.number(),
    sourceRefId: v.optional(v.id("sourceRefs")),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_intake", ["intakeId"])
    .index("by_project", ["projectId"]),

  /**
   * Follow-up chat inside a session, after the report: questions answered from the session's own sources,
   * and new research the person approved. Each answer cites real sources of the session.
   */
  sessionChats: defineTable({
    workspaceId: v.id("workspaces"),
    projectId: v.id("researchProjects"),
    role: v.union(v.literal("you"), v.literal("agent")),
    /** question, answer, proposal (new research awaiting Run), note. */
    kind: v.string(),
    text: v.string(),
    status: v.union(v.literal("thinking"), v.literal("done"), v.literal("failed"), v.literal("proposed"), v.literal("running"), v.literal("declined")),
    data: v.optional(v.any()),
    mode: v.optional(v.union(v.literal("thorough"), v.literal("fast"))),
    costCents: v.number(),
    createdBy: v.string(),
    at: v.number(),
  }).index("by_project", ["projectId", "at"]),

  platformControls: defineTable({
    key: v.literal("platform"),
    halted: v.boolean(),
  }).index("by_key", ["key"]),
});
