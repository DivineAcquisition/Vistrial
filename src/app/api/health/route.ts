import { NextResponse } from "next/server";

import {
  supabasePublishableKey,
  supabasePublishableKeyKind,
  supabaseUrl,
} from "@/lib/supabase/env";
import {
  supabaseServiceRoleKey,
  supabaseServiceRoleKeyKind,
} from "@/lib/supabase/env-server";
import { fetchForSupabaseKey } from "@/lib/supabase/fetch";

export const dynamic = "force-dynamic";

/**
 * Liveness plus a live probe of Vistrial Supabase credentials. Never returns
 * secret values — only whether this deploy can reach Auth and PostgREST.
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
      const res = await fetchForSupabaseKey(publishable)(`${url}/auth/v1/settings`, {
        headers: {
          apikey: publishable,
          Authorization: `Bearer ${publishable}`,
        },
        cache: "no-store",
      });
      publishableOk = res.ok;
      if (!res.ok) {
        const body = await res.text();
        publishableError = `${res.status}: ${body.slice(0, 160)}`;
      }
    } catch (error) {
      publishableOk = false;
      publishableError = error instanceof Error ? error.message : "publishable probe failed";
    }
  }

  if (url && serviceRole) {
    try {
      const res = await fetchForSupabaseKey(serviceRole)(
        `${url}/rest/v1/organizations?select=id&limit=1`,
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
      serviceRoleError = error instanceof Error ? error.message : "service-role probe failed";
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
      publishableKind: supabasePublishableKeyKind(publishable),
      serviceRoleKind: supabaseServiceRoleKeyKind(serviceRole),
    },
  });
}
