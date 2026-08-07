# Audit — Prompts 7, 8, and 9

Audited branch: `cursor/team-accounts-ba2e` (includes Prompt 7 → 8 → 9 stacked).  
Standard: the three source briefs’ Definitions of Done. Code that differs from a brief is a defect unless the brief is ambiguous (listed under Ambiguities).

---

## Summary

| Prompt | Implemented | Partial | Missing | Cannot verify | Complete? |
|--------|-------------|---------|---------|---------------|-----------|
| **7 — Attention View** (18) | 15 | 3 | 0 | 0 | **No** — three Partials remain on the stacked HEAD |
| **8 — Territory · Exclusivity** (17) | 12 | 5 | 0 | 0 | **No** — conflict-on-create, map geometry, and related Partials remain |
| **9 — Team Accounts** (20) | 14 | 6 | 0 | 0 | **No** — MFA at sign-in, Auth same-email, portal path, and related Partials remain |

---

## Prompt 7 — The Attention View

| # | Verdict | Where / none | Note |
|---|---------|--------------|------|
| 1 | Implemented | `lib/auth.ts` `homeForTeamSession`; `proxy.ts` `ADMIN_HOME` | Successful team sign-in lands on `/attention`. |
| 2 | Partial | `lib/attention/types.ts` `ATTENTION_TYPES` | Brief required exactly ten types. HEAD has thirteen (Prompt 8 added three). Prompt 7 commit `87ea13b` had ten. |
| 3 | Implemented | `lib/attention/rank.ts` `compareItems`, `collapseRows` | Sorted by `TYPE_PRIORITY`, then escalated, then age — not by feature-area sections. |
| 4 | Implemented | `lib/attention/types.ts` `TYPE_PRIORITY`; `tests/attention.test.ts` | `failed_payment` = 1; `awaiting_human_touch` = 8 above no-method / expiring / below-minimum (9–11). |
| 5 | Implemented | `components/attention/actions.tsx`; gatherers in `lib/attention/items.ts` | Retry payment, resend notice, uphold/resolve dispute, payment link — inline. |
| 6 | Implemented | `lib/attention/items.ts` pending-confirmation actions | Links to `/queue`, not inline confirm. |
| 7 | Implemented | `lib/attention/rank.ts` `formatAge`; `components/attention/list.tsx` | Age shown on each row. |
| 8 | Implemented | `lib/attention/types.ts` `ESCALATION_MS`; `rank.ts` `isEscalated` / `compareItems`; list TonePill | Thresholds for original ten: 0 / 4h / 24h / 48h / 72h. Escalated sorts above non-escalated in band. |
| 9 | Implemented | `lib/attention/items.ts` (header comment + gather queries) | Original ten clear when queries stop matching. No dismiss for those. (`acknowledge_match` is Prompt 8 exclusivity only.) |
| 10 | Implemented | `lib/attention/rank.ts` `collapseRows`; `COLLAPSE_AT = 3` | Expandable group with count and oldest age. |
| 11 | Implemented | `components/attention/filter.tsx`; `app/(app)/attention/page.tsx` | Client filter via search param. |
| 12 | Implemented | `components/attention/list.tsx` empty `Panel` | “Nothing needs attention today” — positive clear day. |
| 13 | Implemented | `components/shell/sidebar.tsx`; `countAttentionItems` / `countQueue` | Badges on Attention and Queue; SSR on navigation. No `setInterval` / WebSocket / polling in app TS/TSX. |
| 14 | Implemented | `lib/attention/digest.ts` `runAttentionDigest`; `app/api/jobs/attention-digest/route.ts` | Empty list → `skipped`, no email. Hour from `app_settings`; delivery recorded. |
| 15 | Implemented | `app/(app)/attention/page.tsx`; `components/attention/list.tsx` | Item count and operational copy only; no charts or revenue totals on screen. |
| 16 | Partial | Stacked branch vs `87ea13b` | Prompt 7 itself was additive. Current HEAD also changes ingest (cross-client flag) and auth (team gate) from later prompts. |
| 17 | Partial | e.g. `components/settings/inbound-test-tool.tsx` placeholders; `lib/schemas/client.ts` `DEFAULT_CRITERIA_PLACEHOLDER` | Attention surface has no sample rows. Brief forbids sample/lorem **anywhere**; form/test placeholders exist elsewhere. |
| 18 | Implemented | `tsconfig.json` `"strict": true`; typecheck reported clean on this branch | Strict mode enabled; project typechecks. |

