"use server";

/**
 * Called from client-side error boundaries (error.tsx). The operator only ever
 * sees a plain-language retry message — this is how the real failure still
 * reaches server logs for triage.
 *
 * Takes no dependency on auth context or the database: a render failure can
 * happen because either of those is already broken, and a logger that can
 * itself throw is not a logger.
 */
export async function logClientRenderError(input: {
  message: string;
  digest?: string;
  path?: string;
}) {
  try {
    console.error(
      JSON.stringify({
        src: "vistrial",
        event: "client_render_error",
        message: input.message.slice(0, 2000),
        digest: input.digest,
        path: input.path,
      })
    );
  } catch {
    // A failed log call must never surface to the operator or block the retry.
  }
}
