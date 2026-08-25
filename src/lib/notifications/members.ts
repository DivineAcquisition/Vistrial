import type { GhlDb } from "@/lib/ghl/tokens";
import { resolveWorkingHours } from "@/lib/notifications/hours";
import type { MemberNotifyTarget } from "@/lib/notifications/types";
import type { OrgRole } from "@/types/database";

export async function loadOrgNotifyContext(db: GhlDb, orgId: string) {
  const [{ data: org }, { data: members }] = await Promise.all([
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
        "id, user_id, role, email, phone, timezone, working_hours_start, working_hours_end, working_days, active"
      )
      .eq("org_id", orgId)
      .eq("active", true),
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
  }));

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
    managers: targets.filter((member) => member.role === "owner" || member.role === "admin"),
  };
}

export function memberById(
  members: MemberNotifyTarget[],
  memberId: string | null | undefined
): MemberNotifyTarget | null {
  if (!memberId) return null;
  return members.find((member) => member.memberId === memberId) ?? null;
}