### Prompt 7 — Section 3 traces

| Check | Result |
|-------|--------|
| Ordered by priority/age vs feature grouping | Priority bands then age within band (`rank.ts`). Not grouped by feature in the UI. |
| Failed payments rank first | Yes (`TYPE_PRIORITY.failed_payment === 1`). |
| Manual dismissal | Not for original ten. Prompt 8 adds Acknowledge for cross-client matches (`acknowledged_at`). |
| Aging thresholds | Exact for original ten. Exclusivity types on HEAD use 0 / 24h / 48h (Prompt 8). |
| Polling / websocket / live refresh | None found. |
| Charts / metrics on screen | None. |
| Digest when empty | Does not send (`digest.ts` lines 154–166). |

---

## Prompt 8 — Territory · Exclusivity

| # | Verdict | Where / none | Note |
|---|---------|--------------|------|
| 1 | Implemented | `011_territory_exclusivity.sql` seed; `components/settings/category-settings.tsx`; `createServiceCategory` | Fifteen seeded; add is insert-only; assignments in `client_categories` untouched. |
| 2 | Implemented | `client_categories` PK; `territories.client_id`; `exclusivity-panel.tsx` | Multiple categories and territories supported. |
| 3 | Implemented | `territories` table vs `appointment_definitions.service_area`; `exclusivity-panel.tsx` | Separate fields; both shown; no derivation. |
| 4 | Partial | `saveClientCategoriesAction`, `addTerritoryAction` only | Conflict runs before those saves. **`createClientAction` / `updateClientAction` do not conflict-check.** |
| 5 | Implemented | `lib/actions/territory.ts` conflict returns; `exclusivity-panel.tsx` | Blocks save; names other client, shared categories, overlap nature. |
| 6 | Implemented | `overrideConflictAction`; `listOverridesForClient`; both clients `exclusivity_status = overridden` | Written reason required; shared override row visible on both; status set on both. Upsert can overwrite prior reason. |
| 7 | Implemented | `listActiveExclusivityPeers` `.eq("status", "Active")` | Paused/churned excluded from conflict pool (soft release). |
| 8 | Implemented | `lib/territory/conflict.ts` `compareTerritories` mixed-type branch | Returns `certainty: "possible"`. |
| 9 | Partial | `components/territory/map.tsx` | Category filter and colouring exist. Radius = circles. **Postal/named = markers (or omit), not filled areas.** |
| 10 | Partial | `flagCrossClientMatches`; `handleLeadReceived` try/catch | Never blocks ingest. Match row links both leads; **no per-lead flag surface**; unfiltered attention emits one item (defaults to client_a). |
| 11 | Implemented | `appendExclusivityAttention` both-confirmed branch; `ESCALATION_MS` 0 | Escalates when both leads have confirmed/disputed/billed appointments. |
| 12 | Implemented | `types.ts` slotting; `appendExclusivityAttention` after item 10 | Three types between disputes and pending; original ten relative order preserved (priority numbers shifted). |
| 13 | Implemented | none (search) | No lead routing / assignment / distribution between clients. |
| 14 | Partial | `lib/ingest/pipeline.ts` additive flag; attention type list | Ingest/confirmation/billing cores otherwise intact; ingest **was** modified; attention priorities renumbered. |
| 15 | Implemented | no matches under `app/(portal)` / portal components | Portal shows definition `service_area` only — not exclusivity territories. |
| 16 | Partial | map / exclusivity empty copy | Honest empties when no territories. Postal/named-only clients can show a blank basemap with no empty copy. No sample territory rows. |
| 17 | Implemented | `tsconfig.json` strict; typecheck on branch | Compiles under strict mode. |

