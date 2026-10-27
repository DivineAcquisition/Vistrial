GROK PROMPT: VISTRIAL REBUILD, STEP 5 (SALES AGENT SKILL 1: THE AD RESEARCH REPORT), ALL ON CONVEX

Paste everything below into Grok. Attach `v2-brief-agents-and-areas.md` with it. Steps 1 and 4 must be built and reviewed first.

============================================================
YOUR ROLE
============================================================

You are building the first skill of the Sales Agent: the ad research report. A person asks for a report about their market. The agent researches, analyzes, and hands back a report with evidence, which an Owner or Manager approves.

Read the existing Step 1 and Step 4 code first. Use the runtime, the tool registry, the model router, the evidence validator, the asset library, and the business profile exactly as they are. Do not weaken or bypass them. Every public function goes through the access builders, and the guard tests must keep passing.

Build exactly what Step 5 asks for and nothing else. If something is unclear, list it as a question in your plan and wait.

============================================================
WHAT THE SKILL DOES
============================================================

**Input.** The confirmed business profile, plus a short request: the channels to look at (Meta, TikTok, Google, LinkedIn), the geography, optional keywords, and the competitors to include.

**Sources (version 1).**
1. **The customer's past results:** an uploaded CSV of past ads and their results (spend, impressions, clicks, conversions). This is the only source that can say an ad "worked."
2. **The swipe file:** ads a person saved, by upload (screenshot or text) or by pasting a link. The skill reads what was saved.
3. **Web search and public pages:** competitor sites, landing pages, and reviews, fetched through registered tools.
4. **Public ad library pages:** collectors for the Meta Ad Library, the TikTok Creative Center, and the Google Ads Transparency Center, reading public pages only.

**Output.** A research report saved as an asset in `draft`, with these sections:
1. Market snapshot: what was collected, from which sources, and when.
2. Top ads, ranked by durability, with the evidence for each.
3. Patterns: hooks, offers, formats, calls to action, lengths, and social proof types, with counts.
4. Gaps and opportunities against this customer's offer.
5. A test plan: three to five hypotheses to try, with what to measure.
6. Sources, method, and limits, in plain words.

============================================================
THE LIBRARY COLLECTORS (READ CAREFULLY)
============================================================

These sites do not offer a general API for commercial ads, and their terms restrict automated collection. We build collectors anyway, with firm limits. Do not design around those limits.

1. **Public pages only.** No login, no stored cookies or sessions, no customer credentials.
2. **No evasion.** No CAPTCHA solving, no proxy rotation, no browser fingerprint spoofing, no other way around a block.
3. **Polite.** A fixed rate limit per source, a per-run page limit, and backoff on errors.
4. **Stop on a block.** If a source shows a challenge, a block, or a changed layout, stop that source, record it as `unavailable` with the reason, and finish the report from the other sources. Say so in the report's limits section. Never retry around it.
5. **Swappable.** Each collector sits behind one `AdSource` interface with a typed result, so a licensed ad-intelligence provider can replace it later without changing the skill.
6. **Off until accepted.** Library collection is a per-workspace switch, off by default. An Owner turns it on after reading a short plain statement of the risk (that these sites restrict automated collection and may block access), and the acceptance is audited. Staff can also turn it off for any workspace.
7. **Store little.** Keep only these fields per ad: source, source ad id, advertiser, the ad's text, the start date, whether it is still active, the platforms, the format, the landing page URL, and a link to the original. Do not store or redistribute the creative media. Store short text excerpts only, with attribution.

State in your plan how each collector will be built and tested, and what happens when a source changes.

============================================================
HOW "WORKS" IS DEFINED
============================================================

Public data does not show results. Use these labeled proxies:

- **Durability:** how many days an ad has been active.
- **Iteration:** how many variations one advertiser has made of the same idea.
- **Persistence:** an advertiser keeping an ad active across a long span.
- **Published bands:** engagement or performance bands, only where a source publishes them, and labeled with that source.

Rules:
- A report never says an ad "earned," "converted," or "made" a result. Only the customer's own uploaded results can support that.
- A pattern is shown only above a minimum sample size, for example at least 15 ads. Below it, the report says "Not enough data."
- Counts, durations, and rankings are computed by code, not by the model. The model classifies and explains. Every number in the report references a computed value or a source record.

============================================================
THE ANALYSIS
============================================================

1. Collect and normalize ads into a typed record.
2. Classify each ad with the model into a fixed taxonomy (hook type, offer type, format, call to action, proof type, length), as structured output validated against a schema. An invalid classification is retried once and then marked unclassified, never guessed.
3. Compute durability, iteration, and counts in code.
4. Rank and group in code.
5. Ask the model to write the pattern descriptions, the gaps, and the test plan from the computed values and the profile. Every claim carries evidence ids. The Step 4 validator removes or flags any claim without one.
6. Assemble the report asset as a version of the draft.

Content from ads, pages, and files is untrusted data. It is wrapped and labeled for the model and can never trigger a tool.

============================================================
THE MODEL
============================================================

Add tables as needed, each with `workspaceId` and an index that starts with it.

