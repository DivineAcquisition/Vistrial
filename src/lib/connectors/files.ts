import { createHash } from "node:crypto";

export type ImportMode = "past" | "active";

export type ParsedSheet = {
  headers: string[];
  rows: string[][];
};

export type ColumnMatch = {
  header: string;
  field: string | null;
  suggested: string | null;
};

const FIELD_HINTS: Array<{ field: string; pattern: RegExp }> = [
  { field: "email", pattern: /e-?mail/i },
  { field: "phone", pattern: /phone|mobile|cell/i },
  { field: "first_name", pattern: /first.?name|^name$/i },
  { field: "last_name", pattern: /last.?name|surname/i },
  { field: "external_id", pattern: /id$|record/i },
  { field: "stage", pattern: /stage|status/i },
  { field: "consent", pattern: /consent|opt.?in/i },
];

export function parseCsv(text: string): ParsedSheet {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  const rows = lines.map(splitCsvLine);
  const headers = (rows.shift() ?? []).map((cell) => cell.trim());
  return { headers, rows };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

export function suggestColumns(headers: readonly string[]): ColumnMatch[] {
  return headers.map((header) => {
    const hint = FIELD_HINTS.find((row) => row.pattern.test(header));
    return { header, field: hint?.field ?? null, suggested: hint?.field ?? null };
  });
}

export type RowPlan = {
  index: number;
  action: "create" | "update" | "skip" | "reject";
  reason: string;
  preview: Record<string, string>;
  consentUnknown: boolean;
  outreachEligible: boolean;
};

export function planRows(args: {
  sheet: ParsedSheet;
  matches: readonly ColumnMatch[];
  existingKeys: ReadonlySet<string>;
  mode: ImportMode;
  activeAllowed: boolean;
}): { rows: RowPlan[]; fileHash: string } {
  if (args.mode === "active" && !args.activeAllowed) {
    return {
      fileHash: hashSheet(args.sheet),
      rows: [
        {
          index: 0,
          action: "reject",
          reason: "Active leads to work now is turned off. Import these as past records.",
          preview: {},
          consentUnknown: false,
          outreachEligible: false,
        },
      ],
    };
  }
  const indexOf = new Map(args.matches.map((match, index) => [match.field, index]));
  const rows: RowPlan[] = args.sheet.rows.map((cells, index) => {
    const preview: Record<string, string> = {};
    args.matches.forEach((match, cellIndex) => {
      if (match.field) preview[match.field] = (cells[cellIndex] ?? "").trim();
    });
    const email = preview.email?.toLowerCase() ?? "";
    const phone = preview.phone ?? "";
    const external = preview.external_id ?? "";
    if (!email && !phone && !external && !preview.first_name) {
      return {
        index: index + 2,
        action: "reject" as const,
        reason: "This row has no name, email, phone, or id.",
        preview,
        consentUnknown: false,
        outreachEligible: false,
      };
    }
    const key = external || email || phone;
    if (key && args.existingKeys.has(key)) {
      return {
        index: index + 2,
        action: "skip" as const,
        reason: "This row is already imported.",
        preview,
        consentUnknown: false,
        outreachEligible: false,
      };
    }
    const consent = (preview.consent ?? "").toLowerCase();
    const consentUnknown = args.mode === "active" && consent !== "yes" && consent !== "true";
    return {
      index: index + 2,
      action: key && args.existingKeys.has(`${key}:update`) ? "update" : "create",
      reason: args.mode === "past" ? "Past record. No alerts or drafts." : "Active lead.",
      preview,
      consentUnknown,
      outreachEligible: args.mode === "active" && !consentUnknown,
    };
  });
  void indexOf;
  return { rows, fileHash: hashSheet(args.sheet) };
}

export function hashSheet(sheet: ParsedSheet): string {
  return createHash("sha256").update(JSON.stringify(sheet)).digest("hex");
}

export function previewRows(rows: readonly RowPlan[], count = 20): RowPlan[] {
  return rows.slice(0, count);
}

export const TEMPLATE_CSV = "first_name,last_name,email,phone,external_id,stage,consent\n";
