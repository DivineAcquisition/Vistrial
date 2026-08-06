import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { computeResponseTimes, type ResponseTimes } from "@/lib/response-time";
import type {
  AppointmentStatus,
  Lead,
  LeadSource,
  LeadSubmission,
  Touch,
} from "@/types/database";

export type LeadRecord = Lead & {
  client: { id: string; name: string } | null;
  campaign: { id: string; name: string } | null;
  touches: Touch[];
  submissions: LeadSubmission[];
  appointments: { id: string; status: AppointmentStatus; scheduled_for: string }[];
};

export type LeadWithResponse = LeadRecord & { response: ResponseTimes };

export type LeadFilters = {
  clientId?: string;
  source?: LeadSource;
  /** Inclusive `yyyy-mm-dd` bounds on arrival. */
  from?: string;
  to?: string;
  awaitingHuman?: boolean;
};

const SELECT = `
  *,
  client:clients(id, name),
  campaign:campaigns(id, name),
  touches(*),
  submissions:lead_submissions(*),
  appointments(id, status, scheduled_for)
`;

/** A page of leads is capped rather than paginated until volume asks for it. */
const MAX_ROWS = 500;

function chronological(touches: Touch[]): Touch[] {
  return [...touches].sort(
    (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at)
  );
}

export async function listLeads(
  filters: LeadFilters = {}
): Promise<LeadWithResponse[]> {
  const supabase = createServiceClient();

  let query = supabase.from("leads").select(SELECT);

  if (filters.clientId) query = query.eq("client_id", filters.clientId);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.from) query = query.gte("arrived_at", `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lte("arrived_at", `${filters.to}T23:59:59Z`);

  const { data, error } = await query
    .order("arrived_at", { ascending: false })
    .limit(MAX_ROWS)
    .returns<LeadRecord[]>();

  if (error) {
    throw new Error(`Failed to list leads: ${error.message}`);
  }

  const leads = (data ?? []).map((lead) => ({
    ...lead,
    touches: chronological(lead.touches ?? []),
    submissions: lead.submissions ?? [],
    appointments: lead.appointments ?? [],
    response: computeResponseTimes(lead.arrived_at, lead.touches ?? []),
  }));

  // Response times are derived, so "still awaiting a human" is a filter that can
  // only be applied once they have been computed.
  return filters.awaitingHuman
    ? leads.filter((lead) => lead.response.humanMs === null)
    : leads;
}
