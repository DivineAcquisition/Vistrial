/**
 * Operator-visible log lines. A client report never mentions these; they exist
 * so an operator can see which lines a workspace's source could not produce.
 */

export function forsightLog(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ src: "vistrial", event, ...fields }));
}