### Prompt 8 — Section 3 traces

| Check | Result |
|-------|--------|
| Exclusivity vs service_area separate | Yes — different storage; both displayed; not derived. |
| Conflict before save and blocks | Yes for category/territory exclusivity saves; not for client create/update. |
| Override reason on both clients | Yes (shared row + both status). |
| Possible conflict for incomparable types | Yes. |
| Lead routing / assignment / distribution | Not built. |
| Cross-client duplicate blocks | No. |
| Three attention items vs rebuild | Added via append; original relative order kept. |
| Portal territory visibility | No exclusivity territory data in portal. |

---

## Prompt 9 — Team Accounts

| # | Verdict | Where / none | Note |
|---|---------|--------------|------|
| 1 | Partial | `team_users` vs `client_users`; `/login` vs `/portal/login` | Separate tables and gates. **Portal sign-in moved off Prompt 6’s `/login` to `/portal/login`.** Shared Supabase Auth identity pool. |
| 2 | Implemented | `lib/team/permissions.ts`; `requirePermission` in actions | Three roles; mutations refuse server-side even if UI is reachable. |
| 3 | Implemented | `clients.ts` / `billing.ts` permission gates | Member lacks `manage_commercial`, `manage_definitions`, `manage_charges`. |
| 4 | Implemented | `changeTeamRoleAction`, `deactivateTeamUserAction`, `bootstrapOwnerIfNeeded` | App refuses last-Owner demote/deactivate. No DB constraint (commented gap in migration). |
| 5 | Implemented | no signup route; `proxy.ts` public paths | No public signup; invite-only. |
| 6 | Partial | `lib/actions/auth.ts` `GENERIC_FAILURE` vs `LOCKED_MESSAGE` | Generic failure used for wrong password / non-team. **Locked accounts get a distinct message that confirms the address has a team account.** |
| 7 | Implemented | `INVITE_DAYS = 7`; `issueInviteToken`; accept clears hash | Expiry, one-use, resend replaces hash. |
| 8 | Partial | invite allowed; `createUser` failure path | Invite of a portal email is allowed and rows are not linked. **Accept cannot create a second Auth user for the same email.** |
| 9 | Partial | `app/(auth)/onboarding/*`; `OnboardingWizard` | Own route, no app shell, four steps + indicator. **`onboardingCompleteAction` calls `redirect()` inside `try/catch`, which can swallow the redirect.** |
| 10 | Partial | onboarding MFA enroll/verify; `signInAction` | Owner/Admin cannot skip enroll in UI. **Sign-in never challenges MFA / AAL2; `requireAdmin` does not require `mfa_enabled`.** |
| 11 | Implemented | `onboarding_step` resume on `/onboarding/[token]` and `/onboarding/continue` | Resumes stored step; password once set skips password step. |
| 12 | Implemented | `deactivateTeamUserAction` | Revokes tracked sessions + `auth.admin.signOut(..., "global")`. |
| 13 | Implemented | no delete team user API; `countWorkByActor` | Deactivate only; attribution ids survive. |
| 14 | Implemented | `changeTeamRoleAction` self-check | Cannot change own role. |
| 15 | Implemented | `completePasswordResetAction` | Revokes app sessions + global Auth sign-out. |
| 16 | Implemented | `lib/team/activity.ts` insert-only; `team_activity_log` | No app update/delete path; separate from appointment/charge history. Not DB-enforced. |
| 17 | Implemented | `bootstrapOwnerIfNeeded` in `lib/auth.ts` | First sign-in with zero owners creates Owner; skips password step when migrated. |
| 18 | Partial | portal login/sign-out; `requireAdmin` now team-gated | Ledger operational flows largely intact; **portal auth surface and admin gate changed.** |
| 19 | Implemented | `app/(app)/team/page.tsx`, activity empty states | Honest empties; no sample team users. |
| 20 | Implemented | strict + typecheck on branch | Compiles under strict mode. |

