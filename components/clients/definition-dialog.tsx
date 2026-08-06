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
import { createDefinitionVersionAction } from "@/lib/actions/clients";
import { DEFAULT_CRITERIA_PLACEHOLDER } from "@/lib/schemas/client";
import {
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";
import type { AppointmentDefinition } from "@/types/database";

type Values = {
  criteria: string;
  service_area: string;
  accepted_job_types: string;
};

export function DefinitionDialog({
  clientId,
  current,
  nextVersion,
  trigger,
}: {
  clientId: string;
  current: AppointmentDefinition | null;
  nextVersion: number;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaults: Values = {
    criteria: current?.criteria ?? "",
    service_area: current?.service_area ?? "",
    accepted_job_types: (current?.accepted_job_types ?? []).join(", "),
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<Values>({ defaultValues: defaults });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setError(null);
      reset(defaults);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setError(null);

    const result = await createDefinitionVersionAction({
      client_id: clientId,
      ...values,
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success(`Definition v${result.data.version} is now in effect.`);
    setOpen(false);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New definition · version {nextVersion}</DialogTitle>
          <DialogDescription>
            Prefilled with the current version. Submitting adds a new version and
            leaves every earlier one in place.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="mt-2 space-y-3">
          <div>
            <label className={labelClass} htmlFor="criteria">
              Criteria
            </label>
            <textarea
              id="criteria"
              rows={5}
              required
              placeholder={DEFAULT_CRITERIA_PLACEHOLDER}
              className={inputClass}
              {...register("criteria")}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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
              disabled={isSubmitting}
              className={`${btnPrimary} ${btnSizeSm}`}
            >
              {isSubmitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Saving
                </>
              ) : (
                `Create v${nextVersion}`
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
