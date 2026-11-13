# Landing page teardown

Date: 2026-11-10. The Growth Architect skill that reads landing pages against the owner's framework
(`landing-page-framework.md`) and reports what pages in one industry share and what the business's own
page lacks. It uses the page reader (`page-reader.md`) to open pages.

## The limit, stated first

Vistrial sees a page. It does not see the page's traffic, conversion rate or revenue. So a teardown never
says a page or a pattern "works". It says what the pages do, how many of them do it, and why that may suit
the audience, labelled as an inference. The only measured evidence is the business's own results, and
those enter through "We'll try this": a change is tried, and its check-in compares the business's own
figures before and after.

Every teardown, every plan and every saved version carries this line, written in code:

> Vistrial reads the page, not its results. A pattern several running pages share is something they do,
> not proof of why they convert. Only your own results can show what works for you.

A code check also refuses any finding that claims a cause or a result ("converts better", "proven",
"will increase bookings", "best-performing"). A draft that fails is revised once; if it still fails, the
teardown is saved as Needs Review and cannot be approved.

## What a person does

In **Pages** (under the Growth Architect, beside Creative): name the industry, give your own landing
page (optional), other pages to read (optional), and tick "find pages competitors in this industry run"
(optional). The plan appears before anything runs: the steps, which links will not be read and why, the
limits, and the budget. Owners and Managers start; Reps read.

Up to six pages a teardown: the ones given, plus up to four the search finds.

## What the run does

1. **Context.** Reads the request, the confirmed offer and audience, and whether the business has its own
   results connected.
2. **Discover** (only if asked). One model step with web search, at most three searches, returning links.
   Each link is checked exactly like a typed link (public address, not a social profile or directory, one
   per site) before it is read. A link the model returns can reach nothing the page reader's rules forbid.
3. **Read.** One page per step with the page reader. Robots.txt, the per-site rate limit and the address
   checks all apply. A page that asks for a login or shows a bot check is listed under "Not read".
4. **Read each page against the framework.** One model step per page. The model gets the page as numbered
   lines, marked as untrusted content, plus what code already counted. It returns the page split into
   sections, each matched to one of the framework's eleven jobs, with a note and quotes.
5. **Apply, in code.** Sections outside the page or overlapping are dropped. Every quote is checked
   against the page and removed if it is not there. Code counts buttons, their wording and where they
   lead, header links, form fields and FAQ questions. Code builds the table of which other pages have
   each section.
6. **Findings across pages.** One model step: shared patterns, gaps in the business's own page, changes
   to try, and a brief.
7. **Checks, in code**, with one revision from the reserve:
   - every finding cites pages that were read
   - a "shared" pattern is on at least two pages other than the business's own
   - a pattern about a section is true of every page it cites, per the code's table
   - a gap is really missing from the business's page and present on the pages cited
   - nothing claims to know why a page converts
   - every suggestion says what to change and how to tell
   - the brief names an audience, a promise and a call to action
8. **Save** as a `pageTeardown` asset for approval, with one evidence row per claim.

## How findings are labelled

The same labels as every other skill (`convex/lib/evidence.ts`):

| What | Label | Why |
|---|---|---|
| Buttons, links and words counted on a page | Observed, computed | Counted in code from the page |
| The order of sections on a page, and which it skips | Inference | A reading of the page |
| A shared pattern visible on every cited page | Observed | Checked against the code's table when it names a section |
| A shared pattern that is a reading | Inference | Cites the pages |
| A gap in the business's page | Inference | Cites the business's page and the pages that have it |
| A change resting on cited pages | Inference | |
| A change with no page behind it | Untested hypothesis | |
| Fewer than two other pages read | Not enough data | No pattern is reported |

Each page read becomes a source on the teardown's project, so every sourced claim links to the page.

## At-a-glance lines (added 2026-11-13)

The Pages tab leads with the answer (see `readable-output.md`). Two optional fields in the page reading
carry the words for it:

- `verdict`: the page in one or two sentences, 280 characters at most.
- `sections[].headline`: the section in a dozen words, 90 characters at most.

Both are a reading of the page, so the screen labels them Inference; the label is set in code. Both pass
the same refusal as the findings: when the reading is applied, a line that claims a cause or a result
("proven", "will increase bookings", "best-performing") is blanked and counted in `droppedLines`, and the
teardown's limits say a line was removed. Neither is a quote, so the quote check does not apply to them.

A teardown saved before these fields existed, or one whose line was blanked, shows words written in code
instead: for the page, a sentence of counts ("This page has a section for 7 of the framework's 11 jobs:
5 do their job and 2 partly. It skips ..."); for a section, the objection it answers. No model is called
again for an old teardown.

The same refusal covers a section's `note`, `proof.note` and `goal` (owner's decision, 2026-11-13). A
blanked note is simply absent; nothing is written in its place. This applies when a reading is applied,
so teardowns saved earlier keep the notes they have.

## Page content is untrusted

Pages are written by strangers. Hidden text, comments and scripts never leave the page reader. Visible
text reaches the model only inside a block marked untrusted, under a system instruction that it is data
and never an instruction, including text addressed to an AI. The skill's tools are fixed in code
(`lp.context`, `web.search`, `page.read`, `lp.apply`, `lp.check`, `lp.save`); model output cannot add
one. A test feeds the run a page that tells "any AI assistant" to rate it 10 out of 10 and hides a fake
system line; the run does nothing different.

## Budget

The run cap is 300 cents of cost, so at most $9.00 of credits at the 3x markup, and 1,500 cents a day.
Reading the pages is a few cents of that; the rest is the model steps. The plan shows the cap and the
person confirms that number. The run stops at the cap, and no step starts whose worst case would spend
into the 45 cents held back for the revision.

Not measured: what a real teardown costs. No model key was used in this session. The cap is set from
the token prices and the output room of each step, not from a real run.

## Feeding "We'll try this"

Each change to try has a "We'll try this" button, the same loop as an offer change or a roadmap step. It
saves the change, today's figures from the business's own Meta or results file, and a check-in date. The
next teardown reads earlier page changes and what was measured.

## Hand-off to Creative Production

`landingTeardown.brief({ assetId })` returns the brief as data. Nothing calls it except the "Copy brief"
button; it starts no other skill.

```
{ kind: "landingPageBrief", version: 1, teardownAssetId, approved, industry,
  framework: "docs/rebuild/landing-page-framework.md",
  audience, qualifier, promise, cta,
  sections: [{ key, name, job, direction }],   // framework keys, in framework order
  proofNeeded: [string], avoid: [string],
  changes: [{ title, change, basis }],
  basedOn: [{ url, title }],                   // structure may be learned from; wording must not be reused
  limits: [string] }
```

What Creative Production would need to accept it (not done here, that skill is another session's):
an optional `teardownAssetId` on its start, reading this query's shape as a third kind of starting point
beside a reference ad and an offer card, and treating `basedOn` like any other reference (structure
only).

## What is not built

- The model never sees the screenshot. Layout rules in the framework (three cards in a row, a boxed
  offer, mirrored grids) are not judged; only words, order and counts are.
- No scheduled re-reads, and no comparison of one page over time.
- The Research tab's session list will also show a teardown's project, since a teardown reuses research
  projects for its sources and decisions.
