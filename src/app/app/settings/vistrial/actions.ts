"use server";

import { revalidatePath } from "next/cache";

import { EXECUTION_TOOLS } from "@/lib/sales-os/catalog";
import { salesOsActor } from "@/lib/sales-os/session";
import { addChannel, saveGateMode, saveRoute, setDestinationActive } from "@/lib/sales-os/settings";

type Result = { ok: true } | { ok: false; error: string };

function done(result: Result): Result {
  revalidatePath("/app/settings/vistrial");
  revalidatePath("/app/onboarding/vistrial");
  return result;
}

export async function saveGateAction(type: string, mode: string): Promise<Result> {
  return done(await saveGateMode(await salesOsActor(), type, mode));
}

/** Onboarding saves every choice at once, so a workspace's gates are explicit rather than defaulted. */
export async function saveAllGatesAction(modes: Record<string, string>): Promise<Result> {
  const actor = await salesOsActor();
  for (const type of EXECUTION_TOOLS) {
    const result = await saveGateMode(actor, type, modes[type] ?? "always_ask");
    if (!result.ok) return done(result);
  }
  return done({ ok: true });
}

export async function addChannelAction(input: { kind: string; label: string; link: string }): Promise<Result> {
  return done(await addChannel(await salesOsActor(), input));
}

export async function setDestinationActiveAction(id: string, active: boolean): Promise<Result> {
  return done(await setDestinationActive(await salesOsActor(), id, active));
}

export async function saveRouteAction(kind: string, destinationId: string | null): Promise<Result> {
  return done(await saveRoute(await salesOsActor(), kind, destinationId));
}
