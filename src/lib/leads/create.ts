import type { OrgRole } from "@/types/database";

/** People added in Vistrial, not ingested from a CRM. */
export const VISTRIAL_LEAD_SOURCE = "vistrial";

const NAME_MAX = 80;
const EMAIL_MAX = 254;
const PHONE_MAX = 40;

export type ParsedCreateLead = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

export type ParseCreateLeadResult =
  | { ok: true; value: ParsedCreateLead }
  | { ok: false; error: string };

function trimToNull(value: string | null | undefined, max: number): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseCreateLeadInput(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}): ParseCreateLeadResult {
  const firstName = (input.firstName ?? "").trim();
  if (!firstName) return { ok: false, error: "A first name is required." };
  if (firstName.length > NAME_MAX) {
    return { ok: false, error: `Keep the first name under ${NAME_MAX} characters.` };
  }

  const lastName = trimToNull(input.lastName, NAME_MAX);
  const email = trimToNull(input.email, EMAIL_MAX);
  if (email && !looksLikeEmail(email)) {
    return { ok: false, error: "That email does not look right." };
  }
  const phone = trimToNull(input.phone, PHONE_MAX);

  return {
    ok: true,
    value: { firstName, lastName, email, phone },
  };
}

export function assignmentForCreator(
  role: OrgRole,
  memberId: string
): { assignedSetterId: string | null; assignedCloserId: string | null } {
  if (role === "setter") return { assignedSetterId: memberId, assignedCloserId: null };
  if (role === "closer") return { assignedSetterId: null, assignedCloserId: memberId };
  return { assignedSetterId: null, assignedCloserId: null };
}
