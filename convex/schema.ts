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
});
