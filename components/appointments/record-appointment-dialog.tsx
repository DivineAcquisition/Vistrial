"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { recordAppointmentAction } from "@/lib/actions/appointments";
import { formatDay } from "@/lib/format";
import {
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";

export type LeadChoice = {
  id: string;
  client_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  arrived_at: string;
};

function describe(lead: LeadChoice): string {
  const who = lead.name ?? "Unnamed";
  const contact = lead.phone ?? lead.email ?? "no contact details";
  return `${who} · ${contact} · arrived ${formatDay(lead.arrived_at)}`;
}

/**
 * Bookings happen by phone and outside the tracked path. A system that cannot
 * record reality gets worked around, so an admin can attach an appointment to
 * any existing lead — and only to an existing lead.
 */
export function RecordAppointmentDialog({
  clients,
  leads,
  trigger,
}: {
  clients: { id: string; name: string }[];
  leads: LeadChoice[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [leadId, setLeadId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const clientLeads = useMemo(
    () => leads.filter((lead) => lead.client_id === clientId),
    [leads, clientId]
  );

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setError(null);
      setLeadId("");
      setScheduledFor("");
      setAppointmentType("");
    }
  };

  const submit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setError(null);
    setPending(true);

    const result = await recordAppointmentAction({
      client_id: clientId,
      lead_id: leadId,
      // The picker works in the admin's local time; the ledger stores UTC.
      scheduled_for: new Date(scheduledFor).toISOString(),
      appointment_type: appointmentType,
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success(
      result.data.outcome === "created"
        ? "Recorded. It is waiting in the confirmation queue."
        : result.data.outcome === "rescheduled"
          ? "This lead already had an appointment, so it was rescheduled rather than duplicated."
          : "That appointment was already on record. Nothing was created."
    );

    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record an appointment</DialogTitle>
          <DialogDescription>
            It is stamped with the client&rsquo;s current definition version and
            enters the queue as pending, exactly as a booking from the calendar
            would.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-2 space-y-3">
          <div>
            <label className={labelClass} htmlFor="appointment-client">
              Client
            </label>
            <select
              id="appointment-client"
              className={selectClass}
              value={clientId}
              onChange={(changeEvent) => {
                setClientId(changeEvent.target.value);
                setLeadId("");
              }}
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="appointment-lead">
              Lead
            </label>
            <select
              id="appointment-lead"
              required
              className={selectClass}
              value={leadId}
              onChange={(changeEvent) => setLeadId(changeEvent.target.value)}
            >
              <option value="">Choose a lead</option>
              {clientLeads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {describe(lead)}
                </option>
              ))}
            </select>
            <p className={helperClass}>
              {clientLeads.length === 0
                ? "This client has no leads yet. An appointment with no lead is unbillable, so one has to exist first."
                : "Every appointment belongs to a lead."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="appointment-when">
                Scheduled for
              </label>
              <input
                id="appointment-when"
                type="datetime-local"
                required
                className={`${inputClass} [color-scheme:dark]`}
                value={scheduledFor}
                onChange={(changeEvent) => setScheduledFor(changeEvent.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="appointment-type">
                Job type
              </label>
              <input
                id="appointment-type"
                className={inputClass}
                placeholder="Roof replacement"
                value={appointmentType}
                onChange={(changeEvent) => setAppointmentType(changeEvent.target.value)}
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className={errorClass}>
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`${btnSecondary} ${btnSizeSm}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || leadId === ""}
              className={`${btnPrimary} ${btnSizeSm}`}
            >
              {pending ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Record it"
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
