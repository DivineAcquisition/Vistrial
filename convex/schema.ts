import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { assetStatus } from "./lib/assetStatus";
import { factSourceType, factStatus, feedbackKind } from "./lib/factShapes";
import { approvalKind, approvalStatus, briefingKind, expectedReturn, proposedBy, taskEvidence, taskStatus, taskTry, taskWork } from "./lib/taskShapes";
import { folder as playbookFolder, itemSource, itemStatus, kind as playbookKind, lessonSource, lessonStatus, objectionTag, stage as playbookStage } from "./lib/playbook";
import { availability, basis, classification, embed, platform, projectStatus, sourceKind, sourceState } from "./lib/researchShapes";

/** What a credit charge paid for: the `source` of a ledger row. */
const ledgerSource = v.union(v.literal("run"), v.literal("followup"), v.literal("intake"), v.literal("file"), v.literal("creative"), v.literal("page"));

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
/**
 * Owner, Admin, Member, Viewer. "manager" and "rep" are the words rows held before; they stay valid until
 * organizationsMigration reports none left on every deployment. Read a role through roleOf (lib/roles.ts).
 */
const memberRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
  v.literal("viewer"),
  v.literal("manager"),
  v.literal("rep"),
);
/** One number Home showed a person: whose it is ("own" or a client id), what it counts, and its value then. */
const homeFigure = v.object({ scope: v.string(), key: v.string(), label: v.string(), value: v.number(), unit: v.string() });
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
const inviteRole = v.union(v.literal("admin"), v.literal("member"), v.literal("viewer"), v.literal("manager"), v.literal("rep"));
const stage = v.union(v.literal("foundation"), v.literal("organization"), v.literal("execution"));
const agentState = v.union(v.literal("off"), v.literal("suggesting"), v.literal("on"));
/** One part of the first package: where it is, its run and report, and what it has cost us. */
const packagePart = v.object({
  state: v.union(v.literal("waiting"), v.literal("running"), v.literal("done"), v.literal("needsReview"), v.literal("failed"), v.literal("skipped")),
  runId: v.optional(v.id("agentRuns")),
  assetId: v.optional(v.id("assets")),
  projectId: v.optional(v.id("researchProjects")),
  requestId: v.optional(v.id("teardownRequests")),
  attempts: v.number(),
  spentCents: v.number(),
  /** Why it did not finish, in a code: no_pages, no_research, cap, failed, timeout. */
  reason: v.optional(v.string()),
});

