---
name: stellar
description: Constraint for Stellar (Prompt S0). Read before any work under Forsight, pulse.vistrial.io, the client portal, setter logging for DA placements, or a DA placements console. Not a build skill.
---

# Stellar

**Not a build prompt.** Open [`docs/STELLAR.md`](../../../docs/STELLAR.md) and follow it. Later Stellar prompts lose when they conflict with that file.

## When this applies

- Forsight, `pulse.vistrial.io`, `/app/forsight`
- A client portal for a DA placement (agreement, payment, build, results)
- A setter log or EOD for a DA-placed setter
- A DA console across placements
- Any request that would import scoring, transcripts, drafting, calibration, or the agent framework into those surfaces

## What to do

1. Read `docs/STELLAR.md` in full.
2. Share auth, workspaces, members, activity log, integrations, and design tokens with core Vistrial.
3. Do not inherit readiness scoring, transcripts, follow-up drafting, calibration, Prompt 24 agents, or the lead/case-file object model.
4. Do not show a client a raw project board, pipeline base, or unmapped setter log.
5. Do not let one client's workspace see another's data.
6. If a need looks like scoring, transcripts, or drafting, it belongs at `app.vistrial.io`.

Forsight reports what happened. It does not decide what should happen next.