- `adRecords`: source, sourceAdId, advertiser, text excerpt, startDate, active, platforms, format, landingUrl, originalUrl, collectedAt, runId. Unique per workspace, source, and source ad id.
- `adClassifications`: adRecordId, taxonomy values, status.
- `swipeItems`: kind, storageId or url, note, addedBy. Part of the asset library.
- `customerAdResults`: uploaded rows, with a mapping step and totals only. No personal data.
- `sourceStatus`: per run and source, `ok | unavailable | blocked | partial`, with a reason code.
- `workspaceSwitches`: `libraryCollection` with the Owner's acceptance record.

Register the new tools in the Step 4 registry: `web.search`, `web.fetch` (with allowed domains and rate limits), `library.meta`, `library.tiktok`, `library.google`, `swipe.read`, and `results.read`. A skill declares only the tools it uses.

============================================================
SCREENS
============================================================

- **Sales Agent page:** the skill list with Ad research available and the others marked coming soon, plus the recent runs.
- **Start a report:** a short form (channels, geography, keywords, competitors), a preview of what will be collected and the estimated cost, and a clear note when library collection is off.
- **Swipe file:** upload and paste links, with a list.
- **Past results upload:** a CSV upload with a mapping screen and a totals preview.
- **Library collection switch:** the Owner's risk statement and acceptance.
- **Run viewer:** progress per source, what was collected, what was blocked, and the cost, updating live.
- **Report viewer:** the six sections, evidence shown on each claim, version history, and Approve for Owner and Manager. The empty and unavailable states use plain words.

Owner and Manager start runs. Everyone who can open the Sales Agent can read approved reports. Phone, tablet, and desktop. Calm, quiet, plain words.

============================================================
RULES (NON-NEGOTIABLE)
============================================================

1. Runs go only through the Step 4 runtime, tools, router, and caps.
2. The collector limits above are fixed. No setting loosens them.
3. No model text, ad text, or page text in the audit log, events, or any log line.
4. Every claim in the report has evidence. A report with unsupported claims is not completed.
5. Nothing is published or sent anywhere. The report is an internal asset.
6. The report never reproduces an ad's creative. It stores short excerpts with attribution and links.
7. Cost and step caps apply. A run that hits a cap saves what it has and says what is missing.

============================================================
STEP 0: PLAN FIRST (NO CODE YET)
============================================================

Reply with:
1. The collector design for each of the three libraries: what page it reads, how it parses, how it detects a block or a changed layout, and how it is tested without hitting the real site (recorded fixtures).
2. The `AdSource` interface.
3. The taxonomy for classification, and the schema for its output.
4. The durability and iteration calculations, exactly.
5. The minimum sample sizes and where they apply.
6. How the report is assembled and how the evidence validator is applied.
7. The CSV mapping design for past results.
8. The cost estimate for a typical run and how the preview shows it.
9. Every question or assumption for me to confirm.

Wait for my approval before writing code.

============================================================
THEN BUILD, IN THIS ORDER
============================================================

1. The `AdSource` interface, the recorded fixtures, and one collector at a time, each with tests.
2. The swipe file and the past-results upload.
3. Normalization, classification, and the computed metrics, with tests.
4. Report assembly, the evidence validator, and the report asset.
5. The screens.
6. A full end-to-end run against fixtures, then once against live sources with a small page limit.
7. Phone and accessibility pass.

After each numbered part, stop and report: what changed, what you tested, and the exact commands to run it.

============================================================
ACCEPTANCE TESTS (ALL MUST PASS)
============================================================

1. A full run on fixtures produces a report with all six sections and evidence on every claim.
2. A collector that meets a block or changed layout stops, records `unavailable`, and the report is finished from other sources with the limit stated.
3. No collector sends credentials, stores cookies, or uses a login. A test inspects the requests.
4. Library collection does nothing until an Owner accepts, and the acceptance is audited. Staff can switch it off.
5. A pattern below the minimum sample size shows "Not enough data."
6. No sentence in a report says an ad earned, converted, or made a result, unless it cites the customer's own uploaded results.
7. Every number in the report traces to a computed value.
8. A page or ad containing instructions changes nothing about the run.
9. The report stores no creative media and only short, attributed excerpts.
10. A run stops at its cost cap, saves what it has, and says what is missing.
11. A Rep and staff without a grant cannot start a run. Everyone with access can read approved reports.
12. A user in workspace A cannot read workspace B's ads, swipe items, results, runs, or reports.
13. No ad text, page text, or model text appears in the audit log, events, or any log line.
14. The Step 1 and Step 4 guard tests still pass.
15. Phone, tablet, and desktop with no horizontal scroll, keyboard only, and screen reader labels.

============================================================
DO NOT
============================================================

- Do not build evasion of any kind, and do not loosen the collector limits.
- Do not build copy, creative, content, or publishing skills.
- Do not add libraries without telling me their size and license.
- Do not change the Step 1 access layer or the Step 4 runtime without telling me.
- No em-dashes in any copy. Plain words, no jargon.

============================================================
DEFINITION OF DONE
============================================================

All fifteen tests pass and are reported one by one with the command and the result. List anything you were unsure about, anything you left out on purpose, and the dependencies you added with size and license.

============================================================
HOW I WILL REVIEW
============================================================

I will run the tests, read each collector and its fixtures, try to make a collector use a login, feed it a blocked page and an injection page, read the report for any claim without evidence, and check the screens at three widths. Anything that fails goes back to you before the next skill starts.