export default defineSchema({
  /**
   * The paying customer: who is billed, and whose credits every organization under it spends. An
   * organization is a row in `workspaces` (the table keeps its name; only the word on screen changed).
   */
  accounts: defineTable({
    name: v.string(),
    /**
     * The customer id used with Autumn. For an account made from a workspace that existed before accounts
     * did, this is that workspace's id, so the customer Autumn already holds is reused and nothing moves.
     */
    billingCustomerId: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    /**
     * An organization the Owner confirmed the price of and is paying for at checkout. It is created when
     * the payment shows on the account, so an organization never exists unpaid.
     */
    pendingOrganization: v.optional(v.object({ name: v.string(), requestedBy: v.string(), requestedAt: v.number() })),
    /** The extra-organization add-on was told to end at the next renewal, because the last extra one was archived. */
    extraEndsAtRenewal: v.optional(v.boolean()),
  }),

  /** A person on an account. What they can open is a `members` row in each organization they were given. */
  accountMembers: defineTable({
    accountId: v.id("accounts"),
    userId: v.string(),
    /** "owner" manages billing and organizations, and is an Owner in every organization of the account. */
    role: v.union(v.literal("owner"), v.literal("member")),
    displayName: v.string(),
    email: v.optional(v.string()),
    active: v.boolean(),
    removedAt: v.optional(v.number()),
  })
    .index("by_account", ["accountId"])
    .index("by_user", ["userId"])
    .index("by_account_user", ["accountId", "userId"]),

  /**
   * Someone an organization serves. A business client has a company profile, a brand kit, offers and ad
   * results; a person client has their goals, where they are now, and notes. Clients do not log in.
   * Work with no client is the organization's own.
   */
  clients: defineTable({
    workspaceId: v.id("workspaces"),
    type: v.union(v.literal("business"), v.literal("person")),
    name: v.string(),
    /** Lower case, single spaces: so the same client is not added twice. */
    normalizedName: v.string(),
    status: v.union(v.literal("active"), v.literal("archived")),
    archivedAt: v.optional(v.number()),
    business: v.optional(
      v.object({ website: v.string(), industry: v.string(), offer: v.string(), audience: v.string(), geography: v.string(), notes: v.string() }),
    ),
    person: v.optional(v.object({ goals: v.string(), currentState: v.string(), notes: v.string() })),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId", "status", "updatedAt"]),

  /** A Member or Viewer may see this client. Owners and Admins see every client and need no row. */
  clientAssignments: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.id("clients"),
    memberId: v.id("members"),
    assignedBy: v.string(),
    assignedAt: v.number(),
  })
    .index("by_workspace_member", ["workspaceId", "memberId"])
    .index("by_workspace_client", ["workspaceId", "clientId"]),

  /** An organization: one of the account owner's own businesses. */
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    timezone: v.string(),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    /** The account it belongs to. Missing only until organizationsMigration has reached the row. */
    accountId: v.optional(v.id("accounts")),
    /** When an Owner archived it, and who. It is read-only until it is brought back. */
    archivedAt: v.optional(v.number()),
    archivedBy: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_account", ["accountId"]),

  /**
   * A download of one organization's work, started by an Owner and built in the background. The file is
   * kept for a week, then removed; the row stays as the record that an export was made.
   */
  organizationExports: defineTable({
    workspaceId: v.id("workspaces"),
    requestedBy: v.string(),
    status: v.union(v.literal("building"), v.literal("ready"), v.literal("failed"), v.literal("expired")),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    storageId: v.optional(v.id("_storage")),
    bytes: v.optional(v.number()),
    records: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId", "createdAt"])
    .index("by_status_expires", ["status", "expiresAt"]),

  /**
   * Material an Owner copied in from another organization of the same account, for this organization's
   * agents to read. A snapshot: it never changes when the original does, it is read-only here, and
   * removing it deletes only this copy. It is reference, never a fact about this business.
   */
  sharedReferences: defineTable({
    workspaceId: v.id("workspaces"),
    fromWorkspaceId: v.id("workspaces"),
    /** The other organization's name on the day of the copy, shown as where this came from. */
    fromName: v.string(),
    sourceAssetId: v.id("assets"),
    sourceVersion: v.number(),
    kind: v.string(),
    title: v.string(),
    body: v.string(),
    /** The original was longer than a copy may be, so this one stops early. */
    cut: v.optional(v.boolean()),
    copiedBy: v.string(),
    copiedByName: v.string(),
    copiedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId", "copiedAt"])
    .index("by_workspace_source", ["workspaceId", "sourceAssetId"]),

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
    /**
     * For a Member or Viewer: may they see the organization's own work (records with no client)?
     * Missing means yes, so nobody lost sight of anything when clients arrived. Owners and Admins always may.
     */
    ownWork: v.optional(v.boolean()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"])
    /** Lets the role backfill see whether any old word is left without reading every member. */
    .index("by_role", ["role"]),

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
    accountId: v.optional(v.id("accounts")),
    /**
     * Every organization the invite opens, with the role in each. `workspaceId` and `role` above are the
     * first of them. Missing on an invite made before a person could be given several.
     */
    grants: v.optional(v.array(v.object({ workspaceId: v.id("workspaces"), role: inviteRole }))),
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
    /** The account's first organization: the row was keyed by it before accounts existed. */
    workspaceId: v.id("workspaces"),
    /** The account whose balance this is. Every organization of the account reads and spends this one row. */
    accountId: v.optional(v.id("accounts")),
    /** How many organizations beyond the first are paid for ($99 a month and $50 of credits each). */
    extraOrganizations: v.optional(v.number()),
    balanceCents: v.number(),
    planId: v.optional(v.string()),
    planStatus: v.optional(v.string()),
    nextResetAt: v.optional(v.number()),
    autoRefill: v.optional(v.object({ enabled: v.boolean(), thresholdCents: v.number(), amountCents: v.number() })),
    /** Credits bought in packs, as Autumn reports its top-up purchases. Missing until a refresh has seen them. */
    packsCents: v.optional(v.number()),
    refreshedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_account", ["accountId"]),

  /** Every charge for AI work: what it really cost, the markup, and what the customer paid. */
  billingLedger: defineTable({
    /** The organization that spent. The balance it came from is its account's. */
    workspaceId: v.id("workspaces"),
    /** The client the work was for, when it was for one: so the cost of serving a client can be measured. */
    clientId: v.optional(v.id("clients")),
    source: ledgerSource,
    ref: v.string(),
    costCents: v.number(),
    priceCents: v.number(),
    markup: v.number(),
    at: v.number(),
    /** Set once Autumn has the usage. Unsynced rows are retried. */
    syncedAt: v.optional(v.number()),
    syncError: v.optional(v.string()),
    /**
     * Who and what the charge was for, read from `ref` when it was written (lib/usage.ts). Rows from before
     * 2026-11-13 lack these; the usage backfill reads them from `ref` instead. docs/rebuild/usage-page.md.
     */
    startedBy: v.optional(v.string()),
    agentSlug: v.optional(v.string()),
    skillSlug: v.optional(v.string()),
    /** The model id that did this step. Missing for tool calls and page reading, and on older rows. */
    model: v.optional(v.string()),
    /** Already folded into `usageItems` when it was written. The backfill skips these. */
    inUsage: v.optional(v.boolean()),
  })
    .index("by_workspace_at", ["workspaceId", "at"])
    .index("by_synced", ["syncedAt"]),

  /**
   * What the usage page reads: everything one piece of work (a run, a chat, an image...) spent on one UTC day
   * on one model, in credits. Kept in step with the ledger by chargeUsage. Holds no cost and no markup, so
   * nothing read from it can show what Vistrial pays. docs/rebuild/usage-page.md, section 3.2.
   */
  usageItems: defineTable({
    workspaceId: v.id("workspaces"),
    source: ledgerSource,
    ref: v.string(),
    /** "2026-11-13", UTC: the same day key as the caps (lib/caps.ts). */
    day: v.string(),
    /** The model id, or "" for tools and page reading, and for older charges whose model was not kept. */
    model: v.string(),
    priceCents: v.number(),
    charges: v.number(),
    firstAt: v.number(),
    lastAt: v.number(),
    startedBy: v.optional(v.string()),
    agentSlug: v.optional(v.string()),
    skillSlug: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    /** What the work was, in a few words, for the list of work. */
    title: v.optional(v.string()),
    /** Written by the backfill from an older ledger row. */
    backfilled: v.optional(v.boolean()),
  })
    .index("by_workspace_day", ["workspaceId", "day"])
    .index("by_workspace_person_day", ["workspaceId", "startedBy", "day"])
    .index("by_key", ["workspaceId", "source", "ref", "day", "model"]),

  /**
   * A new customer's way in: the wizard before paying (about you, the business, what you sell, your goal),
   * the free research session, paying, and the guided chat after. Keyed by the person; the workspace is
   * created when the wizard finishes, so nothing typed is ever asked again.
   */
  onboarding: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    stage: v.union(
      v.literal("website"),
      v.literal("connect"),
      v.literal("confirm"),
      v.literal("package"),
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
    /** The reading of the business's website from step 1. */
    captureId: v.optional(v.id("siteCaptures")),
    /** The pages (capture page ids) the person chose for the first teardown, at most five. */
    teardownPages: v.optional(v.array(v.string())),
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
    /**
     * Agent work that may use more credits than this waits for an Owner or Admin. In credits. Missing means
     * no limit of this kind: the agent caps alone apply. Set in Settings by an Owner or Admin.
     */
    spendApprovalCredits: v.optional(v.number()),
    /** The weekly plan of proposed tasks and the weekly growth report. Missing means on. They use credits. */
    weeklyPlan: v.optional(v.boolean()),
    /** Posts about changes in the organization's industry, read from the web. Missing means off. They use credits. */
    trendPosts: v.optional(v.boolean()),
    /** An Owner stopped every CRM action across the organization, whatever each connection allows. Missing means not stopped. */
    crmActingOff: v.optional(v.boolean()),
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
    /**
     * The model this member last chose, per kind of work (lib/modelChoice.ts `ChoiceGroup`): a model id from
     * lib/models.ts, and for images a family. Their next piece of that kind of work starts on it. Missing means the platform's route.
     */
    models: v.optional(v.object({ text: v.optional(v.string()), search: v.optional(v.string()), read: v.optional(v.string()), /** The family last chosen for making images: gemini or gpt. */ image: v.optional(v.string()) })),
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
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
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
    /** The model family chosen for this: claude, gpt or gemini (lib/models.ts). Missing means the platform's own route. */
    modelChoice: v.optional(v.string()),
    /** The model that did the writing, stored when it ran. Missing on records from before this was kept: a screen then shows nothing. */
    madeWith: v.optional(v.object({ provider: v.string(), model: v.string() })),
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
    /** The first package this run is part of. Its runs are free and never count against the organization's day caps. */
    packageId: v.optional(v.id("firstPackages")),
    /** A lower per-run cap, in cents of our cost: what is left of the first package's limit for this part. */
    capCentsOverride: v.optional(v.number()),
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
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
    kind: v.union(
      v.literal("researchReport"),
      v.literal("marketReport"),
      v.literal("offerAnalysis"),
      v.literal("adCopySet"),
      v.literal("creativeBrief"),
      v.literal("contentCalendar"),
      v.literal("swipeItem"),
      v.literal("growthDiagnosis"),
      v.literal("pageTeardown"),
      /** A landing page Vistrial built for a business, to the owner's framework (Landing Page Build). */
      v.literal("landingPage"),
      /** Where a sales pipeline's deals stop moving, from the CRM's own figures (Dealmaker, Pipeline Forensics). */
      v.literal("pipelineReview"),
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
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
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
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
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
    itemKind: v.optional(v.union(v.literal("offerChange"), v.literal("roadmapStep"), v.literal("pageChange"))),
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
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
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
    /** "site": the offer as the business's own website states it, from a site capture. */
    origin: v.union(v.literal("person"), v.literal("chat"), v.literal("analysis"), v.literal("site")),
    captureId: v.optional(v.id("siteCaptures")),
    /** The offer analysis this version came from, when it came from one. */
    assetId: v.optional(v.id("assets")),
    note: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_workspace_card", ["workspaceId", "cardId", "version"]),

  /**
   * A brand a creative is made for: the workspace's own (one), or a client's. Its content lives in versions,
   * so an approved creative can say which version of the kit it used.
   */
  brandKits: defineTable({
    workspaceId: v.id("workspaces"),
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
    kind: v.union(v.literal("own"), v.literal("client")),
    name: v.string(),
    currentVersion: v.number(),
    archived: v.optional(v.boolean()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId", "updatedAt"])
    /** Lets the client backfill find client kits that are not linked to a client yet. */
    .index("by_kind_client", ["kind", "clientId"]),

  /** One version of a brand kit. Never overwritten: a change is a new version. */
  brandKitVersions: defineTable({
    workspaceId: v.id("workspaces"),
    kitId: v.id("brandKits"),
    version: v.number(),
    name: v.string(),
    website: v.string(),
    industry: v.string(),
    colors: v.array(v.object({ label: v.string(), hex: v.string() })),
    headingFont: v.string(),
    bodyFont: v.string(),
    imageStyle: v.string(),
    tone: v.string(),
    useWords: v.array(v.string()),
    avoidWords: v.array(v.string()),
    examples: v.array(v.string()),
    disclaimers: v.array(v.string()),
    regulated: v.union(v.literal("none"), v.literal("health"), v.literal("finance"), v.literal("other")),
    bannedTopics: v.array(v.string()),
    placements: v.array(v.string()),
    /** The real logo files. Creative Production places these on top of an image; it never generates a logo. */
    logos: v.array(v.object({ storageId: v.id("_storage"), variant: v.union(v.literal("light"), v.literal("dark"), v.literal("icon")), name: v.string() })),
    /** A person confirmed the business owns the logos or may use them. */
    logosOwned: v.boolean(),
    /** Ads the brand ran itself, as pictures of its look. Missing on kits saved before these existed. */
    styleRefs: v.optional(v.array(v.object({ storageId: v.id("_storage"), name: v.string() }))),
    styleRefsOwned: v.optional(v.boolean()),
    note: v.optional(v.string()),
    /** "site" when the version was written from a site capture. Missing means a person wrote it. */
    origin: v.optional(v.union(v.literal("person"), v.literal("site"))),
    captureId: v.optional(v.id("siteCaptures")),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_workspace_kit", ["workspaceId", "kitId", "version"]),

  /**
   * One reading of a business's website (the organization's own, or a Client's): the pages found and read,
   * and what they say about the brand, the offers and the business, each with where it was found. Nothing
   * captured is used until a person applies it (Settings › Brand, or onboarding's Confirm step).
   * docs/rebuild/onboarding-and-first-package.md, part 1.
   */
  siteCaptures: defineTable({
    workspaceId: v.id("workspaces"),
    /** The client whose site this is. Missing means the organization's own. */
    clientId: v.optional(v.id("clients")),
    /** The site's home page, as read. */
    url: v.string(),
    status: v.union(v.literal("reading"), v.literal("understanding"), v.literal("done"), v.literal("partial"), v.literal("failed")),
    /** Where it is: home, pages, brand, words, done. The screens show progress from it. */
    step: v.string(),
    homeJobId: v.optional(v.id("pageReadJobs")),
    pagesJobId: v.optional(v.id("pageReadJobs")),
    /** Every page read or found, with what it is for. */
    pages: v.array(
      v.object({
        id: v.string(),
        url: v.string(),
        kind: v.string(),
        title: v.string(),
        read: v.boolean(),
        reason: v.optional(v.string()),
        readId: v.optional(v.id("pageReads")),
      }),
    ),
    /** What was found, as lib/siteCapture/fields.ts CaptureResult (JSON). Set when it is done. */
    result: v.optional(v.string()),
    /** The logo file found on the site. Used only once a person confirms the business may use it. */
    logoStorageId: v.optional(v.id("_storage")),
    /** Why it ended early, as a page reader reason code. */
    reasonCode: v.optional(v.string()),
    /** Items the model gave that the pages do not say. Dropped; kept as a count. */
    dropped: v.number(),
    /** What it cost us, in cents. */
    costCents: v.number(),
    /** On Vistrial (the organization's first capture): nothing is charged. Otherwise charged once, when it ends. */
    free: v.boolean(),
    startedBy: v.string(),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
    appliedAt: v.optional(v.number()),
    appliedBy: v.optional(v.string()),
  }).index("by_workspace_client", ["workspaceId", "clientId", "createdAt"]),

  /**
   * A reference ad a person added themselves: a public YouTube link, or a video or image file they uploaded.
   * Only its breakdown is kept. An uploaded file is deleted as soon as it is read; a video is never
   * downloaded from a platform.
   */
  creativeReferences: defineTable({
    workspaceId: v.id("workspaces"),
    origin: v.union(v.literal("link"), v.literal("upload")),
    platform: v.string(),
    mediaKind: v.union(v.literal("video"), v.literal("image")),
    url: v.optional(v.string()),
    /** The uploaded file, until it is read. Cleared when the file is deleted. */
    storageId: v.optional(v.id("_storage")),
    contentType: v.optional(v.string()),
    title: v.string(),
    status: v.union(v.literal("analysing"), v.literal("ready"), v.literal("failed")),
    failCode: v.optional(v.string()),
    breakdown: v.optional(
      v.object({
        title: v.string(),
        advertiser: v.string(),
        lengthSeconds: v.number(),
        format: v.string(),
        hook: v.object({ type: v.string(), words: v.string() }),
        beats: v.array(v.object({ seconds: v.string(), what: v.string() })),
        onScreenText: v.array(v.string()),
        spoken: v.string(),
        offer: v.string(),
        cta: v.object({ words: v.string(), placement: v.string() }),
        audience: v.string(),
      }),
    ),
    costCents: v.number(),
    /** Who confirmed they may submit an uploaded file, and when. */
    attestedBy: v.optional(v.string()),
    attestedAt: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId", "createdAt"]),

  /**
   * An approved ad set the business is running, and which variation won. Figures are read from its own
   * Meta results and results files when it starts and again when the outcome is recorded. The next ad set
   * for the same brand reads the outcome. One per ad set.
   */
  creativeTests: defineTable({
    workspaceId: v.id("workspaces"),
    assetId: v.id("assets"),
    kitId: v.id("brandKits"),
    /** The ad set's title when it started running, so the record reads the same if the set is renamed. */
    title: v.string(),
    checkInAt: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    baseline: v.array(decisionFigures),
    outcome: v.optional(
      v.object({
        result: decisionResult,
        /** The variation that did best, as it was written. Missing when none stood out or it was not run. */
        winner: v.optional(v.object({ key: v.string(), hookType: v.string(), hook: v.string(), headline: v.string() })),
        /** The owner's own words, 500 characters at most. Stays in this workspace. */
        note: v.string(),
        after: v.array(decisionFigures),
        recordedAt: v.number(),
        recordedBy: v.string(),
      }),
    ),
  })
    .index("by_workspace", ["workspaceId", "checkInAt"])
    .index("by_workspace_asset", ["workspaceId", "assetId"])
    .index("by_workspace_kit", ["workspaceId", "kitId", "createdAt"]),

  /**
   * One image made for one variation of an ad set, in one placement. A designed ad carries its words in the
   * picture, checked after it is made. A photo carries none: the headline and the brand's real logo file
   * are placed on top when it is shown and downloaded.
   */
  creativeImages: defineTable({
    workspaceId: v.id("workspaces"),
    assetId: v.id("assets"),
    variationKey: v.string(),
    placement: v.string(),
    /** "designed": the words are part of the picture. "photo" (or missing): the words are placed on top. */
    look: v.optional(v.union(v.literal("designed"), v.literal("photo"))),
    tone: v.optional(v.union(v.literal("dark"), v.literal("light"))),
    /** "fresh": a new layout, with none of the brand's past ads shown to the image model. Missing or "brand": follows them. */
    style: v.optional(v.union(v.literal("brand"), v.literal("fresh"))),
    /** The words in this picture were edited after it was made, so it no longer matches the copy. Cleared when it is made again. */
    stale: v.optional(v.boolean()),
    status: v.union(v.literal("generating"), v.literal("ready"), v.literal("failed")),
    storageId: v.optional(v.id("_storage")),
    failCode: v.optional(v.string()),
    model: v.string(),
    /** How it was made: "google" (direct) or "openrouter". Stored when it is made; missing on older images. */
    provider: v.optional(v.string()),
    /** What OpenRouter reported this image cost, in cents, kept to compare with the price charged. Missing when made directly. */
    reportedCents: v.optional(v.number()),
    /** What the image cost us once it was delivered. Zero for one that failed. */
    costCents: v.number(),
    /** The price held from the balance while it is being made, so two batches cannot spend the same credit. */
    holdCents: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_workspace_asset", ["workspaceId", "assetId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace", ["workspaceId", "createdAt"]),

  /**
   * One ask of Creative Production: the brand it is for, the reference ad or offer it starts from, and how
   * closely to follow the reference. The run reads it; the saved creative is linked back here.
   */
  creativeRequests: defineTable({
    workspaceId: v.id("workspaces"),
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
    kitId: v.id("brandKits"),
    /** The kit version read when the request was made, so the creative says which one it used. */
    kitVersion: v.number(),
    /** The reference ad: a source research collected. Its structure is modelled; nothing of it is reused. */
    sourceRefId: v.optional(v.id("sourceRefs")),
    /** The reference ad, when the person added it themselves as a link or a file. */
    referenceId: v.optional(v.id("creativeReferences")),
    offerCardId: v.optional(v.id("offerCards")),
    offerVersion: v.optional(v.number()),
    dial: v.union(v.literal("inspired"), v.literal("structure"), v.literal("close")),
    note: v.optional(v.string()),
    runId: v.optional(v.id("agentRuns")),
    assetId: v.optional(v.id("assets")),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId", "createdAt"])
    .index("by_workspace_run", ["workspaceId", "runId"]),

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
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
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
    /** Agents granted use of these figures. Missing means the Strategist only. */
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
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
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
    /** Agents granted use of this workspace connection. Missing means the Strategist only. */
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
   * A read-only CRM connection: one HighLevel sub-account (location) for one client, or for the organization
   * itself when `clientId` is missing. Tokens are server-only: no public function returns them.
   * docs/rebuild/crm-highlevel.md.
   */
  crmConnections: defineTable({
    workspaceId: v.id("workspaces"),
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
    provider: v.literal("highlevel"),
    status: v.union(v.literal("connected"), v.literal("needsReconnect")),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiresAt: v.number(),
    /** Set while a token renewal is in flight: HighLevel's renewal tokens work once. */
    refreshingSince: v.optional(v.number()),
    scopes: v.array(v.string()),
    /** The HighLevel location id, its name, and the agency it belongs to. */
    accountId: v.string(),
    accountName: v.string(),
    companyId: v.optional(v.string()),
    currency: v.string(),
    timezone: v.optional(v.string()),
    connectedBy: v.string(),
    connectedAt: v.number(),
    /** When HighLevel stopped accepting the connection. After 30 days it is removed with its data. */
    needsReconnectSince: v.optional(v.number()),
    lastSyncAt: v.optional(v.number()),
    lastSyncCode: v.optional(v.string()),
    callsOk: v.number(),
    callsFailed: v.number(),
    /** An Owner let Vistrial act in this sub-account, each action still approved by a person. Missing means off. */
    actingEnabled: v.optional(v.boolean()),
    actingChangedBy: v.optional(v.string()),
    actingChangedAt: v.optional(v.number()),
    /**
     * Messaging leads, separate from acting and off by default. Turning it on records which Owner confirmed,
     * and when, that the business has the leads' consent to be texted and emailed.
     */
    messagingEnabled: v.optional(v.boolean()),
    consentAttestedBy: v.optional(v.string()),
    consentAttestedAt: v.optional(v.number()),
  })
    .index("by_workspace_client", ["workspaceId", "clientId"])
    .index("by_account", ["provider", "accountId"]),

  /** One CRM sign-in attempt: bound to a workspace, a client and an Owner, used once, ten minutes. */
  crmOauthStates: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    userId: v.string(),
    provider: v.literal("highlevel"),
    nonce: v.string(),
    returnOrigin: v.optional(v.string()),
    returnPath: v.optional(v.string()),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_nonce", ["nonce"]),

  /** A CRM pipeline and its stages, replaced each read. */
  crmPipelines: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    connectionId: v.id("crmConnections"),
    externalId: v.string(),
    name: v.string(),
    stages: v.array(v.object({ id: v.string(), name: v.string(), position: v.number() })),
    seenAt: v.number(),
  }).index("by_connection", ["connectionId", "externalId"]),

  /** A deal (HighLevel opportunity). Not its name, notes, tasks or custom fields. */
  crmDeals: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    connectionId: v.id("crmConnections"),
    externalId: v.string(),
    pipelineId: v.string(),
    stageId: v.string(),
    status: v.union(v.literal("open"), v.literal("won"), v.literal("lost"), v.literal("abandoned")),
    value: v.number(),
    source: v.optional(v.string()),
    contactId: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    lastStageChangeAt: v.optional(v.number()),
    lastStatusChangeAt: v.optional(v.number()),
    seenAt: v.number(),
  }).index("by_connection", ["connectionId", "externalId"]),

  /** A lead: name, email, phone, source, up to ten tags, when added. Personal data of the customer's leads. */
  crmContacts: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    connectionId: v.id("crmConnections"),
    externalId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
    tags: v.array(v.string()),
    addedAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
    seenAt: v.number(),
  }).index("by_connection", ["connectionId", "externalId"]),

  /** Something that happened to a lead. Facts only: never a message body, subject, recording or transcript. */
  crmActivities: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    connectionId: v.id("crmConnections"),
    externalId: v.string(),
    kind: v.union(
      v.literal("call"),
      v.literal("sms"),
      v.literal("email"),
      v.literal("chat"),
      v.literal("social"),
      v.literal("appointment"),
      v.literal("stage_change"),
      v.literal("status_change"),
    ),
    direction: v.optional(v.union(v.literal("inbound"), v.literal("outbound"))),
    at: v.number(),
    contactId: v.optional(v.string()),
    dealId: v.optional(v.string()),
    status: v.optional(v.string()),
    seconds: v.optional(v.number()),
    fromStage: v.optional(v.string()),
    toStage: v.optional(v.string()),
  })
    .index("by_connection", ["connectionId", "externalId"])
    .index("by_connection_at", ["connectionId", "at"]),

  /** What the last read added up to: pipeline counts, won revenue, lead sources, activity. Computed in code. */
  crmSummaries: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    connectionId: v.id("crmConnections"),
    syncedAt: v.number(),
    /** The `Summary` shape from convex/lib/highLevel.ts. */
    summary: v.any(),
  }).index("by_connection", ["connectionId"]),

  /** One read of a CRM connection, step by step, so the Owner can see what Vistrial did. */
  crmSyncRuns: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    connectionId: v.id("crmConnections"),
    trigger: v.union(v.literal("manual"), v.literal("schedule"), v.literal("connect")),
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
  }).index("by_connection", ["connectionId", "startedAt"]),

  /**
   * One change Vistrial may make in a connected CRM: proposed by an agent or a person, approved by an Owner or
   * Admin (an Owner with a typed word when restricted), carried out once, and kept as the record of who
   * decided. docs/rebuild/crm-highlevel.md, section 2A.
   */
  crmActions: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    connectionId: v.id("crmConnections"),
    kind: v.union(
      v.literal("move_stage"),
      v.literal("set_status"),
      v.literal("add_tag"),
      v.literal("remove_tag"),
      v.literal("add_note"),
      v.literal("create_task"),
      v.literal("send_sms"),
      v.literal("send_email"),
    ),
    dealId: v.optional(v.string()),
    contactId: v.optional(v.string()),
    pipelineId: v.optional(v.string()),
    stageId: v.optional(v.string()),
    status: v.optional(v.string()),
    tag: v.optional(v.string()),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    /** What was there before, so the action can be undone. */
    before: v.optional(v.object({ pipelineId: v.optional(v.string()), stageId: v.optional(v.string()), status: v.optional(v.string()) })),
    /** Owner only, with a typed word: "value" changes a deal's outcome. */
    restricted: v.optional(v.union(v.literal("value"), v.literal("message"))),
    summary: v.string(),
    why: v.string(),
    /** A person's user id, or "agent". */
    proposedBy: v.string(),
    agentSlug: v.optional(v.string()),
    state: v.union(
      v.literal("proposed"),
      v.literal("approved"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
      v.literal("declined"),
      v.literal("expired"),
      v.literal("cancelled"),
    ),
    proposedAt: v.number(),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    doneAt: v.optional(v.number()),
    /** HighLevel's answer as a short code. Never its words. */
    resultCode: v.optional(v.string()),
    /** The id HighLevel gave what was made (a note, a task). */
    externalId: v.optional(v.string()),
    /**
     * For a message: what the checks found just before sending (or refusing), and the consent basis on
     * record. Kept as the record that the lead's opt-out and local time were checked.
     */
    checks: v.optional(
      v.object({
        at: v.number(),
        dnd: v.boolean(),
        timezone: v.optional(v.string()),
        localHour: v.optional(v.number()),
        consent: v.string(),
        result: v.string(),
      }),
    ),
    /** The action this one reverses, and the one that reversed this. */
    undoOf: v.optional(v.id("crmActions")),
    undoneBy: v.optional(v.id("crmActions")),
  })
    .index("by_connection", ["connectionId", "proposedAt"])
    .index("by_connection_state", ["connectionId", "state"]),

  /** CRM API calls per connection per UTC day. */
  crmCallDays: defineTable({
    workspaceId: v.id("workspaces"),
    connectionId: v.id("crmConnections"),
    day: v.string(),
    ok: v.number(),
    failed: v.number(),
  }).index("by_connection_day", ["connectionId", "day"]),

  /**
   * A research intake: the conversation before a session. Slots are filled from business memory, then
   * from what the person says; code decides what is missing. Nothing runs or spends on research until the
   * person presses Start on the plan.
   */
  intakes: defineTable({
    workspaceId: v.id("workspaces"),
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
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
    /** The model family chosen for this: claude, gpt or gemini (lib/models.ts). Missing means the platform's own route. */
    modelChoice: v.optional(v.string()),
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
    context: v.optional(v.object({ kind: v.union(v.literal("asset"), v.literal("offer"), v.literal("task"), v.literal("project")), id: v.string(), title: v.string() })),
    /** The screen the chat was started from, a key of CHAT_PAGES (lib/chatContext.ts). Missing for chats from before the side panel. */
    page: v.optional(v.string()),
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
    /** The model that wrote this turn, when one did. Stored when it ran; missing on older turns and on turns written in code. */
    madeWith: v.optional(v.object({ provider: v.string(), model: v.string() })),
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
    /** The model family chosen for this: claude, gpt or gemini (lib/models.ts). Missing means the platform's own route. */
    modelChoice: v.optional(v.string()),
    /** The model that did the writing, stored when it ran. Missing on records from before this was kept: a screen then shows nothing. */
    madeWith: v.optional(v.object({ provider: v.string(), model: v.string() })),
    costCents: v.number(),
    createdBy: v.string(),
    at: v.number(),
  }).index("by_project", ["projectId", "at"]),

  /**
   * The page reader. A job is a short list of public pages a person asked Vistrial to open; each page is one
   * row with what was found on it. Reading obeys robots.txt and a per-site rate limit, never logs in, and
   * never opens a private address. Page text is untrusted: it is data, never an instruction.
   */
  pageReadJobs: defineTable({
    workspaceId: v.id("workspaces"),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("done"), v.literal("stopped")),
    /** Whether a hosted browser was set up when the job was priced: "browser" reads and takes screenshots. */
    driver: v.union(v.literal("fetch"), v.literal("browser")),
    pages: v.number(),
    /** The most this job can cost, in cents of credit, held from the balance until it finishes. */
    holdCents: v.number(),
    /** What the pages that were read cost us. Charged once, when the job ends. */
    costCents: v.number(),
    /** Set when an agent run asked for these pages: the run carries the cost, so the job charges nothing itself. */
    runId: v.optional(v.id("agentRuns")),
    /** Set when a site capture asked for these pages: the capture carries the cost, so the job charges nothing itself. */
    captureId: v.optional(v.id("siteCaptures")),
    startedBy: v.string(),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId", "createdAt"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  pageReads: defineTable({
    workspaceId: v.id("workspaces"),
    jobId: v.id("pageReadJobs"),
    order: v.number(),
    url: v.string(),
    status: v.union(v.literal("queued"), v.literal("reading"), v.literal("read"), v.literal("partial"), v.literal("blocked"), v.literal("failed")),
    /** Why, as a code. Never page text. */
    reasonCode: v.optional(v.string()),
    finalUrl: v.optional(v.string()),
    httpStatus: v.optional(v.number()),
    driver: v.optional(v.union(v.literal("fetch"), v.literal("browser"))),
    title: v.optional(v.string()),
    /** The page as JSON (see lib/pageReader/extract). Untrusted content. */
    snapshot: v.optional(v.string()),
    /** HTML size after decompression, and as it came over the wire. Not the weight of images or scripts. */
    htmlBytes: v.optional(v.number()),
    wireBytes: v.optional(v.number()),
    redirects: v.optional(v.number()),
    desktopShot: v.optional(v.id("_storage")),
    phoneShot: v.optional(v.id("_storage")),
    durationMs: v.optional(v.number()),
    costCents: v.number(),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_workspace_job", ["workspaceId", "jobId", "order"])
    .index("by_workspace", ["workspaceId", "createdAt"]),

  /**
   * One ask of the Landing Page Teardown skill: the industry, the pages to read (the business's own, others
   * it named, and whether to search for more), and the read job the run made for them.
   */
  teardownRequests: defineTable({
    workspaceId: v.id("workspaces"),
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
    projectId: v.id("researchProjects"),
    industry: v.string(),
    ownUrl: v.optional(v.string()),
    urls: v.array(v.string()),
    /** Search for pages competitors in the industry run, on top of the ones named. */
    find: v.boolean(),
    note: v.optional(v.string()),
    /** Pages the search step added, so a finding can say which pages a person chose and which were found. */
    foundUrls: v.optional(v.array(v.string())),
    /** "ownSite": every page is the business's own (the first package's teardown). No competitor pages, no patterns. */
    mode: v.optional(v.literal("ownSite")),
    jobId: v.optional(v.id("pageReadJobs")),
    runId: v.optional(v.id("agentRuns")),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId", "createdAt"])
    .index("by_workspace_project", ["workspaceId", "projectId"]),

  /**
   * Strategist's first package for an organization: market research, two offer ideas and a teardown of the
   * business's own pages, free, inside a fixed limit of our cost. docs/rebuild/onboarding-and-first-package.md, part 3.
   */
  firstPackages: defineTable({
    workspaceId: v.id("workspaces"),
    accountId: v.optional(v.id("accounts")),
    /** The Owner who confirmed onboarding: emailed when it is ready, and the approver of record. */
    ownerId: v.string(),
    status: v.union(v.literal("waiting"), v.literal("running"), v.literal("done")),
    /** Why it did not run, when it did not: "account_limit". */
    reason: v.optional(v.string()),
    /** The most it may cost us, in cents, all parts together. */
    limitCents: v.number(),
    research: packagePart,
    offers: packagePart,
    /** The page part: a teardown of the business's own pages, or (with no website) a landing page built for it. */
    teardown: packagePart,
    /** Which page part this package has. Missing means a teardown. */
    pagePart: v.optional(v.union(v.literal("teardown"), v.literal("landingPage"))),
    emailedAt: v.optional(v.number()),
    dismissedAt: v.optional(v.number()),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_account", ["accountId"])
    .index("by_status", ["status", "createdAt"])
    .index("by_created", ["createdAt"]),

  /**
   * One row per site the reader has opened, shared by every workspace because the site does not care who
   * asked: when the next request to it may be made, and its robots.txt rules for a day. Holds nothing about
   * any customer.
   */
  pageSites: defineTable({
    site: v.string(),
    nextAt: v.number(),
    robots: v.optional(v.object({ fetchedAt: v.number(), rules: v.string() })),
  }).index("by_site", ["site"]),

  /**
   * Acting inside a customer's own account, with approval (docs/rebuild/browser-with-approval.md). Only the
   * approval surface exists, with a dry-run driver: no real account is opened. A session records that the
   * customer signed in themselves, for one site, in one workspace. It holds no password, cookie or token:
   * a real driver would keep those with the browser vendor, under `vendorRef`.
   */
  browserSessions: defineTable({
    workspaceId: v.id("workspaces"),
    site: v.string(),
    driver: v.literal("dryRun"),
    status: v.union(v.literal("pendingSignIn"), v.literal("active"), v.literal("revoked")),
    /** The vendor's handle for the signed-in browser profile. Never a credential. Unused by the dry run. */
    vendorRef: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    signedInAt: v.optional(v.number()),
    /** After this the customer must sign in again. Checked every time the session is used. */
    expiresAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.string()),
  }).index("by_workspace", ["workspaceId", "createdAt"]),

  browserTasks: defineTable({
    workspaceId: v.id("workspaces"),
    sessionId: v.id("browserSessions"),
    goalKey: v.string(),
    goal: v.string(),
    status: v.union(v.literal("running"), v.literal("waitingApproval"), v.literal("done"), v.literal("stopped")),
    /** Why it stopped, as a code: declined, blocked, revoked, expired, approval_timed_out, stopped, limit. */
    stopReason: v.optional(v.string()),
    steps: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId", "createdAt"])
    .index("by_workspace_session", ["workspaceId", "sessionId"]),

  /** The audit trail: every step an agent took or asked to take in an account, in order, with who decided. */
  browserSteps: defineTable({
    workspaceId: v.id("workspaces"),
    browserTaskId: v.id("browserTasks"),
    sessionId: v.id("browserSessions"),
    index: v.number(),
    kind: v.union(v.literal("read"), v.literal("change"), v.literal("restricted")),
    /** Why it is restricted: payment, security, delete, message or publish. */
    restrictedReason: v.optional(v.string()),
    verb: v.string(),
    target: v.string(),
    url: v.string(),
    /** What was or would be typed, cut short, and hidden if it looks like a secret. */
    value: v.optional(v.string()),
    why: v.string(),
    status: v.union(v.literal("proposed"), v.literal("done"), v.literal("declined"), v.literal("blocked"), v.literal("expired")),
    blockedReason: v.optional(v.string()),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    screenshot: v.optional(v.id("_storage")),
    createdAt: v.number(),
  }).index("by_workspace_task", ["workspaceId", "browserTaskId", "index"]),

  /**
   * A workspace's read-only connection to one outside account besides Meta (Google products, calendars,
   * note takers). One row per workspace and provider. The tokens stay on the server: no public function
   * returns them. Disconnecting deletes the row and every saved read.
   */
  integrationConnections: defineTable({
    workspaceId: v.id("workspaces"),
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
    /** A key from convex/lib/integrations/providers.ts. */
    provider: v.string(),
    status: v.union(v.literal("connected"), v.literal("needsReconnect")),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    scopes: v.array(v.string()),
    /** The provider's own id for the account, and the name shown for it (an email or a display name). */
    accountId: v.string(),
    accountLabel: v.string(),
    connectedBy: v.string(),
    connectedAt: v.number(),
    /** Agents granted use of this connection. Missing means the Strategist only. */
    agents: v.optional(v.array(v.string())),
    lastSyncAt: v.optional(v.number()),
    lastSyncCode: v.optional(v.string()),
    /** Set while a token renewal is in flight, so two reads do not spend a one-use renewal token twice. */
    refreshingSince: v.optional(v.number()),
    /** The unguessable part of this connection's webhook address, and its own signing secret when the provider issues one per subscription. */
    hookId: v.optional(v.string()),
    hookSecret: v.optional(v.string()),
  })
    .index("by_workspace_provider", ["workspaceId", "provider"])
    .index("by_hook", ["hookId"]),

  /** One sign-in attempt: one use, ten minutes, bound to the workspace, the Owner and the provider. */
  integrationOauthStates: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    provider: v.string(),
    nonce: v.string(),
    /** PKCE: kept here and sent only to the provider's token address. */
    codeVerifier: v.optional(v.string()),
    returnOrigin: v.optional(v.string()),
    returnPath: v.optional(v.string()),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_nonce", ["nonce"]),

  /** What was last read through a connection, already reduced to what Vistrial keeps. Deleted on disconnect. */
  integrationSnapshots: defineTable({
    workspaceId: v.id("workspaces"),
    provider: v.string(),
    /** What the read is, such as "bookings". */
    kind: v.string(),
    syncedAt: v.number(),
    data: v.any(),
  }).index("by_workspace_provider", ["workspaceId", "provider", "kind"]),

  /**
   * A call transcript the workspace uploaded or pasted, from any note taker. Text only: no audio or video.
   * The customer's own data, kept until someone in the workspace deletes it.
   */
  callTranscripts: defineTable({
    workspaceId: v.id("workspaces"),
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
    title: v.string(),
    /** The tool it came from, in the person's words. */
    tool: v.string(),
    /** The day of the call, YYYY-MM-DD. */
    callDate: v.optional(v.string()),
    text: v.string(),
    words: v.number(),
    addedBy: v.string(),
    createdAt: v.number(),
    /** When the person adding it confirmed the call was recorded lawfully and may be shared. */
    consentConfirmedAt: v.number(),
    /** Agents granted use of this transcript. Missing means the Strategist only. */
    agents: v.optional(v.array(v.string())),
    /**
     * The lead the call was with, as the connected CRM's own ids. A person chooses it; Vistrial never links a
     * call to a lead on its own. Missing means not linked.
     */
    crmContactRef: v.optional(v.string()),
    crmDealRef: v.optional(v.string()),
  }).index("by_workspace", ["workspaceId"]),

  /** Webhook deliveries that passed their signature check: which, when and what kind. Never the body. */
  integrationWebhookEvents: defineTable({
    workspaceId: v.id("workspaces"),
    provider: v.string(),
    deliveryId: v.string(),
    eventType: v.string(),
    receivedAt: v.number(),
  })
    .index("by_provider_delivery", ["provider", "deliveryId"])
    .index("by_workspace_provider", ["workspaceId", "provider", "receivedAt"]),

  /**
   * Work an agent proposes and a person approves, with what it is expected to return, what it would cost in
   * credits and the evidence behind it. Not the `tasks` table, which is a sales follow-up list tied to leads.
   * A task is either work for an agent (`work`) or a change the organization makes itself (`try`).
   */
  agentTasks: defineTable({
    workspaceId: v.id("workspaces"),
    /** The client this is for. Missing means the organization itself. */
    clientId: v.optional(v.id("clients")),
    title: v.string(),
    why: v.string(),
    proposedBy,
    /** The agent that would do the work. Missing for a change the organization makes itself. */
    agentSlug: v.optional(v.string()),
    work: v.optional(taskWork),
    try: v.optional(taskTry),
    status: taskStatus,
    expectedReturn,
    /** The most credits the work is expected to use, shown before approval. Zero when no agent does anything. */
    creditCost: v.number(),
    evidence: v.array(taskEvidence),
    /** Which plan proposed it ("week:2026-W46") or the change that did ("change:<record id>"), so neither is proposed twice. */
    planKey: v.optional(v.string()),
    approvalId: v.optional(v.id("approvals")),
    /** The conversation the agent's work started in, the run it became, and the decision its result is measured through. */
    intakeId: v.optional(v.id("intakes")),
    runId: v.optional(v.id("agentRuns")),
    decisionId: v.optional(v.id("decisions")),
    /** Why a person skipped it, in their words. */
    skippedReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId", "createdAt"])
    .index("by_workspace_status", ["workspaceId", "status", "updatedAt"])
    .index("by_workspace_plan", ["workspaceId", "planKey"])
    .index("by_workspace_run", ["workspaceId", "runId"])
    .index("by_workspace_decision", ["workspaceId", "decisionId"]),

  /** A note a person keeps for themselves on the Tasks board. Only its author reads it, whatever their role. */
  personalNotes: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    clientId: v.optional(v.id("clients")),
    body: v.string(),
    done: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace_user", ["workspaceId", "userId", "createdAt"]),

  /**
   * One decision about one thing, asked of an Owner or Admin: something going public, spending above the
   * organization's limit, a change inside a connected account, housekeeping, or a task an agent wants to
   * run. Asset review and browser steps keep their own rows and write one of these alongside, so there is
   * one queue and one record of who decided and when. The rule is in lib/approvals.ts.
   */
  approvals: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    kind: approvalKind,
    /** What is being decided: the table and id of the asset, browser step, agent task and so on. */
    subjectTable: v.string(),
    subjectId: v.string(),
    summary: v.string(),
    /** The credits at stake, for spending and for a task with a cost. */
    credits: v.optional(v.number()),
    /** Only an Owner may decide it (a restricted step in a connected account). */
    ownerOnly: v.optional(v.boolean()),
    agentSlug: v.optional(v.string()),
    status: approvalStatus,
    /** A person's user id, or "agent" when an agent's work asked. */
    requestedBy: v.string(),
    requestedAt: v.number(),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    /** The run an approved spend was used for. One approval covers one run. */
    usedByRun: v.optional(v.id("agentRuns")),
  })
    .index("by_workspace_status", ["workspaceId", "status", "requestedAt"])
    .index("by_subject", ["workspaceId", "subjectTable", "subjectId"]),

  /**
   * The Briefing: a feed of what needs a decision, what finished, what changed and what to read. `ref` is
   * the record a post is about; `key` stops the same alert or report being posted twice.
   */
  briefingItems: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    kind: briefingKind,
    agentSlug: v.optional(v.string()),
    title: v.string(),
    body: v.optional(v.string()),
    refTable: v.optional(v.string()),
    refId: v.optional(v.string()),
    approvalId: v.optional(v.id("approvals")),
    /** Where a trend post was read. Shown as links; never followed as instructions. */
    sources: v.optional(v.array(v.object({ title: v.string(), url: v.string() }))),
    /** What writing the post used, in credits (the weekly report, a trend post). */
    credits: v.optional(v.number()),
    /**
     * The post in three short rows: what changed, what it means, what to do. Only on posts whose words are
     * written in code (alerts), never on a post a model wrote. `firstParty` marks a "changed" row that states
     * the business's own figures. Older posts have none and show their body.
     */
    digest: v.optional(v.object({ changed: v.string(), means: v.string(), todo: v.string(), firstParty: v.optional(v.boolean()) })),
    key: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_workspace_at", ["workspaceId", "at"])
    .index("by_workspace_key", ["workspaceId", "key"])
    .index("by_workspace_approval", ["workspaceId", "approvalId"]),

  /**
   * When a person last opened the Briefing and Home in an organization, and the figures Home showed them
   * then, so "since you were last here" compares two readings and never a remembered one.
   */
  memberVisits: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    briefingSeenAt: v.optional(v.number()),
    homeSeenAt: v.optional(v.number()),
    /** The visit before this one: the moment "since you were last here" counts from. */
    homePreviousAt: v.optional(v.number()),
    homeFigures: v.optional(v.array(homeFigure)),
    homePreviousFigures: v.optional(v.array(homeFigure)),
  }).index("by_workspace_user", ["workspaceId", "userId"]),

  /**
   * One item in Dealmaker's Playbook (docs/rebuild/dealmaker.md, 0.7): one per organization (no `clientId`)
   * and one per client. Its evidence label comes from its source, set in code (lib/playbook.ts). Archived,
   * never deleted, so what a draft used can still be shown.
   */
  playbookItems: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    folder: playbookFolder,
    kind: playbookKind,
    /** Only on a script step: the call stage it belongs to. */
    stage: v.optional(playbookStage),
    /** Only on an objection. */
    tag: v.optional(objectionTag),
    title: v.string(),
    body: v.string(),
    source: itemSource,
    basis,
    status: itemStatus,
    createdBy: v.string(),
    createdAt: v.number(),
    updatedBy: v.optional(v.string()),
    updatedAt: v.number(),
    archivedBy: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
  }).index("by_workspace_client", ["workspaceId", "clientId", "folder"]),

  /** "What I've learned about how you sell": proposed until a person approves it; only approved ones guide drafts. */
  playbookLessons: defineTable({
    workspaceId: v.id("workspaces"),
    clientId: v.optional(v.id("clients")),
    text: v.string(),
    source: lessonSource,
    /** The draft or approval the lesson came from, when it came from one. */
    sourceRef: v.optional(v.string()),
    status: lessonStatus,
    /** A user id, or "agent" for Dealmaker. */
    proposedBy: v.string(),
    proposedAt: v.number(),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_workspace_client", ["workspaceId", "clientId", "proposedAt"]),

  platformControls: defineTable({
    key: v.literal("platform"),
    halted: v.boolean(),
  }).index("by_key", ["key"]),
});