### Prompt 9 — Section 3 traces

| Check | Result |
|-------|--------|
| Separate populations | Separate tables and sign-in routes; shared Auth user pool; no account switcher. |
| Portal auth altered | **Yes** — `/portal/login` + proxy/sign-out changes vs Prompt 6 shared `/login`. |
| Server-side permission (samples) | `createClientAction` → `manage_commercial`; `createDefinitionVersionAction` → `manage_definitions`; `createPaymentLinkAction` → `manage_charges`; `saveIntegrationNotifyEmailAction` → `integration_secrets`. |
| Zero Owners | Blocked on demote/deactivate in app; bootstrap creates first Owner; no DB trigger. |
| Member → commercial/definitions/charges | Can open pages; write actions refused. |
| Activity log append-only | Insert-only in app; service role could still mutate. |
| Onboarding resume + no shell | Yes under `(auth)`; completion redirect bug (see findings). |

---

## Findings (by severity)

### Critical

1. **MFA not enforced at team sign-in**  
   - **File:** `lib/actions/auth.ts` (`signInAction`); `lib/auth.ts` (`requireAdmin`)  
   - **Brief (P9 §5 / DoD 10):** Owners and Admins must complete 2FA; 2FA is a real control.  
   - **Code:** Onboarding can enroll/verify TOTP, but password sign-in never challenges MFA, and `requireAdmin` admits active users without checking `mfa_enabled`.

2. **Same email cannot become a usable separate team account under Supabase Auth**  
   - **File:** `lib/actions/team.ts` (~121–125, ~328–337)  
   - **Brief (P9 DoD 8):** A client-user email may still be invited as team, with no accounts linked.  
   - **Code:** Invite is allowed; accept fails when Auth already has that email. Populations stay unlinked in SQL but dual working accounts are impossible.

3. **Portal authentication path changed from Prompt 6**  
   - **File:** `app/(auth)/portal/login/page.tsx`; `proxy.ts`; `lib/actions/auth.ts` `signInPortalAction` / `signOutPortalAction`  
   - **Brief (P9 DoD 1 / 18; P6):** Client portal must work exactly as before; separate surfaces are required, but Prompt 6 signed portal users in at `/login`.  
   - **Code:** Returning portal users must use `/portal/login`; team `/login` signs them out with generic failure.

4. **Exclusivity status `overridden` disables later conflict checks for that client**  
   - **File:** `lib/actions/territory.ts` `addTerritoryAction` / `saveClientCategoriesAction` (gate on `exclusivity_status === "active"`)  
   - **Brief (P8 §4–6):** Conflicts are pair-level; overrides are for specific conflicts with a reason.  
   - **Code:** After any override, status becomes `overridden` and subsequent territory/category saves skip conflict detection entirely — including against third clients.

5. **`onboardingCompleteAction` can swallow Next.js `redirect()`**  
   - **File:** `lib/actions/team.ts` (~552–555)  
   - **Brief (P9 §5 / DoD 9):** Completing step four marks active and lands on attention.  
   - **Code:** `redirect("/attention")` is inside `try/catch`; redirect throws and may surface as `{ ok: false }` after the user was already marked done.

### Major

6. **Client create/update never runs exclusivity conflict detection**  
   - **File:** `lib/actions/clients.ts` `createClientAction`, `updateClientAction`  
   - **Brief (P8 §4 / DoD 4):** When a client is created, or territory/categories change, check before save.  
   - **Code:** Only category save and territory add check conflicts.

