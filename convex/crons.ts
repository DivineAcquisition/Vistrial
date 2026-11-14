import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Finishes the agent rename (sales to growth-architect) on any deployment that still has old rows,
 * production included, without anyone running the migration by hand. A no-op once it is done.
 * Remove together with the old area fields after every deployment reports zero remaining.
 */
crons.interval("finish agent rename", { minutes: 10 }, internal.agentsMigration.backfillIfNeeded, {});

/**
 * Gives every workspace from before accounts existed an account of its own and rewrites the old role
 * words (manager, rep) to the new ones, on any deployment that still has some. A no-op once it is done.
 * Remove together with the old role words after every deployment reports zero remaining.
 */
crons.interval("finish accounts and roles", { minutes: 10 }, internal.organizationsMigration.backfillIfNeeded, {});

/**
 * Turns each brand kit that was made "for a client" into a real client and links the two, on any
 * deployment that still has an unlinked one. A no-op once it is done.
 */
crons.interval("link client brand kits", { minutes: 10 }, internal.clientsMigration.backfillIfNeeded, {});

/**
 * Fills any kind of model work that has no route with the defaults (research and write on Opus, classify
 * and summarize on Sonnet). It never changes a route that exists, so a Platform Admin's choice stands, and
 * a deployment works without anyone running platform:ensureDefaultRoutes by hand.
 */
crons.interval("fill default model routes", { hours: 1 }, internal.platform.ensureDefaultRoutes, {});

/** Keeps connected Meta ad accounts' results fresh (read-only). */
crons.interval("refresh Meta ad results", { hours: 3 }, internal.metaAds.syncAll, {});

/** Keeps connected HighLevel sub-accounts fresh (read-only), and removes connections signed out for 30 days. */
crons.interval("refresh CRM data", { hours: 6 }, internal.highLevel.syncAll, {});

/** Resends any credit charge Autumn did not take the first time. Does nothing while billing is off. */
crons.interval("retry billing sync", { hours: 1 }, internal.billingActions.retryUnsynced, {});

/** Emails Owners and Admins the check-ins that came due. Each check-in is sent once. Does nothing without a Resend key. */
crons.interval("email check-ins due", { hours: 1 }, internal.emailReminders.sendCheckInsDue, {});

/** Keeps connected calendars' booked-call counts fresh (read-only). Does nothing while none is connected. */
crons.interval("refresh calendar bookings", { hours: 6 }, internal.bookings.syncAll, {});

/** Removes export files a week after they were built. The record that an export was made stays. */
crons.interval("remove old exports", { hours: 6 }, internal.exports.removeExpired, {});

/**
 * Puts drafts that were already waiting for review when approvals arrived into the approvals queue and the
 * Briefing, once, on any deployment whose queue is still empty. A no-op after that.
 */
crons.interval("queue drafts already waiting", { minutes: 10 }, internal.approvals.backfillIfNeeded, {});

/** Posts the alerts nothing else announces to each organization's Briefing: a check-in due, a broken connection, a drop in results, low credits. Each is posted once. */
crons.interval("post Briefing alerts", { hours: 1 }, internal.briefing.sweep, {});

/**
 * The weekly plan and growth report: one proposer run per organization per week, where it is switched on.
 * Checked every six hours; an organization already planned for the week is left alone.
 */
crons.interval("weekly plan", { hours: 6 }, internal.planner.weekly, {});

/**
 * Industry trend posts: one reading per organization per month, only where an Owner or Admin switched them
 * on. Checked every six hours; a month already read is left alone.
 */
crons.interval("monthly industry trends", { hours: 6 }, internal.planner.monthly, {});

/** First packages that waited for the day's free budget: started as the budget allows. Hourly. */
crons.interval("start waiting first packages", { hours: 1 }, internal.firstPackage.startWaiting, {});

/** Dealmaker's weekly scorecard: last week's, posted once per CRM connection where Dealmaker is on. */
crons.interval("Dealmaker weekly scorecard", { hours: 6 }, internal.dealmakerProof.weekly, {});

/** The Objection Playbook's weekly talk tracks, where an Owner turned them on: one run per Playbook per week. */
crons.interval("Dealmaker weekly objection playbook", { hours: 6 }, internal.objectionPlaybook.weekly, {});

export default crons;
