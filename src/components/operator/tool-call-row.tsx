"use client";

import { useState } from "react";
import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";
import { stepStateLabel, stepStateTone, toolLabel } from "@/lib/operator/labels";
import type { OperatorStepView } from "@/lib/operator/types";
import { helperClass } from "@/lib/ui";

export function ToolCallRow({
  step,
}: {
  step: Pick<
    OperatorStepView,
    "toolName" | "label" | "state" | "resultSummary" | "errorText" | "ui" | "arguments"
  >;
}) {
  const [open, setOpen] = useState(false);
  const label = step.label || toolLabel(step.toolName);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-sm text-white">{label}</span>
          {step.resultSummary ? <span className={`mt-0.5 block ${helperClass}`}>{step.resultSummary}</span> : null}
          {step.errorText ? <span className="mt-0.5 block text-xs text-flag-critical">{step.errorText}</span> : null}
        </span>
        <StatusBadge label={stepStateLabel(step.state)} tone={stepStateTone(step.state)} />
      </button>
      {open ? (
        <div className="border-t border-white/[0.06] px-3 py-3">
          {step.ui?.links.length ? (
            <ul className="space-y-1.5">
              {step.ui.links.map((link) => (
                <li key={`${link.href}-${link.id}`}>
                  <Link href={link.href} className="text-sm text-brand-300 hover:text-white">
                    {link.name}
                    {link.status ? ` · ${link.status}` : ""}
                    {link.score != null ? ` · ${link.score}` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <pre className="mt-2 overflow-x-auto text-xs text-dim whitespace-pre-wrap">
            {JSON.stringify({ arguments: step.arguments }, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