7. **Territory map does not render postal/named regions as filled areas**  
   - **File:** `components/territory/map.tsx` (~171–188)  
   - **Brief (P8 §5 / DoD 9):** Postal and region territories render as filled areas.  
   - **Code:** Markers (or nothing) with an explicit gap comment; no boundary dataset.

8. **Cross-client “flag on both leads” is a pair table, not lead-level flags**  
   - **File:** `lib/territory/cross-client.ts`; `lib/attention/items.ts` `appendExclusivityAttention`  
   - **Brief (P8 §6 / DoD 10):** Raise a flag on both leads and in the attention view.  
   - **Code:** One `cross_client_matches` row; attention shows one focused client item by default; no lead UI flags.

9. **Locked-account sign-in message enables account enumeration**  
   - **File:** `lib/actions/auth.ts` `LOCKED_MESSAGE`; `app/(auth)/login/page.tsx` `error=locked`  
   - **Brief (P9 §3 / DoD 6):** Failed sign-in is “Invalid email or password” and must not reveal whether an account exists.  
   - **Code:** Locked state returns a dedicated message (brief also asks for a lock explanation — see Ambiguities).

10. **Owner/Admin can finish onboarding orientation without MFA if already on that step**  
    - **File:** `lib/actions/team.ts` `onboardingCompleteAction` (~520–525)  
    - **Brief (P9 DoD 10):** Owners and Admins must complete 2FA.  
    - **Code:** Refusal only when `onboarding_step !== "orientation"`; orientation + `!mfa_enabled` is allowed through.

11. **Prompt 7 DoD “exactly ten types” violated on stacked HEAD**  
    - **File:** `lib/attention/types.ts`  
    - **Brief (P7 DoD 2):** Exactly the ten types; no others.  
    - **Code:** Thirteen types. (Prompt 8 required the three additions — conflict between briefs on a stacked branch.)

12. **Ingest pipeline modified (additive cross-client flag)**  
    - **File:** `lib/ingest/pipeline.ts` (~373–379)  
    - **Brief (P8 DoD 14 / P7 DoD 16):** Existing business logic unchanged / no change to ingestion.  
    - **Code:** Post-insert flag call (non-blocking). Behavior of lead creation otherwise same.

### Minor

13. **Override upsert overwrites prior reason**  
    - **File:** `lib/actions/territory.ts` `overrideConflictAction`  
    - **Brief:** Permanently recorded.  
    - **Code:** One row per pair; new override replaces reason rather than appending history.

14. **Map colour uses only the first category**  
    - **File:** `components/territory/map.tsx` (~143–144)  
    - Multi-category territories colour by `categories[0]`.

15. **Zero-Owner and activity-log append-only are application conventions only**  
    - **File:** `012_team_accounts.sql` comments; `lib/team/activity.ts`  
    - No DB trigger preventing zero Owners or UPDATE/DELETE on the log.

16. **Form / test placeholders resembling sample people**  
    - **File:** `components/settings/inbound-test-tool.tsx` (e.g. “Dana Whitfield”, `dana@example.com`); `lib/schemas/client.ts` `DEFAULT_CRITERIA_PLACEHOLDER`  
    - Input placeholders, not list sample rows; still conflicts with “no … lorem / sample … anywhere” wording in DoDs.

17. **Attention item count line shows a number when empty path is handled separately**  
    - Empty list uses the honest empty panel; not a defect beyond note that digest/email can include value-at-risk (allowed by P7 digest section, not the screen).

---

## Unrequested additions

Items present in these three areas that do not appear in the three briefs (reported without judging usefulness):

