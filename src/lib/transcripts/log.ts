type LogFields = Record<string, unknown>;

const FORBIDDEN =
  /^(transcript|raw_transcript|rawtranscript|quotes|verbatim|summary|stated_objection|statedobjection|budget_signal|budgetsignal|timeline_signal|timelinesignal|decision_process|decisionprocess|next_step_agreed|nextstepagreed|opening|opening_text|content|text|payload)$/i;

function strip(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN.test(key)) continue;
    if (typeof value === "string" && value.length > 120) {
      out[key] = `${value.slice(0, 40)}…`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function line(level: "info" | "error" | "warn", event: string, fields: LogFields) {
  const payload = { src: "vistrial", event, ...strip(fields) };
  const serialized = JSON.stringify(payload);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.info(serialized);
}

export function transcriptLog(event: string, fields: LogFields = {}) {
  line("info", event, fields);
}

export function transcriptWarn(event: string, fields: LogFields = {}) {
  line("warn", event, fields);
}

export function transcriptError(event: string, fields: LogFields = {}) {
  line("error", event, fields);
}

export function logHasForbiddenContent(serialized: string): boolean {
  return (
    serialized.includes("raw_transcript") ||
    serialized.includes("stated_objection") ||
    serialized.includes("budget_signal")
  );
}
