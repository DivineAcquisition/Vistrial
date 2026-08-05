import type {
  AppointmentStatus,
  LeadArrivalSource,
  LeadSource,
  TouchChannel,
  TouchType,
} from "@/types/database";

export type TouchEntry = {
  id: string;
  type: TouchType;
  channel: TouchChannel | null;
  occurredAt: string;
  isFirstOfType: boolean;
};

export type SubmissionEntry = {
  id: string;
  submittedAt: string;
  isOriginal: boolean;
};

/** Everything the table and the detail panel need, resolved on the server. */
export type LeadRowData = {
  id: string;
  arrivedAt: string;
  arrivalSource: LeadArrivalSource;
  clientName: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  campaignName: string | null;
  jobType: string | null;
  systemMs: number | null;
  humanMs: number | null;
  gapMs: number | null;
  appointment: {
    id: string;
    status: AppointmentStatus;
    scheduledFor: string;
  } | null;
  touches: TouchEntry[];
  submissions: SubmissionEntry[];
  payload: string;
};
