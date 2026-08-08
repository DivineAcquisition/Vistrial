import { NextResponse } from "next/server";

import {
  supabasePublishableKey,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "@/lib/supabase/env";
import { fetchForSupabaseKey } from "@/lib/supabase/fetch";

export const dynamic = "force-dynamic";

/**
 * Liveness plus a live probe of Supabase credentials. Never returns secret
 * values — only whether the server can reach Auth and PostgREST with the keys
 * it has. Boolean presence alone is not enough: a Marketplace `sb_secret_…`
 * key that Kong rejects still looks "set".
 */
export async function GET() {
  const url = supabaseUrl();
  const publishable = supabasePublishableKey();
  const serviceRole = supabaseServiceRoleKey();

  const present = {
    url: Boolean(url),
    publishable: Boolean(publishable),
    serviceRole: Boolean(serviceRole),
  };

  let publishableOk: boolean | null = null;
  let serviceRoleOk: boolean | null = null;
  let publishableError: string | null = null;
  let serviceRoleError: string | null = null;

  if (url && publishable) {
    try {
      const res = await fetchForSupabaseKey(publishable)(
        `${url}/auth/v1/settings`,
        {
          headers: {
            apikey: publishable,
            Authorization: `Bearer ${publishable}`,
          },
          cache: "no-store",
        }
      );
      publishableOk = res.ok;
      if (!res.ok) {
        const body = await res.text();
        publishableError = `${res.status}: ${body.slice(0, 160)}`;
      }
    } catch (error) {
      publishableOk = false;
      publishableError =
        error instanceof Error ? error.message : "publishable probe failed";
    }
  }

  if (url && serviceRole) {
    try {
      const res = await fetchForSupabaseKey(serviceRole)(
        `${url}/rest/v1/team_users?select=id&limit=1`,
        {
          headers: {
            apikey: serviceRole,
            Authorization: `Bearer ${serviceRole}`,
            Accept: "application/json",
          },
          cache: "no-store",
        }
      );
      serviceRoleOk = res.ok;
      if (!res.ok) {
        const body = await res.text();
        serviceRoleError = `${res.status}: ${body.slice(0, 160)}`;
      }
    } catch (error) {
      serviceRoleOk = false;
      serviceRoleError =
        error instanceof Error ? error.message : "service-role probe failed";
    }
  }

  const ok =
    present.url &&
    present.publishable &&
    present.serviceRole &&
    publishableOk === true &&
    serviceRoleOk === true;

  return NextResponse.json({
    ok,
    supabase: {
      ...present,
      publishableWorks: publishableOk,
      serviceRoleWorks: serviceRoleOk,
      publishableError,
      serviceRoleError,
      publishableKind: publishable.startsWith("sb_publishable_")
        ? "publishable"
        : publishable.startsWith("eyJ")
          ? "anon_jwt"
          : publishable
            ? "other"
            : null,
      serviceRoleKind: serviceRole.startsWith("sb_secret_")
        ? "secret"
        : serviceRole.startsWith("eyJ")
          ? "service_role_jwt"
          : serviceRole
            ? "other"
            : null,
    },
  });
}
