import Link from "next/link";

import { ResultButton } from "@/components/staff/result-button";
import { setMfaEnforced } from "@/app/(workspace)/app/team/staff-actions";
import { PageFrame } from "@/components/app/page-frame";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/gates";
import { formatDayLong } from "@/lib/format";
import { staffDb } from "@/lib/staff/db";
import { helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign-in" };

type Row = { user_id: string; name: string; role: string; enrolled: boolean; recovery_codes: number; deadline: string | null };

export default async function StaffSecurityPage() {
  await requirePlatformAdmin();
  const db = await staffDb();
  const [{ data: settings }, { data: people }] = await Promise.all([
    db.from("staff_support_settings").select("mfa_enforced_at, mfa_grace_days").eq("id", true).maybeSingle(),
    db.rpc("staff_mfa_status"),
  ]);
  const enforced = (settings as { mfa_enforced_at: string | null; mfa_grace_days: number } | null)?.mfa_enforced_at;
  const grace = (settings as { mfa_grace_days?: number } | null)?.mfa_grace_days ?? 7;
  return (
    <PageFrame
      title="Sign-in"
      description="Turn this on only after your own authenticator app is set up, and either a second Platform Admin is enrolled or you still have unused recovery codes. That is what keeps a Platform Admin from being locked out."
    >
      <Panel className="space-y-3 p-6">
        <p className="text-sm text-white">{enforced ? `Required since ${formatDayLong(enforced)}. Grace is ${grace} days.` : "Not required yet."}</p>
        <p className={helperClass}>
          Existing staff get the grace period to enroll. You turn on authenticator apps in the Supabase dashboard yourself; this switch is the product rule on top of that.{" "}
          <Link href="/security/setup?next=/app/team/security" className="text-brand-300 underline">
            Set up yours
          </Link>
          . Recovery steps are in the staff sign-in note.
        </p>
        <ResultButton label={enforced ? "Stop requiring it" : "Require authenticator apps"} action={() => setMfaEnforced(!enforced)} />
      </Panel>
      <Panel className="overflow-hidden px-2 py-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Authenticator</TableHead>
              <TableHead>Recovery codes</TableHead>
              <TableHead>Deadline</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {((people ?? []) as Row[]).map((person) => (
              <TableRow key={person.user_id}>
                <TableCell className="text-white">{person.name}</TableCell>
                <TableCell>{person.role === "platform_admin" ? "Platform Admin" : "Service Team"}</TableCell>
                <TableCell>
                  <StatusBadge label={person.enrolled ? "Set up" : "Not yet"} tone={person.enrolled ? "good" : "warning"} />
                </TableCell>
                <TableCell>{person.recovery_codes}</TableCell>
                <TableCell>{person.deadline ? formatDayLong(person.deadline) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </PageFrame>
  );
}
