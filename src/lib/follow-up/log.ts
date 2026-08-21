type LogFields = Record<string, unknown>;

const FORBIDDEN =
  /^(body|text|content|generated_body|edited_body|sent_body|subject|quote|quotes|verbatim|summary|stated_objection|draft|email|phone|first_name|last_name|firstName|lastName)$/i;

function strip(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN.test(key)) continue;
    if (typeof value === "string" && value.length > 80) {
      out[key] = "[omitted]";
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

export function followUpLog(event: string, fields: LogFields = {}) {
  line("info", event, fields);
}

export function followUpWarn(event: string, fields: LogFields = {}) {
  line("warn", event, fields);
}

export function followUpError(event: string, fields: LogFields = {}) {
  line("error", event, fields);
}