| Addition | Where |
|----------|--------|
| Team user **Unlock** action (for locked accounts) | `lib/actions/team.ts` `unlockTeamUserAction`; `components/team/user-actions.tsx` |
| `/account/password` dedicated force-reset landing | `app/(app)/account/password/page.tsx` |
| Owner **Integration secrets** settings panel (env presence + notify email) | `components/settings/integration-secrets.tsx`; `settings/page.tsx` |
| Tracked `team_sessions` with null approx location | `team_sessions` table; `insertTeamSession` |
| Topbar label changed from “Admin” to “Team” | `components/shell/topbar.tsx` |
| Map default center `[39.5, -98.35]` (continental US) | `components/territory/map.tsx` |
| Volume-drop windows hardcoded 14d / 14d and ≥50% / prior ≥3 | `lib/territory/volume.ts`; gatherer in `items.ts` |
| Cross-client attention treats disputed/billed as “confirmed” for escalation | `appendExclusivityAttention` appointment status filter |
| `COLLAPSE_AT = 3` as the collapse threshold | `lib/attention/types.ts` (brief said “many instances” without a number) |
| Digest subject includes total value at risk across items | `lib/attention/digest.ts` `composeDigest` (brief asked failed-payment value at risk; implementation also totals more broadly in subject) |

---

## Sample / placeholder data instances

Every match that looks like sample content or placeholder copy intended for the UI (not CSS `placeholder:` utility classes alone):

| File | Line(s) | Content |
|------|---------|---------|
| `components/settings/inbound-test-tool.tsx` | ~103 | `placeholder="Dana Whitfield"` |
| `components/settings/inbound-test-tool.tsx` | ~115 | `placeholder="+1 555 010 4477"` |
| `components/settings/inbound-test-tool.tsx` | ~127 | `placeholder="dana@example.com"` |
| `components/settings/inbound-test-tool.tsx` | ~139 | `placeholder="Roof replacement"` |
| `components/settings/inbound-test-tool.tsx` | ~151 | `placeholder="fall-roofing-retarget"` |
| `lib/schemas/client.ts` | 18–19 | `DEFAULT_CRITERIA_PLACEHOLDER` prose example criteria |
| `components/clients/definition-dialog.tsx` | uses above | Criteria / job-type placeholders |
| `components/clients/client-dialog.tsx` | uses above | Same |
| `components/appointments/decisions.tsx` | ~28, ~50 | Example note placeholders (“40 miles outside…”, “Word for word…”) |
| `components/appointments/record-appointment-dialog.tsx` | ~195 | `placeholder="Roof replacement"` |
| `components/billing/actions.tsx` | ~283 | Example credit note placeholder |
| `supabase/migrations/011_territory_exclusivity.sql` | seed insert | **Fifteen service categories** — required by Prompt 8 seed list, not UI sample rows |

No hardcoded sample territories, sample team users, or lorem ipsum paragraphs were found in the Prompt 7–9 list UIs. Seeded categories are required by Prompt 8.

---

## Empty states (Prompt 7–9 lists)

| Surface | Honest empty state? |
|---------|---------------------|
| Attention list | Yes — “Nothing needs attention today” |
| Territory map (zero territories) | Yes — “No active territories” |
| Client exclusivity territories list | Yes |
| Team people list | Yes — “No team users yet.” |
| Invitations list | Yes — “No invitations yet.” |
| Activity log | Yes — “No activity recorded yet.” |
| Account sessions | Yes — “No tracked sessions.” |
| Map with only postal/named territories | **Weak** — basemap may render with no features and no dedicated empty copy |

---

## Changed existing behavior (forbidden by briefs)

| Change | Where | Brief conflict |
|--------|-------|----------------|
| Ingest post-lead cross-client flag | `lib/ingest/pipeline.ts` | P7/P8 “do not change ingestion” (additive, non-blocking) |
| `requireAdmin` now requires `team_users` (or bootstrap) | `lib/auth.ts` | Replaces “any Auth user without `client_users` is admin” |
| Portal sign-in/sign-out routes | `/portal/login`, proxy, portal shell | P6 path altered under P9 |
| Permission gates on existing client/billing/portal/territory/settings actions | `lib/actions/*.ts` | Necessary for P9 roles; changes who can succeed on those actions |
| Attention type list and priorities expanded/renumbered | `lib/attention/types.ts` | P7 “exactly ten”; required by P8 |
| Sidebar calls `requireAdmin` and filters Team nav | `components/shell/sidebar.tsx` | Auth/nav behavior change |

