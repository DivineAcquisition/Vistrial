"use client";

export const OPERATOR_OPEN_RUN_EVENT = "vistrial:operator-open-run";

export function OpenOperatorRunButton({
  runId,
  requestText,
  status,
  createdAt,
}: {
  runId: string;
  requestText: string;
  status: string;
  createdAt: string;
}) {
  return (
    <button
      type="button"
      className="w-full rounded-xl border border-white/[0.06] px-3 py-2 text-left"
      onClick={() => {
        window.dispatchEvent(new CustomEvent(OPERATOR_OPEN_RUN_EVENT, { detail: { id: runId } }));
      }}
    >
      <p className="text-sm text-white">{requestText}</p>
      <p className="mt-1 text-xs text-dim">
        {status} · {new Date(createdAt).toLocaleString()}
      </p>
    </button>
  );
}
