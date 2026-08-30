# Runbook: CRM API outage or breaking change

**Detection.** `ghl_connections.status = broken`, `crm_broken` notifications in the DA console, or LeadConnector HTTP 401/410 on refresh. First check: LeadConnector status, then `last_refresh_error` (never log the token).

**Immediate action.** Halt dispatch for workspaces that would otherwise retry into a broken API if sends are failing closed already — they should be. Do not rotate to a production app key from staging. Wait on LeadConnector or complete their breaking-change migration in a branch with a tested rollback.

**Client communication.** DA tells owners whose CRM is disconnected within one hour: the CRM is not accepting Vistrial, follow-up send is paused, inbound leads may queue. Give a next update time.

**Resolution.** Reconnect, verify one webhook processed, record the incident including the LeadConnector change if any.