Confirmation queue, charge assembly math, and portal data scoping were not rewritten; portal invite accept route `/invite/[token]` remains.

---

## Hardcoded business rules

| Rule | Value | Where |
|------|-------|-------|
| Failed payment escalate | immediate (0) | `ESCALATION_MS` |
| Human touch escalate | 4 hours | `ESCALATION_MS` |
| Dispute / cross-client duplicate escalate | 24 hours | `ESCALATION_MS` |
| Pending confirmation / volume_drop escalate | 48 hours | `ESCALATION_MS` |
| Other original attention types escalate | 72 hours | `ESCALATION_MS` |
| Attention collapse threshold | 3 | `COLLAPSE_AT` |
| Card expiring window | 30 days | `lib/attention/items.ts` |
| Below-minimum cycle closing window | 3 days | `lib/attention/items.ts` |
| Digest default hour | 07:00 UTC | `DEFAULT_DIGEST_HOUR` (overridable in settings) |
| Cross-client match window default | 90 days | `DEFAULT_CROSS_CLIENT_WINDOW_DAYS` (overridable) |
| Team invite TTL | 7 days | `INVITE_DAYS` |
| Password reset TTL | 1 hour | `requestPasswordResetAction` |
| Max failed sign-ins default | 5 | `app_settings` / `lockout.ts` |
| Volume drop windows / ratio | 14d vs 14d, ≥50%, prior ≥3 | `lib/territory/volume.ts` |
| Min password length | 12 | `lib/team/password.ts` |
| Attention query row caps | e.g. 500 | `lib/attention/items.ts` |

---

## Ambiguities

These are open readings for you to resolve — not decisions by this audit.

1. **Prompt 7 “exactly ten types” vs Prompt 8 “add three types” on one codebase**  
   Stacked HEAD cannot satisfy both literally. Interpreted as: Prompt 7 alone required ten; Prompt 8 intentionally extends the same view.

2. **Prompt 9 “Failed sign-in reads Invalid email or password” vs “A locked account shows its own message”**  
   Both are in the brief. Code prefers the lock-specific message when status is locked, which reveals that the email belongs to a lockable team account.

3. **Prompt 9 “separate sign in surfaces” vs “client portal works exactly as before”**  
   Separate surfaces imply a portal login route; Prompt 6 used `/login` for both. Interpreted as a real conflict; recorded as Partial/Critical alteration of Prompt 6.

4. **Prompt 8 “Creating or changing a client”**  
   Could mean any client row write, or only exclusivity-related changes (territory/categories). Code implements the narrower reading.

5. **Prompt 8 “flag on both leads”**  
   Could mean two attention items / two lead-row badges, or one match record linking both IDs. Code implements the match-record reading.

6. **Prompt 8 “recorded permanently on both clients” for overrides**  
   Could mean two rows, or one shared row visible from both. Code uses one ordered-pair row plus status on both clients.

7. **Prompt 9 MFA “mandatory”**  
   Could mean mandatory enrollment during onboarding only, or mandatory challenge on every sign-in. Code implements enrollment; not login challenge.

8. **“No sample / placeholder … anywhere in the codebase”**  
   Could ban only fake list rows, or also HTML input `placeholder=` hints and seeded reference data. Seeded categories are explicitly required by Prompt 8.

9. **Prompt 7 collapse “many instances”**  
   No numeric threshold in the brief; code chose `3`.

10. **Digest “total value at risk across failed payments”**  
    Subject line uses a broader sum; body has a failed-payment-specific line. Whether the subject must be failed-payment-only is unclear.
