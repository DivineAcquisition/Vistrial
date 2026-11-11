/**
 * The four roles inside an organization, and the only place that knows the three they replaced.
 * Owner: billing and everything. Admin: runs the organization, approves, connects accounts.
 * Member: works with agents and tasks; cannot approve spending or publishing. Viewer: read-only.
 *
 * Rows written before the roles changed hold "manager" and "rep" until the backfill
 * (convex/organizationsMigration.ts) has rewritten them. Every check goes through `roleOf`, so both
 * sets of words work at once. docs/rebuild/organizations-and-clients.md, section 4.
 */
import { v } from "convex/values";

import { notAllowed } from "./errors";

export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];
/** What a `members.role` may hold while old rows exist. */
export type StoredRole = Role | "manager" | "rep";

export const roleValidator = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"), v.literal("viewer"));
/** Stored rows, and arguments from a browser tab opened before the roles changed. */
export const storedRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
  v.literal("viewer"),
  v.literal("manager"),
  v.literal("rep"),
);
/** The roles a person can be invited with or changed to without becoming an Owner. */
export const grantableRoleValidator = v.union(
  v.literal("admin"),
  v.literal("member"),
  v.literal("viewer"),
  v.literal("manager"),
  v.literal("rep"),
);

const FROM_OLD: Record<string, Role> = { manager: "admin", rep: "member" };

export function roleOf(stored: string): Role {
  const mapped = FROM_OLD[stored] ?? stored;
  // An unknown word is treated as the least a person can be, never as more.
  return (ROLES as readonly string[]).includes(mapped) ? (mapped as Role) : "viewer";
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };
export const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, member: 2, viewer: 3 };

export function isOwner(stored: string): boolean {
  return roleOf(stored) === "owner";
}

/** Owner or Admin: approves, connects accounts, manages people and settings of the organization. */
export function isAdmin(stored: string): boolean {
  const role = roleOf(stored);
  return role === "owner" || role === "admin";
}

/** Everyone except a Viewer: may start agent work and edit what the organization keeps. */
export function canWork(stored: string): boolean {
  return roleOf(stored) !== "viewer";
}

export function requireOwner(stored: string) {
  if (!isOwner(stored)) notAllowed();
}

export function requireAdmin(stored: string) {
  if (!isAdmin(stored)) notAllowed();
}

export function requireWork(stored: string) {
  if (!canWork(stored)) notAllowed();
}
