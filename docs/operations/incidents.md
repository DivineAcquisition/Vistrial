# Incidents

Every incident is a row in `ops_incidents`: timeline, cause, impact, prevention, and whether/when the client was told.

Record from `/app/ops`. The dispatch-in-error walkthrough in staging is executed by `verify-hardening.sql` (halt + dispatch log + incident). Do not ship a runbook that has never been walked through; the dispatch path is the one that was executed in-repo.
