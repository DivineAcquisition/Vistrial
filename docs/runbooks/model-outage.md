# Runbook: model API outage (extraction and drafting)

**Detection.** `extraction_fail:<orgId>`, `extraction_jobs.status = dead` with `anthropic_http` / `anthropic_timeout`, or follow-up jobs `last_error` similarly. First check: Anthropic status, then `ANTHROPIC_API_KEY` for **this** environment (a shared key is a defect).

**Immediate action.** Do not disable webhooks. Transcripts must still land. Extraction and drafting retry via existing job queues. Do not paste transcripts into another vendor as a workaround.

**Client communication.** If extraction is delayed more than two hours during the client's working day, DA tells the owner: calls are stored; briefs and drafts are delayed; nothing was sent to prospects. Separate the extraction outage from the drafting outage in the sentence so they know which surface is dark.

**Resolution.** When Anthropic recovers, queues drain. Record spend spike and error rate. Prevention: keep env keys separate so a staging test cannot burn production quota.
