import type { Enums } from "@/types/database";

export type CallScoreSignal = {
  factor: string;
  text: string;
};

export function callScoreReasoning(args: {
  callId: string;
  callType: Enums<"call_type"> | null;
  callAt: string | null;
  explanation: string;
  signals: CallScoreSignal[];
  mapping: string;
}): string {
  const when = args.callAt ? args.callAt.slice(0, 10) : null;
  const type = args.callType ? `${args.callType} ` : "";
  const source = when
    ? `Call ${args.callId} (${type.trim()} ${when})`.replace(/\s+/g, " ")
    : `Call ${args.callId}`;
  const quoted =
    args.signals.length === 0
      ? "The call did not produce a mappable signal on a scoring factor."
      : args.signals
          .map((signal) => `${signal.factor} “${clipSignal(signal.text)}”`)
          .join("; ");
  return `${args.explanation} ${source} is the source. Call evidence replaced application answers where they conflicted; nothing was averaged. Signals used: ${quoted}. ${args.mapping}`.trim();
}

function clipSignal(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 180 ? `${trimmed.slice(0, 180)}…` : trimmed;
}
