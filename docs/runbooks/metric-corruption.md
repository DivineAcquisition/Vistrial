# Runbook: data corruption in a metric a client has already been shown

**Detection.** A reporting figure disagrees with the raw tables, or a client forwards a screenshot that cannot be reproduced. First check: recompute from `leads` / `touches` / `revenue_log` / `reporting_snapshots` for that org and range. Do not "fix" the screenshot.

**Immediate action.** Stop sending that report. Mark the snapshot stale (re-run reporting job). If the corruption is in source rows, halt dispatch only if outbound copy would repeat the lie. Do not silently rewrite history the client already saw.

**Client communication.** DA tells that owner the same day, before the next scheduled report: the number they were shown is wrong, here is the corrected figure, here is what we know about the cause, here is what we do not know yet. A client who finds the error themselves will not stay.

**Resolution.** Incident with the wrong number, the right number, who saw it, and the query that proves the fix. Prevention is usually a migration two-phase or a reporting job that had stopped running.
