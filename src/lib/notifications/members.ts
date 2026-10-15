import type { GhlDb } from "@/lib/ghl/tokens";
import { resolveWorkingHours } from "@/lib/notifications/hours";
import type { MemberNotifyTarget } from "@/lib/notifications/types";
import type { OrgRole } from "@/types/database";

export async function loadOrgNotifyContext(db: GhlDb, orgId: string) {
  const [{ data: org }, { data: members }, { data: contacts }] = await Promise.all([
    db
      .from("organizations")
      .select(
        "id, timezone, working_hours_start, working_hours_end, working_days, sms_emergencies_enabled, name"
      )
      .eq("id", orgId)
      .maybeSingle(),
    db
      .from("org_members")
      .select(
        "id, user_id, role, email, phone, timezone, working_hours_start, working_hours_end, working_days, notification_quiet_start, notification_quiet_end, active"
      )
      .eq("org_id", orgId)
      .eq("active", true),
    (db as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            not: (k: string, op: string, v: null) => { order: (k: string) => Promise<{ data: Array<{ member_id: string; channel: string }> | null }> };
          };
        };
      };
    })
      .from("workspace_escalation_contacts")
      .select("member_id, channel")
      .eq("org_id", orgId)
      .not("member_id", "is", null)
      .order("position"),
  ]);
  if (!org) return null;

  const targets: MemberNotifyTarget[] = (members ?? []).map((row) => ({
    memberId: row.id,
    userId: row.user_id,
    role: row.role as OrgRole,
    email: row.email,
    phone: row.phone,
    hours: resolveWorkingHours({
      orgTimeZone: org.timezone,
      orgStart: org.working_hours_start?.slice(0, 5),
      orgEnd: org.working_hours_end?.slice(0, 5),
      orgDays: org.working_days,
      memberTimeZone: row.timezone,
      memberStart: row.working_hours_start?.slice(0, 5),
      memberEnd: row.working_hours_end?.slice(0, 5),
      memberDays: row.working_days,
    }),
    quiet:
      row.notification_quiet_start && row.notification_quiet_end
        ? {
            startHm: row.notification_quiet_start.slice(0, 5),
            endHm: row.notification_quiet_end.slice(0, 5),
          }
        : null,
  }));

  // The Owner's named escalation contacts, in their order, are "Owners and
  // managers" and the final fallback. Without any, owners and admins are.
  const named: MemberNotifyTarget[] = [];
  for (const contact of contacts ?? []) {
    const target = targets.find((member) => member.memberId === contact.member_id);
    if (target) named.push({ ...target, escalationChannel: contact.channel as MemberNotifyTarget["escalationChannel"] });
  }
  const owners = targets.filter((member) => member.role === "owner" || member.role === "admin");

  return {
    org: {
      id: org.id,
      name: org.name,
      timezone: org.timezone,
      smsEmergenciesEnabled: org.sms_emergencies_enabled,
    },
    members: targets,
    setters: targets.filter((member) => member.role === "setter"),
    closers: targets.filter((member) => member.role === "closer"),
    managers: named.length ? named : owners,
  };
}

export function memberById(
  members: MemberNotifyTarget[],
  memberId: string | null | undefined
): MemberNotifyTarget | null {
  if (!memberId) return null;
  return members.find((member) => member.memberId === memberId) ?? null;
}
