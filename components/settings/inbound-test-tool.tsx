"use client";

import { useActionState } from "react";

import { sendTestEvent, type ActionState } from "@/app/(app)/settings/actions";
import { Panel } from "@/components/ui/panel";
import { TonePill } from "@/components/ui/tone";
import {
  btnPrimary,
  btnSizeSm,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";

const EVENT_TYPES = [
  { value: "lead.received", label: "Lead received — creates a lead" },
  { value: "touch.system", label: "System touch — an automated message" },
  { value: "touch.human", label: "Human touch — a person made contact" },
  { value: "contact.updated", label: "Contact updated — revises an existing lead" },
  {
    value: "appointment.booked",
    label: "Appointment booked — creates or reschedules an appointment",
  },
  { value: "appointment.showed", label: "Showed — records the outcome" },
  {
    value: "appointment.no_show",
    label: "No-show — rejects an appointment still awaiting review",
  },
  {
    value: "message.sent",
    label: "Message with no declared actor — stamps nothing",
  },
  { value: "widget.exploded", label: "Unrecognised type — stored as unknown" },
] as const;

const CHANNELS = ["sms", "email", "call", "dm", "other"] as const;

export function InboundTestTool({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    sendTestEvent,
    null
  );

  if (clients.length === 0) {
    return (
      <Panel className="px-5 py-4">
        <p className="text-sm text-silver">
          Add a client before sending a test event. The tool sends through the
          real endpoint using that client&rsquo;s real webhook secret.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="px-5 py-5">
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="test-client">
              Client
            </label>
            <select
              id="test-client"
              name="clientId"
              className={selectClass}
              defaultValue={clients[0].id}
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="test-type">
              Event type
            </label>
            <select id="test-type" name="eventType" className={selectClass}>
              {EVENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="test-name">
              Name
            </label>
            <input
              id="test-name"
              name="name"
              className={inputClass}
              placeholder="Dana Whitfield"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="test-phone">
              Phone
            </label>
            <input
              id="test-phone"
              name="phone"
              className={inputClass}
              placeholder="+1 555 010 4477"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="test-email">
              Email
            </label>
            <input
              id="test-email"
              name="email"
              className={inputClass}
              placeholder="dana@example.com"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="test-job">
              Job type
            </label>
            <input
              id="test-job"
              name="jobType"
              className={inputClass}
              placeholder="Roof replacement"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="test-campaign">
              UTM campaign
            </label>
            <input
              id="test-campaign"
              name="utmCampaign"
              className={inputClass}
              placeholder="fall-roofing-retarget"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="test-channel">
              Touch channel
            </label>
            <select id="test-channel" name="channel" className={selectClass}>
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="test-scheduled">
              Scheduled for
            </label>
            <input
              id="test-scheduled"
              name="scheduledFor"
              type="datetime-local"
              className={`${inputClass} [color-scheme:dark]`}
            />
            <p className="mt-1.5 text-xs text-dim">
              Bookings only. Blank books three days out.
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="test-appointment-id">
              Provider appointment id
            </label>
            <input
              id="test-appointment-id"
              name="appointmentId"
              className={inputClass}
              placeholder="Leave blank for a fresh id"
            />
            <p className="mt-1.5 text-xs text-dim">
              Reuse an id with a new time to send a reschedule.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="test-event-id">
              Event id
            </label>
            <input
              id="test-event-id"
              name="eventId"
              className={inputClass}
              placeholder="Leave blank for a fresh id"
            />
            <p className="mt-1.5 text-xs text-dim">
              Reuse an id to replay the exact same delivery. The second one is
              acknowledged and creates nothing.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className={`${btnPrimary} ${btnSizeSm}`}
            disabled={pending}
          >
            {pending ? "Sending…" : "Send through the endpoint"}
          </button>
          {state ? (
            <TonePill tone={state.ok ? "good" : "critical"}>
              {state.message}
            </TonePill>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}
