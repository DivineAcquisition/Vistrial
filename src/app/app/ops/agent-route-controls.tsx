"use client";

import { useState } from "react";

import { saveModelRoute, type OpsActionResult } from "@/app/app/ops/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorClass, helperClass, successClass } from "@/lib/ui";

type RouteRow = { workKind: string; tier: string; modelId: string };

export function AgentRouteControls({ routes }: { routes: RouteRow[] }) {
  const [result, setResult] = useState<OpsActionResult>({ status: "idle" });
  return (
    <div className="space-y-4">
      <p className={helperClass}>
        Changing a route is a configuration change. It does not need a deploy. The creative-tier
        model is not used.
      </p>
      {routes.map((route) => (
        <form
          key={route.workKind}
          className="flex flex-wrap items-end gap-2"
          action={async (formData) => setResult(await saveModelRoute(formData))}
        >
          <input type="hidden" name="work_kind" value={route.workKind} />
          <Field label={route.workKind.replaceAll("_", " ")} name={`model-${route.workKind}`}>
            <Input name="model_id" defaultValue={route.modelId} aria-label={`${route.workKind} model`} />
          </Field>
          <Button type="submit" variant="secondary" size="sm">
            Save
          </Button>
        </form>
      ))}
      {result.status === "error" ? <p className={errorClass}>{result.error}</p> : null}
      {result.status === "ok" ? <p className={successClass}>{result.message}</p> : null}
    </div>
  );
}
