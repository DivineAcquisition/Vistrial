import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { historyLine, tierChipLabel, tierTone, type AssayScoreView } from "@/lib/assay/view";

/**
 * The lead page's Assay panel: the number and tier, why, and how it moved.
 * Reasons arrive already filtered for the viewer's access to transcripts.
 */
export function AssayScorePanel({ score, timeZone }: { score: AssayScoreView | null; timeZone?: string }) {
  if (!score) {
    return (
      <Panel className="p-6">
        <h2 className="text-sm font-medium text-strong">Assay score</h2>
        <p className="mt-2 text-sm text-dim">Assay has not scored this lead yet. It does within a minute of anything new happening.</p>
      </Panel>
    );
  }

  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium text-strong">Assay score</h2>
        <span className={score.early ? "opacity-60" : undefined}>
          <StatusBadge label={tierChipLabel(score)} tone={tierTone(score)} />
        </span>
        {score.early ? <span className="text-xs text-dim">Early score</span> : null}
      </div>
      {score.notes.length ? (
        <ul className="mt-2 space-y-1 text-xs text-dim">
          {score.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-dim">Raising it</h3>
          {score.raising.length ? (
            <ul className="mt-2 space-y-1 text-sm text-silver">
              {score.raising.map((reason) => (
                <li key={reason.ruleId}>{reason.text}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-dim">Nothing yet.</p>
          )}
        </div>
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-dim">Lowering it</h3>
          {score.lowering.length ? (
            <ul className="mt-2 space-y-1 text-sm text-silver">
              {score.lowering.map((reason) => (
                <li key={reason.ruleId}>{reason.text}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-dim">Nothing.</p>
          )}
        </div>
      </div>

      {score.hiddenCallReasons > 0 ? (
        <p className="mt-3 text-xs text-dim">
          {score.hiddenCallReasons === 1
            ? "1 reason based on a call is hidden for your access level."
            : `${score.hiddenCallReasons} reasons based on a call are hidden for your access level.`}
        </p>
      ) : null}
      {score.unclear.length ? (
        <p className="mt-3 text-xs text-dim">Unclear from the call: {score.unclear.map((item) => item.replaceAll("_", " ")).join(", ")}.</p>
      ) : null}

      {score.history.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-strong">How the score moved ({score.history.length})</summary>
          <ol className="mt-3 space-y-2 text-sm text-silver">
            {score.history.map((row) => (
              <li key={`${row.at}-${row.score}-${row.tier}`}>{historyLine(row, timeZone)}</li>
            ))}
          </ol>
        </details>
      ) : null}
    </Panel>
  );
}
