"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClientAction, updateClientAction } from "@/lib/actions/clients";
import {
  BILLING_CYCLE_DAYS,
  BILL_ON,
  CLIENT_STATUSES,
  DEFAULT_CRITERIA_PLACEHOLDER,
  REVIEW_WINDOW_HOURS,
  type ClientFormValues,
} from "@/lib/schemas/client";
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
import type { Client } from "@/types/database";

const emptyValues: ClientFormValues = {
  name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  status: "Onboarding",
  rate_per_appointment: "150",
  monthly_minimum: "0",
  billing_cycle_days: "14",
  review_window_hours: "72",
  bill_on: "booked",
  duplicate_window_days: "30",
  ghl_location_id: "",
  criteria: "",
  service_area: "",
  accepted_job_types: "",
};

function valuesFromClient(client: Client): ClientFormValues {
  return {
    name: client.name,
    contact_name: client.contact_name ?? "",
    contact_email: client.contact_email ?? "",
    contact_phone: client.contact_phone ?? "",
    status: client.status,
    rate_per_appointment: String(client.rate_per_appointment),
    monthly_minimum: String(client.monthly_minimum),
    billing_cycle_days: String(client.billing_cycle_days),
    review_window_hours: String(client.review_window_hours),
    bill_on: client.bill_on,
    duplicate_window_days: String(client.duplicate_window_days),
    ghl_location_id: client.ghl_location_id ?? "",
    criteria: "",
    service_area: client.service_area ?? "",
    accepted_job_types: (client.accepted_job_types ?? []).join(", "),
  };
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="border-t border-border pt-4">
      <legend className="pr-3 text-[11px] font-semibold tracking-[0.14em] text-brand-500 uppercase">
        {title}
      </legend>
      {hint ? <p className={helperClass}>{hint}</p> : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function ClientDialog({
  mode,
  client,
  trigger,
}: {
  mode: "create" | "edit";
  client?: Client;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<ClientFormValues>({
    defaultValues: client ? valuesFromClient(client) : emptyValues,
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setError(null);
      reset(client ? valuesFromClient(client) : emptyValues);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setError(null);

    const result =
      mode === "create"
        ? await createClientAction(values)
        : await updateClientAction(client!.id, values);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success(
      mode === "create"
        ? "Client created with definition v1."
        : "Client updated."
    );
    setOpen(false);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add client" : `Edit ${client?.name ?? "client"}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Commercial terms and version one of the appointment definition are created together."
              : "Commercial terms only. New definition versions are created on the Definition tab."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="mt-5 space-y-5">
          <Group title="Business">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="name">
                Business name
              </label>
              <input
                id="name"
                required
                className={inputClass}
                {...register("name")}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="contact_name">
                Contact name
              </label>
              <input
                id="contact_name"
                className={inputClass}
                {...register("contact_name")}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="contact_email">
                Contact email
              </label>
              <input
                id="contact_email"
                type="email"
                className={inputClass}
                {...register("contact_email")}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="contact_phone">
                Contact phone
              </label>
              <input
                id="contact_phone"
                className={inputClass}
                {...register("contact_phone")}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="status">
                Status
              </label>
              <select
                id="status"
                className={selectClass}
                {...register("status")}
              >
                {CLIENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </Group>

          <Group title="Commercial terms">
            <div>
              <label className={labelClass} htmlFor="rate_per_appointment">
                Rate per appointment
              </label>
              <input
                id="rate_per_appointment"
                type="number"
                min="1"
                step="1"
                required
                className={inputClass}
                {...register("rate_per_appointment")}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="monthly_minimum">
                Monthly minimum
              </label>
              <input
                id="monthly_minimum"
                type="number"
                min="0"
                step="1"
                className={inputClass}
                {...register("monthly_minimum")}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="billing_cycle_days">
                Billing cycle
              </label>
              <select
                id="billing_cycle_days"
                className={selectClass}
                {...register("billing_cycle_days")}
              >
                {BILLING_CYCLE_DAYS.map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="review_window_hours">
                Review window
              </label>
              <select
                id="review_window_hours"
                className={selectClass}
                {...register("review_window_hours")}
              >
                {REVIEW_WINDOW_HOURS.map((hours) => (
                  <option key={hours} value={hours}>
                    {hours} hours
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="duplicate_window_days">
                Duplicate window
              </label>
              <input
                id="duplicate_window_days"
                type="number"
                min="1"
                max="365"
                step="1"
                required
                className={inputClass}
                {...register("duplicate_window_days")}
              />
              <p className={helperClass}>
                Days within which a repeat phone or email is the same lead.
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor="bill_on">
                Bill on
              </label>
              <select
                id="bill_on"
                className={selectClass}
                {...register("bill_on")}
              >
                {BILL_ON.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </Group>

          {mode === "create" ? (
            <Group
              title="Appointment definition · version 1"
              hint="What makes an appointment billable for this client. Later changes create a new version and never reclassify past appointments."
            >
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="criteria">
                  Criteria
                </label>
                <textarea
                  id="criteria"
                  rows={4}
                  required
                  placeholder={DEFAULT_CRITERIA_PLACEHOLDER}
                  className={inputClass}
                  {...register("criteria")}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="service_area">
                  Service area
                </label>
                <input
                  id="service_area"
                  className={inputClass}
                  {...register("service_area")}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="accepted_job_types">
                  Accepted job types
                </label>
                <input
                  id="accepted_job_types"
                  placeholder="roofing, windows, siding"
                  className={inputClass}
                  {...register("accepted_job_types")}
                />
                <p className={helperClass}>Comma separated.</p>
              </div>
            </Group>
          ) : null}

          <Group
            title="Integration"
            hint="The webhook secret is generated by the database and shown on the client's overview tab."
          >
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="ghl_location_id">
                GoHighLevel location ID
              </label>
              <input
                id="ghl_location_id"
                className={inputClass}
                {...register("ghl_location_id")}
              />
            </div>
          </Group>

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
              disabled={isSubmitting}
              className={`${btnPrimary} ${btnSizeSm}`}
            >
              {isSubmitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Saving
                </>
              ) : mode === "create" ? (
                "Create client"
              ) : (
                "Save changes"
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
