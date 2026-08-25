# What Vistrial does with call data

Prospects on those calls did not agree with Vistrial. They agreed, if at all, with the client. The client's disclosures have to be true. This is what is actually true.

**Ingest.** When a recorder (Fathom, Fireflies, Zoom, HighLevel, or a pasted transcript) sends a transcript, Vistrial stores the text on the call record, matches it to a lead when it can, and otherwise holds it unmatched until an operator assigns or discards it. Audio is not stored.

**Extract.** A language-model job reads the transcript and writes a structured extraction: summary, objection, budget/timeline/authority signals, next step, and verbatim quotes that must appear in the transcript. Extractions and objections remain after the raw transcript is purged.

**Draft.** Follow-up drafts may use extraction fields and voice examples. A human must approve every message. Vistrial does not send a message because a model produced one.

**Retain.** Raw transcript text is kept for a bounded window per workspace (default 365 days, not forever). After that the text and any recording URL are cleared. The call row, the extraction, and the objections stay. Webhook payloads used for replay are kept 14 days. Notification records 90 days. Leads, touches, scores, and revenue stay for the life of the relationship.

**Access.** Operators in that workspace see transcripts and briefs they are allowed to see. DA operators see across workspaces for support. Cross-client benchmarks never include raw transcripts.

**Leave.** The client can export the workspace as JSON. When the relationship ends, Vistrial disconnects the CRM, stops dispatch, holds data for an agreed grace period (default 30 days), then deletes the workspace — including baseline tables and notification records — and recomputes aggregates so the client is not still inside someone else's benchmark.
