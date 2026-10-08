"use server";

import { revalidatePath } from "next/cache";

import {
  draftToRow,
  requireForsightOperator,
  testSourceDraft,
  type SourceDraft,
  type SourceTestResult,
} from "@/lib/forsight/operator";
import { createClient } from "@/lib/supabase/server";
import { FORSIGHT_PATH } from "@/lib/navigation";

export type SaveResult = { ok: true; detail: string } | { ok: false; error: string };

export async function testSource(draft: SourceDraft): Promise<SourceTestResult> {
  return testSourceDraft(draft);
}

/**
 * Saving runs the test again server-side and refuses to write when it fails.
 * The screen tests before enabling the button, but a caller that skipped the
 * screen must not be able to save something that does not answer.
 */
export async function saveSource(draft: SourceDraft): Promise<SaveResult> {
  const ctx = await requireForsightOperator();
  if (!ctx) return { ok: false, error: "Not found." };

  const test = await testSourceDraft(draft);
  if (!test.ok) return { ok: false, error: `Not saved. ${test.error}` };

  // The operator's own client, so the insert passes through the RLS policy
  // that requires a platform admin. A client user reaching this action is
  // refused by Postgres, not by this function.
  const supabase = await createClient();
  const { error } = await supabase
    .from("forsight_sources")
    .upsert({ ...draftToRow(draft), last_verified_at: new Date().toISOString(), last_error: null }, {
      onConflict: "org_id,source_type",
    });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`${FORSIGHT_PATH}/sources`);
  revalidatePath(FORSIGHT_PATH);
  return { ok: true, detail: test.detail };
}

export async function deleteSource(sourceId: string): Promise<SaveResult> {
  const ctx = await requireForsightOperator();
  if (!ctx) return { ok: false, error: "Not found." };

  const supabase = await createClient();
  const { error } = await supabase.from("forsight_sources").delete().eq("id", sourceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`${FORSIGHT_PATH}/sources`);
  return { ok: true, detail: "Source removed." };
}
