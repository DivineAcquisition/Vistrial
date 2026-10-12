/**
 * Email domain records. The Vistrial team copies the records the CRM's email
 * settings ask for; the Owner adds them where their domain is managed; "Check
 * again" looks them up. Pure parts here, the lookup in email-domain-check.ts.
 */

export type DomainRecord = { type: "TXT" | "CNAME" | "MX"; host: string; value: string; purpose?: string | null };
export type RecordResult = { host: string; type: DomainRecord["type"]; found: boolean };

export function readRecords(value: unknown): DomainRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => row as Record<string, unknown>)
    .filter((row) => typeof row.host === "string" && typeof row.value === "string" && ["TXT", "CNAME", "MX"].includes(String(row.type)))
    .map((row) => ({
      type: row.type as DomainRecord["type"],
      host: String(row.host),
      value: String(row.value),
      purpose: typeof row.purpose === "string" ? row.purpose : null,
    }));
}

export function readResults(value: unknown): RecordResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => row as Record<string, unknown>)
    .filter((row) => typeof row.host === "string")
    .map((row) => ({ host: String(row.host), type: String(row.type) as DomainRecord["type"], found: row.found === true }));
}

/** The full name to look up: "em123" under "example.com" is "em123.example.com"; "@" is the domain itself. */
export function lookupName(host: string, domain: string | null): string {
  const clean = host.trim().replace(/\.$/, "").toLowerCase();
  if (!domain) return clean;
  const base = domain.toLowerCase();
  if (clean === "@" || clean === "" || clean === base) return base;
  return clean.endsWith(`.${base}`) ? clean : `${clean}.${base}`;
}

function normalize(text: string): string {
  return text.trim().replace(/^"|"$/g, "").replace(/\.$/, "").replace(/\s+/g, " ").toLowerCase();
}

/** Whether the values found at a name include the expected value. */
export function recordMatches(record: DomainRecord, found: string[]): boolean {
  const want = normalize(record.value);
  if (record.type === "TXT") {
    // SPF and similar records may carry more than we ask for; the key part must be there.
    return found.some((value) => {
      const have = normalize(value);
      return have === want || have.includes(want);
    });
  }
  if (record.type === "MX") {
    const host = normalize(want.replace(/^\d+\s+/, ""));
    return found.some((value) => normalize(value.replace(/^\d+\s+/, "")) === host);
  }
  return found.some((value) => normalize(value) === want);
}

export function plainRecordType(type: DomainRecord["type"]): string {
  return type === "TXT" ? "Text (TXT) record" : type === "CNAME" ? "Alias (CNAME) record" : "Mail (MX) record";
}
