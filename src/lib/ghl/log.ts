import { redactForLog } from "@/lib/ghl/redact";

type LogFields = Record<string, unknown>;

function line(level: "info" | "error" | "warn", event: string, fields: LogFields) {
  const payload = {
    src: "vistrial",
    event,
    ...((redactForLog(fields) as LogFields) ?? {}),
  };
  const serialized = JSON.stringify(payload);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.info(serialized);
}

export function ghlLog(event: string, fields: LogFields = {}) {
  line("info", event, fields);
}

export function ghlWarn(event: string, fields: LogFields = {}) {
  line("warn", event, fields);
}

export function ghlError(event: string, fields: LogFields = {}) {
  line("error", event, fields);
}
