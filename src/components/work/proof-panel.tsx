"use client";

import type { FunctionReturnType } from "convex/server";

import { Clock, Target, TrendingUp } from "@/components/icons";
import { Panel } from "@/components/ui/panel";
import type { api } from "../../../convex/_generated/api";

import { SectionTitle } from "./work-shell";

export type ProofData = Extract<FunctionReturnType<typeof api.dealmakerProof.summary>, { connected: true }>;

/** How Dealmaker is doing, from the business's own CRM: before and after, deals involved, time saved. */
export function ProofPanel({ proof }: { proof: ProofData }) {
  const ba = proof.beforeAndAfter;
  return (
    <Panel className="grid gap-4 p-4 sm:p-6" data-proof>
      <SectionTitle icon={TrendingUp}>How Dealmaker is doing</SectionTitle>
      <div className="grid gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Before and after</h3>
        {ba.ready ? (
          <>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-3 font-normal">Measure</th>
                    <th className="py-1 pr-3 font-normal">Before</th>
                    <th className="py-1 font-normal">After</th>
                  </tr>
                </thead>
                <tbody>
                  {ba.rows.map((row) => (
                    <tr key={row.label} className="border-t border-border" title={row.basis}>
                      <td className="py-1.5 pr-3 text-foreground">{row.label}</td>
                      <td className="py-1.5 pr-3 text-foreground tabular-nums">{row.before}</td>
                      <td className="py-1.5 text-foreground tabular-nums">{row.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{ba.note}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{ba.why}</p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Target aria-hidden className="size-3.5" />
            Deals involved
          </h3>
          <p className="text-sm text-foreground">{proof.involved.words}</p>
          <p className="text-xs text-muted-foreground">Deals where Dealmaker&apos;s brief or follow-up was used. Involved, not caused.</p>
        </div>
        <div className="grid content-start gap-1.5">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Clock aria-hidden className="size-3.5" />
            Time saved: {proof.saved.words.replace(/^About /, "about ")}
          </h3>
          <ul className="grid gap-0.5 text-xs text-muted-foreground">
            {proof.saved.items.map((item) => (
              <li key={item.key}>
                {item.label}: {item.count} × {item.minutesEach} minutes
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
