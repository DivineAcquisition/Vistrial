"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { creditWords } from "@/lib/credits";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";

export type ApprovalSettingsData = FunctionReturnType<typeof api.approvals.settings>;

const title = "font-heading text-sm text-card-foreground";
const text = "text-sm leading-relaxed text-muted-foreground";

/**
 * What waits for an Owner or Admin, and what Vistrial writes to the Briefing on its own. Three settings,
 * each for this organization only: the spending limit, the weekly plan and growth report, and industry
 * trend posts. Everyone can read them; Owners and Admins change them.
 */
export function ApprovalSettingsView({
  data,
  onLimit,
  onSwitch,
}: {
  data: ApprovalSettingsData;
  onLimit: (credits: number | null) => Promise<unknown>;
  onSwitch: (key: "weeklyPlan" | "trendPosts", on: boolean) => Promise<unknown>;
}) {
  const [limit, setLimit] = useState(data.spendApprovalCredits === null ? "" : String(data.spendApprovalCredits));
  const [notice, setNotice] = useState("");
  const parsed = Number(limit);
  const valid = limit.trim() !== "" && Number.isInteger(parsed) && parsed >= data.min && parsed <= data.max;
  const save = (credits: number | null) => {
    setNotice("");
    void onLimit(credits).then(
      () => {
        if (credits === null) setLimit("");
        setNotice(credits === null ? "Removed. The agent limits above still apply." : "Saved.");
      },
      (problem: unknown) => setNotice(showError(problem)),
    );
  };
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="font-heading text-base text-card-foreground">Approvals and the Briefing</h2>
        <p className={text}>Nothing public, nothing in a connected account and no task an agent proposes happens without an Owner or Admin approving it. These settings add to that.</p>
      </div>

      <Panel className="grid gap-3 p-4 sm:p-5">
        <div className="grid gap-1">
          <h3 className={title}>Spending limit</h3>
          <p className={text}>
            {data.spendApprovalCredits === null
              ? "Not set. Members start agent work inside the agent limits above, without waiting."
              : `Work that may use more than ${creditWords(data.spendApprovalCredits)} waits for an Owner or Admin. It is compared with the most a piece of work can use.`}
          </p>
        </div>
        {data.canEdit ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) save(parsed);
            }}
          >
            <label className="grid gap-1 text-sm">
              <span className="text-card-foreground">Limit, in credits</span>
              <Input inputMode="numeric" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="500" className="w-36" />
            </label>
            <Button type="submit" variant="primary" disabled={!valid || parsed === data.spendApprovalCredits}>
              Save
            </Button>
            {data.spendApprovalCredits !== null ? (
              <Button type="button" variant="ghost" onClick={() => save(null)}>
                Remove the limit
              </Button>
            ) : null}
          </form>
        ) : null}
        {limit.trim() !== "" && !valid ? <p className="text-xs text-destructive">Enter a whole number of credits between {data.min.toLocaleString("en-US")} and {data.max.toLocaleString("en-US")}.</p> : null}
        {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
      </Panel>

      <Panel className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="grid min-w-0 flex-1 gap-1">
          <h3 className={title}>Weekly plan and growth report</h3>
          <p className={text}>Once a week Vistrial reads this organization&apos;s reports, results and check-ins, proposes tasks on the Tasks board and posts a growth report to the Briefing. It uses credits, shows how many, and stops at its cap. {data.weeklyPlan ? "On." : "Off: tasks are only proposed when something changes."}</p>
        </div>
        <Switch aria-label="Weekly plan and growth report" checked={data.weeklyPlan} disabled={!data.canEdit} onCheckedChange={(on) => void onSwitch("weeklyPlan", on).catch((problem: unknown) => showError(problem))} />
      </Panel>

      <Panel className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="grid min-w-0 flex-1 gap-1">
          <h3 className={title}>Industry trend posts</h3>
          <p className={text}>
            Once a month Vistrial searches the web for what changed in your industry, and in the industries of up to three clients, and posts what was reported to the Briefing. A post needs at least two dated sources from different sites, linked on it. Trade press and public social posts both count. No task is created from a post.
          </p>
          <p className={text}>
            A month&apos;s reading uses at most {creditWords(data.trendCapCredits)} and says how many it used. {data.trendPosts ? "On." : "Off until you switch them on."}
          </p>
        </div>
        <Switch aria-label="Industry trend posts" checked={data.trendPosts} disabled={!data.canEdit} onCheckedChange={(on) => void onSwitch("trendPosts", on).catch((problem: unknown) => showError(problem))} />
      </Panel>
    </div>
  );
}

/** The settings fed by Convex. */
export function ApprovalSettings() {
  const shell = useWorkspaceShell();
  const workspaceId = shell?.workspaceId;
  const data = useQuery(api.approvals.settings, workspaceId ? { workspaceId } : "skip");
  const setLimit = useMutation(api.approvals.setSpendLimit);
  const setSwitch = useMutation(api.approvals.setSwitch);
  if (!workspaceId || !data) return null;
  return <ApprovalSettingsView key={String(data.spendApprovalCredits)} data={data} onLimit={(credits) => setLimit({ workspaceId, credits })} onSwitch={(key, on) => setSwitch({ workspaceId, key, on })} />;
}
