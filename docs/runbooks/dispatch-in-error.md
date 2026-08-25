# Runbook: messages dispatched in error (including a suppressed contact)

This is the runbook that matters most. A real prospect received something they should not have.

**Detection.** Client complaint, operator report, or a send to a suppressed contact in `ghl_dispatches` (`status = sent` joined to a suppressed lead). First check: `ghl_dispatches` for that org in the last hour — **preserve the log**. Do not delete rows to "clean it up".

**Immediate action.**
1. Halt dispatch org-wide immediately: Operator console → Halt dispatch, or `halt_org_follow_up_sequences(org_id, actor)`. This is the Prompt 10 control. It also kills queued dispatches.
2. Scope from the dispatch log: who, which lead, channel, `sent_at`, `ghl_message_id`. Export that query; it is the truth.
3. Do not send a "sorry" from Vistrial to the prospect. The client owns that relationship.

**Client communication.** DA phones or emails the owner **before they hear it from a prospect**, as soon as scope is known — minutes, not the next morning. Script: "A message went out that should not have. We halted all sending for your workspace at `<time>`. Here is who was contacted and with which channel. We have not deleted the log. We will not resume sending until you say so." If a suppressed contact was included, say that plainly.

**Resolution.** Keep halt on until the owner unhalts. Record the incident with timeline, cause, impact (count of sent rows), prevention. Walkthrough of this exact path is in `verify-hardening.sql` (halt + dispatch log + incident row).
