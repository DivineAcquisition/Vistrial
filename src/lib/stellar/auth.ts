import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { getPlatformStaff, getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { StellarAuthContext, StellarMember } from "@/lib/stellar/types";

type OrgEmbed = { id: string; name: string; timezone: string; product: string };

type SeatRow = {
  id: string;
  org_id: string;
  role: string;
  seat: string;
  display_name: string;
  email: string;
  org: OrgEmbed;
};

/**
 * The caller's seats in Stellar workspaces, read through their own session.
 * Row-level security decides which come back: a client sees only their own
 * workspace, staff only the ones they are assigned to. No service-role
 * fallback, which could return a seat the database has hidden.
 */
async function stellarSeats(userId: string): Promise<SeatRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_members")
    .select("id, org_id, role, seat, display_name, email, organizations(id, name, timezone, product)")
    .eq("user_id", userId)
    .eq("active", true);
  const seats: SeatRow[] = [];
  for (const row of data ?? []) {
    const embed = row.organizations as OrgEmbed | OrgEmbed[] | null;
    const org = Array.isArray(embed) ? embed[0] : embed;
    if (!org || (org.product !== "stellar" && org.product !== "both")) continue;
    seats.push({
      id: row.id,
      org_id: row.org_id,
      role: row.role,
      seat: row.seat,
      display_name: row.display_name,
      email: row.email,
      org,
    });
  }
  return seats;
}

function toMember(row: SeatRow, role: StellarMember["role"]): StellarMember {
  return {
    id: row.id,
    orgId: row.org_id,
    orgName: row.org.name,
    orgTimezone: row.org.timezone,
    role,
    displayName: row.display_name,
    email: row.email,
  };
}

/** Whether the caller is Vistrial staff; kept for the sign-in path. */
export async function checkIsStellarDaOperator(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_stellar_da_operator");
  if (error) return false;
  return Boolean(data);
}

/**
 * Current user's Stellar identity. Redirects to /login if signed out,
 * /no-access if they hold no Stellar seat and are not staff.
 */
export const getStellarAuthContext = cache(async (): Promise<StellarAuthContext> => {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?redirect=%2Fstellar");
  }

  const seats = await stellarSeats(user.id);

  if (await getPlatformStaff()) {
    const staffSeatIds = seats.filter((row) => row.seat === "staff").map((row) => row.id);
    let setter: StellarMember | null = null;
    if (staffSeatIds.length > 0) {
      const supabase = await createClient();
      const { data: placement } = await supabase
        .from("placements")
        .select("setter_member_id")
        .in("setter_member_id", staffSeatIds)
        .is("ended_at", null)
        .limit(1)
        .maybeSingle();
      const seat = seats.find((row) => row.id === placement?.setter_member_id);
      if (seat) setter = toMember(seat, "setter");
    }
    return { kind: "da_operator", user, setter };
  }

  const client = seats.find(
    (row) => row.seat === "customer" && ["owner", "member", "client_viewer"].includes(row.role)
  );
  if (!client) {
    redirect("/no-access");
  }
  return { kind: "member", user, member: toMember(client, "client") };
});
