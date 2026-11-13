# Models, the model switch, and OpenRouter

Design for four changes the owner asked for on 2026-11-13. Quoted words are the owner's.

- "ad creative generation not working it says: can't generate. Image making is not switched on yet. A
  platform admin adds the key."
- "we need to show actually model icon aka the LLM being used. Right now gpt and Claude & Gemini should be
  the only models available with others coming soon. For chat boxes and ad creative generation there should
  be a switch toggle for ad creative generation and other places where an AI model is actually used"
- "Lastly I am looking to introduce open router"

This document is PR 1 of 4. It decides; PRs 2 to 4 build. Nothing in this PR changes how the product runs.

**How the facts were checked.** Every statement about OpenRouter below was read from OpenRouter's own
documentation and its public API on 2026-11-13, not written from memory. The full notes, 243 word-for-word
quotes with the page each came from, are in
[`assets/openrouter-facts-2026-11-13.md`](assets/openrouter-facts-2026-11-13.md). References like "facts 3.3"
point at a section there. Model IDs, prices and capabilities come from
<https://openrouter.ai/api/v1/models>, <https://openrouter.ai/api/v1/models/{id}/endpoints>,
<https://openrouter.ai/api/v1/images/models> and <https://openrouter.ai/api/v1/endpoints/zdr> as they
answered that day.

**What was not checked.** No OpenRouter key exists in this environment, so no real call was made. Anything
the docs do not state is marked "not stated" and listed in section 8 as something the first real call must
prove. Where a decision rests on something unproven, the product keeps that path closed until it is proven.

---

## Questions for the owner, first

Each has a recommendation. Nothing below is switched on until these are answered; the build in PRs 2 to 4
follows the recommendations and each is one small change to reverse.

1. **Who may choose the model for a piece of work?** Proposed: Owners, Admins and Members (anyone who may
   start the work). The organization's default: Owners and Admins only. Or should Members always get the
   default?
2. **One default per organization, or per person?** Proposed: per organization, with the choice per piece
   of work on top. A person's last choice is not remembered.
3. **Strongest or sensible GPT?** Proposed: GPT-6.1 Sol ($2 / $10), because GPT-6 Astra ($10 / $50) would
   hit today's run caps before a research run finished. Offering Astra means raising caps for it, which is
   a spending decision.
4. **Gemini 4 Carbon or Argon** for the Thorough slot? Same price. Proposed: Carbon (section 1).
5. **Which stays the platform default?** Proposed: Claude direct, unchanged.
6. **GPT images.** Offer them later with an "up to N credits" price and no 4:5 shape, once a real call has
   measured what one costs? Proposed: not now.
7. **Gemini's Safety Retention** (section 4): acceptable for customer content? If not, Gemini text is not
   offered and images stay on the direct Google key only.
8. **When does the privacy policy change go live,** and are the three sub-processors added to the public
   list the same day? GPT and Gemini stay off (`MODEL_FAMILIES`) until then.
9. **OpenRouter's 5.5% fee on credit purchases** is not in any call's reported cost. Leave the markup as it
   is, or raise it for OpenRouter work?

---

## 0. What exists today (read from the code)

| Thing | Where | What it does |
| - | - | - |
| Text models | `convex/lib/modelRouter.ts`, `convex/lib/toolRouter.ts` | Call Anthropic directly with `ANTHROPIC_API_KEY`. `PROVIDERS = ["claude", "fake"]`. A `PRICES` table; a model missing from it cannot run. |
| Routes | `modelRoutes` table, `convex/platform.ts` | One row per kind of work (research, classify, write, summarize): provider, model, fallback. Launch routes: Opus 5.5 for research and write, Sonnet 5.5 for classify and summarize, each falling back to the other. |
| "Fast" mode | `runs.prepare` | A run in fast mode sends research and write to the classify route. |
| Images | `convex/lib/gemini.ts`, `creativeImageActions.ts` | Call Google directly with `GEMINI_API_KEY`. That key is not set on production: this is the message the owner saw. |
| Video | `convex/referenceActions.ts` | A reference video is read by Gemini, direct, same key. |
| Money | `lib/billing.ts`, `lib/credits.ts`, `lib/caps.ts`, `lib/approvals.ts` | Cost in cents, charged as credits at cost times `BILLING_MARKUP`. Caps per run and per day. Work above the organization's spending limit waits for an Owner or Admin. |

Every place a model is called today:

| # | Caller | Kind of work | Uses |
| - | - | - | - |
| 1 | `runs.step` (every skill) | whatever the skill's step asks | structured output; web search in some steps |
| 2 | `intake.step` (the Research chat) | classify | structured output |
| 3 | `followups.answer` / `followups.research` | write / research | structured output; web search in `research` |
| 4 | `files.read` (an attached file) | classify | image and PDF input, structured output |
| 5 | `referenceActions.analyse` | classify, or Gemini for video | image input, structured output; video |
| 6 | `onboarding.readSiteNow` | classify | **web fetch**, structured output |
| 7 | `creativeImageActions.make` | image model, plus classify to read the words back | image output; image input |

What each skill's model steps need:

| Skill | Structured output | Web search |
| - | - | - |
| Market Intelligence | yes | yes (research step) |
| Offer Intelligence | yes | no |
| Growth Diagnostics | yes | no |
| Creative Production (ad copy) | yes | no |
| Landing Page Teardown | yes | yes (finding pages) |
| Industry Trends | yes | yes |
| Task Proposer | yes | no |

No skill uses forced tool choice or client tools today; the router supports client tools but nothing
declares one. That matters: through OpenRouter, every endpoint of the newest Claude models reports forced
tool choice as unsupported (facts 2), so a skill that needed "you must call this tool" could not move. Every
skill asks for its answer with structured output instead, which is supported. Web fetch is used in one place only (6).

One thing found on the way: the privacy policy names Anthropic as "our AI provider" and does not mention
that images and reference videos already go to Google. That gap predates this work; the proposed policy
change in section 4 closes it.

---

## 1. Shape

**Decision: OpenRouter is one more provider, `openrouter`, behind the router that exists. Direct Anthropic
and direct Google keep working exactly as they do. Direct Anthropic stays the default.**

- One key, `OPENROUTER_API_KEY`. A deployment without it behaves exactly as today: the provider answers
  `no_key`, the picker does not offer anything that needs it, and no route points at it unless a Platform
  Admin sets one.
- `PROVIDERS` becomes `["claude", "openrouter", "fake"]`, so `modelRoutes` can name it per kind of work.
- Why direct Anthropic stays the default: it is the path that has run in production, its tools (web search,
  web fetch) are the ones every check was written against, the privacy policy names it, and there is no
  OpenRouter key yet. Adding without removing means nothing breaks the day the key is added. Switching the
  default later is one `platform.setRoute` call per kind of work.

**How it talks to OpenRouter: the Anthropic-format endpoint.** OpenRouter serves three request formats.
One of them is `POST https://openrouter.ai/api/v1/messages`, which takes and returns the same shapes as
Anthropic's own Messages API, and OpenRouter's docs show the official `@anthropic-ai/sdk` pointed at it
with `baseURL: "https://openrouter.ai/api"` (facts 1.4). Every OpenAI and Google text model in the list
names `/api/v1/messages` among its endpoints (facts 1.4). Its `usage` carries `cost` (facts 1.4, 5).

So the OpenRouter provider is the existing tool loop in `toolRouter.ts` with a different client, different
web-tool declarations, and cost read from the response. The turn loop, refusals, `max_tokens`, structured
output (`output_config.format`), image input, the fallback and the "every billed call is counted" rule are
shared code, not a second copy. That is the main reason for choosing this format over
`/chat/completions`: fewer new lines that can be wrong where money and evidence are counted.

The cost of that choice, stated plainly: OpenRouter's docs do not say how Anthropic-only features behave on
non-Claude models through this format (facts 1.4: "not stated"). The parts this design relies on are in the
endpoint's published schema (structured output, images, `stop_reason` values, `usage.cost`,
`usage.server_tool_use`), but only a real call proves them. Section 8 lists the checks, and PR 2 ships one
function a Platform Admin runs once to make them.

**Which models.** Three families, chosen from the list on 2026-11-13. "Thorough" is what research and
writing use; "Fast" is what sorting and summarizing use, and what Fast mode uses for everything.

| Family | Thorough | Fast | Through |
| - | - | - | - |
| Claude | Claude Opus 5.5 (`claude-opus-5-5`) | Claude Sonnet 5.5 (`claude-sonnet-5-5`) | Anthropic, direct (today's routes, unchanged) |
| GPT | GPT-6.1 Sol ([`openai/gpt-6.1-sol`](https://openrouter.ai/openai/gpt-6.1-sol)) | GPT-6.1 Terra ([`openai/gpt-6.1-terra`](https://openrouter.ai/openai/gpt-6.1-terra)) | OpenRouter |
| Gemini | Gemini 4 Carbon ([`google/gemini-4-carbon`](https://openrouter.ai/google/gemini-4-carbon)) | Gemini 4 Hydrogen ([`google/gemini-4-hydrogen`](https://openrouter.ai/google/gemini-4-hydrogen)) | OpenRouter |

List prices that day, in dollars per million tokens (input / output), from the models endpoint:

| Model | Input | Output | Cache read | Cache write | Native web search |
| - | - | - | - | - | - |
| Claude Opus 5.5 (direct, from `PRICES`) | 4 | 20 | 0.20 | 1.25x input | $0.01 a search |
| Claude Sonnet 5.5 (direct, from `PRICES`) | 2 | 10 | 0.20 | 1.25x input | $0.01 a search |
| `openai/gpt-6.1-sol` | 2 | 10 | 0.10 | 2.50 | $0.01 a search |
| `openai/gpt-6.1-terra` | 1 | 5 | 0.05 | 1.25 | $0.01 a search |
| `google/gemini-4-carbon` | 2 | 10 | 0.10 | 0.1875 | $0.014 a search |
| `google/gemini-4-hydrogen` | 1.5 | 7.5 | 0.075 | 0.0833 | $0.014 a search |

Why these and not the most expensive of each family:

- **GPT.** OpenAI's top model that day is GPT-6 Astra at $10 / $50, two and a half times Opus 5.5. The run
  caps (`SKILL_CAPS`) were sized for Opus prices, so on Astra a research run would stop at its cap before it
  finished. GPT-6.1 Sol is the newest model one step below it. This is open question 3.
- **Gemini.** Gemini 4 Argon and Gemini 4 Carbon cost the same. Argon is described as the "flagship
  reasoning model"; Carbon is newer (2026-11-10). Carbon is chosen because, on the day, all of its endpoints
  reported normal status and it has the Google Cloud endpoints the privacy settings in section 4 need, while
  Argon's Google Cloud endpoints reported a non-zero status whose meaning the docs do not state (facts 11.4).
- **Claude stays direct**, so "Claude" in the picker is exactly what runs today. Claude through OpenRouter
  is possible (a Platform Admin can set a route to `openrouter` with an Anthropic model) but is not what the
  picker offers, because under the privacy settings below Claude would move to Amazon or Google hosting,
  where it has no built-in web search and, on Amazon, no structured output (facts 3.3, 4).

The fallback for a GPT or Gemini choice stays inside the family (Sol falls back to Terra, Terra to Sol; the
same for Gemini), as Opus and Sonnet do today. A person who chose GPT never silently gets Claude.

**How a choice becomes a route.** One function, `resolveRoute(workKind, choice)`, replaces the seven copies
of "read `modelRoutes`, else the fake model":

1. The choice is a family: the one picked for this piece of work, else the organization's default, else
   none.
2. No choice, or a family the platform route for that kind of work already belongs to: the `modelRoutes`
   row, as today. (So "Claude" is the platform's own routes, whatever a Platform Admin has set them to.)
3. Another family: that family's row in the table above, through OpenRouter.
4. A family that cannot run this work (section 2), or OpenRouter without a key: refused before anything
   starts, with words a person can act on. Never a silent swap.

---

## 2. What can honestly be switched

"Documented" means OpenRouter's published schema or docs say it works; "proven" would need a real call, and
nothing here is proven yet.

| Kind of work | Needs | Claude (direct) | GPT via OpenRouter | Gemini via OpenRouter |
| - | - | - | - | - |
| write, classify, summarize | structured output | Runs today | Documented: every OpenAI and Azure endpoint of both models lists `structured_outputs` (facts 4). **Offered.** | Documented: every endpoint lists it. **Offered.** |
| research | web search, with the pages found returned as sources | Runs today | The search itself is documented: OpenAI and Azure endpoints run OpenRouter's `openrouter:web_search` with OpenAI's own search (facts 3.3). **How the pages found come back in this format is not stated** (facts 3.5). **Not offered until proven.** | Same: Google's own search is documented on every endpoint; the returned shape is not stated. **Not offered until proven.** |
| reading a web page (web fetch) | built-in page reading | Runs today | No OpenAI endpoint has built-in page reading; OpenRouter would send the address to a third company, Exa, or its own fetcher (facts 3.3). **Not offered.** | Same. **Not offered.** |
| reading an attached image | image input | Runs today | In the schema (facts 1.4). Stays on the default route for now; see below. | Same. |
| reading an attached PDF | document input | Runs today | Not checked. Stays on the default route. | Same. |
| watching a reference video | video input | Not possible (Gemini does it, direct) | Not possible | The Anthropic-format endpoint takes no video (facts 13). Stays direct. |

Why research is held back rather than switched on: the evidence rules depend on it. A research step saves
the pages the search found, and the checks later refuse any claim whose source is not among them
(`followups.research`, `adapters/web.ts`, the Market Intelligence checks). If GPT or Gemini searched and the
pages did not come back in a shape the router reads, the run would not invent sources, but it would produce
a thin report and charge for it. That is degrading quietly, so the door stays shut until one real call
shows the pages arriving. It opens with one setting, `OPENROUTER_WEB_SEARCH=on`, after the check in
section 8 passes. The provider code for it ships in PR 2, tested against a fake.

So, per skill, on the day the key is added:

| Skill or place | Claude | GPT | Gemini | Why |
| - | - | - | - | - |
| Offer Intelligence | yes | yes | yes | structured output only |
| Growth Diagnostics | yes | yes | yes | structured output only |
| Creative Production (ad copy) | yes | yes | yes | structured output only |
| Task Proposer (weekly plan) | yes | yes | yes | structured output only; follows the organization's default |
| Follow-up question on a report (`answer`) | yes | yes | yes | structured output only |
| Market Intelligence | yes | after the web search check | after the web search check | has a web search step |
| Landing Page Teardown | yes | after the web search check | after the web search check | has a web search step |
| Industry Trends | yes | after the web search check | after the web search check | has a web search step; follows the organization's default |
| Follow-up that researches (`research`) | yes | after the web search check | after the web search check | web search |
| The Research chat's questions (`intake.step`) | yes | follows the run it leads to | follows the run it leads to | a chat cannot be on a model its own research cannot run on |
| Reading an attached file | yes | no | no | stays on the default route |
| Analysing a reference ad or video | yes / Gemini direct | no | no | stays as it is |
| Reading your site in onboarding | yes | no | no | needs web fetch |
| Checking the words in a designed ad | yes | no | no | stays on the default route |

Where a family cannot run something, the picker shows it greyed with the reason ("Cannot search the web
here yet"), and the server refuses it too. When an organization's default is GPT or Gemini and a piece of
work cannot run on it, that work runs on the platform's default route and its record shows the model that
actually ran. That case is only reached for work nobody picks a model for by hand (the monthly trends post,
file reading); for work a person starts, the picker already shows which model it will be.

The four places marked "stays on the default route" are helpers nobody starts by hand. They keep today's
route because switching them buys the customer nothing they can see, and each needs an input type (PDFs,
web fetch) that is not documented well enough to switch blind.

**Things about these models that differ from Claude and are handled in the provider:**

- Capabilities belong to the hosting company's endpoint, not the model. The same model is served by several
  (OpenAI and Azure; Google AI Studio and Google Cloud), and OpenRouter spreads requests among them
  (facts 7.2, 14.3). Every request therefore sends `provider.require_parameters: true`, so it only goes
  where structured output and tools are really supported (facts 2, 4).
- Thinking is mandatory on Sol, Carbon and Hydrogen and counts against the same output limit
  (`MAX_TOKENS`). A model that spends the whole limit thinking returns nothing and is still billed
  (facts 4, 5). The router already turns that into `max_tokens` and counts the cost. Whether the existing
  limits (8,000 for classify, 4,000 for summarize) are roomy enough for these models is on the list in
  section 8.
- A response can arrive with HTTP 200 and an error inside (facts 6). The provider checks the body, not only
  the status.
- Errors are mapped to our existing codes from OpenRouter's stable `error_type`, never from its message
  (facts 6): `rate_limited`, `auth_failed`, `no_credit` (402), `blocked` (403 guardrail or moderation),
  `refused`, `bad_request`, `connection_failed`, `no_provider` (503: nothing meets the routing rules),
  `provider_error`.

---

## 3. Cost and caps

- **The cost of a call is what OpenRouter reports.** `usage.cost` is always returned on a completed call,
  in US dollars, and includes search fees (facts 3.6, 5). Cents = `cost` x 100.
- **When it reports none** (the field is typed "number or null"), the cost comes from a price table: the
  rows in section 1, kept in `PRICES` beside the Claude ones, with the date and source in a comment.
- **A model with no row in the table cannot run**, through any provider, exactly as today. This also keeps
  the worst-case estimate before each step (`estimateCents`) working, because it needs a price before the
  call. `platform.setRoute` refuses a model with no price.
- **Credits charged stay cost times markup.** `chargeUsage` does not change.
- **Caps do not change with the model.** A run's cap is the skill's cap. A dearer model reaches it sooner;
  it never spends past it. The spending-limit approval compares the run's cap to the organization's limit,
  so it applies the same way whichever model is chosen. Choosing a model can never raise what a run may
  spend.
- **What the picker says about cost.** It compares list prices of the family's two models with the
  default's, input and output both. All lower: "Usually costs less". All higher: "Usually costs more". The
  same: "About the same cost". Mixed: it says nothing. No number is shown, because models use different
  amounts of tokens for the same job and any number would be a guess. On the day: GPT "Usually costs less",
  Gemini "Usually costs less" (Carbon is half of Opus; Hydrogen is below Sonnet).
- The existing words under Fast and Thorough in the chat box say "up to $3.00" and "up to $1.50". Credits
  are shown as credits, never dollars, so PR 3 changes those to credits while it is in that menu.

Two costs that never reach `usage.cost`, for the owner's arithmetic and not for customers: OpenRouter takes
5.5% when credits are bought (facts 5), and prices above 272,000 input tokens double on GPT-6.1 (the table
fallback would under-count such a call; the reported cost does not).

---

## 4. Privacy

GPT and Gemini text are new places customer content goes: to OpenRouter, and through it to OpenAI's models
hosted by Microsoft Azure, and Google's models hosted by Google Cloud.

### What Vistrial sends on every OpenRouter request

```json
"provider": { "data_collection": "deny", "zdr": true, "require_parameters": true }
```

- `data_collection: "deny"`: "use only providers which do not collect user data" (facts 7.2). If none
  qualifies the request fails; it is not sent somewhere else.
- `zdr: true`: only endpoints on OpenRouter's zero-data-retention list (facts 7.2, 8.3). For our models,
  on the day: GPT-6.1 Sol and Terra on Azure; Gemini 4 Carbon and Hydrogen on Google Cloud (Vertex). OpenAI's
  own endpoints and Google AI Studio are not on the list and are never used.
- Web search asks for `engine: "native"`, so a search runs on the model host's own search (OpenAI's on
  Azure, Google's) and is never handed to Exa or another search company (facts 3.3). If the host cannot
  search, the request fails rather than fall back.
- No `HTTP-Referer` header, so no public app page is created on OpenRouter (facts 1.2).
- No `user` field. Nothing that names a customer or an organization is sent beyond the content itself.

### What the owner sets in the OpenRouter account (cannot be done from code)

1. <https://openrouter.ai/settings/privacy>: leave "OpenRouter Use of Inputs/Outputs" **off** (it is off by
   default; turning it on gives OpenRouter the content for a 1% discount). Leave the training toggles for
   paid models **off**.
2. Observability settings: leave "Private Input & Output Logging" **off** (off by default; on, it stores
   prompts for at least three months).
3. Same privacy page: turn zero data retention **on** for OpenAI and for Google, with "Allow Safety
   Retention" for Google (without it no Gemini 4 endpoint qualifies). This repeats in the account what the
   code sends, so a mistake in one is caught by the other.
4. Put a spending limit on the key (OpenRouter recommends one on every key).

### What cannot be guaranteed

- **Gemini is not strict zero retention.** Since 2026-10-18 Google's Cloud endpoints are "Safety
  Retention": prompts are not kept by default, but ones Google's safety classifiers flag may be kept up to
  90 days for abuse monitoring, not for training (facts 8.3). `zdr: true` allows these on a self-serve
  account. Strict zero retention would mean no Gemini at all.
- **OpenRouter keeps metadata** for every request (token counts, timing), samples "a small number of
  prompts" anonymously to categorize traffic, and screens all traffic, zero-retention included, for child
  sexual abuse material; flagged content may be kept (facts 8.1).
- **Zero retention covers the model call only.** A web search goes to the host's search service under that
  service's own terms (facts 3.8).
- **Hosts may cache prompts in memory**; OpenRouter does not count that as retention (facts 8.3).
- **Where it is processed.** OpenRouter's EU-only routing needs a Business or Enterprise plan and has no
  web search (facts 8.4). On a self-serve account, requests may be processed in the United States or
  elsewhere.
- **OpenRouter's list is OpenRouter's reading of each host's policy.** Vistrial has no contract with Azure
  or Google Cloud for this traffic; OpenRouter does.
- The docs do not state whether OpenRouter treats first-party OpenAI and Google AI Studio as "collecting"
  under `data_collection` (facts 8.3). It does not matter for routing, because `zdr: true` already excludes
  them, but it is why both settings are sent.

### The privacy policy

The proposed wording is in this PR as its own commit, **as text in
[`assets/privacy-policy-models-proposal.md`](assets/privacy-policy-models-proposal.md), not as a change to
`src/lib/trust/privacy-policy.ts`.** Merging a change to that file publishes it on the public site, and it
would say customer content goes to OpenRouter, Microsoft and Google before any of that is switched on. The
owner decides the wording and the day. The proposal names the new providers, says what is sent and when,
adds Google for images and video (already true today), and keeps every "not used to train" sentence behind
the existing `aiNoTraining` switch.

Because GPT and Gemini must not be used before the policy says so, the picker offers them only when both
are true: `OPENROUTER_API_KEY` is set, and `MODEL_FAMILIES` names them (for example
`MODEL_FAMILIES=gpt,gemini`). The owner sets the second when the policy is live. Until then the picker shows
Claude, with GPT and Gemini listed as "Not switched on yet".

### For a lawyer

1. OpenRouter, Microsoft (Azure) and Google (Cloud) become sub-processors. Do the Terms or any customer
   agreement promise notice before adding one? The public sub-processor list
   (`/security/subprocessors`) is edited by a Platform Admin and needs the three added the same day.
2. Is a data processing agreement with OpenRouter needed and available on a self-serve account?
3. May the `aiNoTraining` sentence stay on once Gemini is offered, given Safety Retention (kept up to 90
   days when flagged, not used for training)? The sentence speaks of training only, but a customer may read
   more into it.
4. Customers in the EU or UK: processing in the United States through OpenRouter, without the EU-only
   routing.
5. Google already receives ad images' prompts and reference videos (direct, today) and is not in the
   policy. That should be fixed whatever is decided about OpenRouter.

---

## 5. Images

**Decision: image making works with either key.** With `GEMINI_API_KEY` set it goes to Google directly, as
today. Without it, and with `OPENROUTER_API_KEY` set, the same models are reached through OpenRouter's image
endpoint. The owner's error is fixed by setting **one** key, and `OPENROUTER_API_KEY` alone is enough for
both text and images.

- OpenRouter's image endpoint is `POST /api/v1/images`: `model`, `prompt`, `aspect_ratio`, `resolution`,
  `input_references` (pictures of the brand's own ads, as data URLs); the picture comes back as base64 with
  `usage.cost` in dollars; a failed image returns 502 and is not billed (facts 12.1).
- The same two models are there under Google's name: `google/gemini-nano-banana-2.1` (the photo look) and
  `google/gemini-3-pro-image` (the designed ad). Both list 1:1, 4:5, 9:16 and 16:9, 1K and 2K, and up to 14
  reference pictures (facts 11.3). The words in a designed ad are still read back and checked, on the
  default text route, exactly as now.
- **Price.** A person confirms a price before any image is made, and pays exactly that. OpenRouter prices
  images per output token and does not publish tokens per image, so a per-image price cannot be worked out
  from its list (facts 11.3). The quote therefore keeps using the per-image table in `gemini.ts` (Google's
  own published prices), and the customer is charged the quote. What OpenRouter reports for each image is
  stored beside it, so the owner can see if the two ever differ. If OpenRouter reports more than the quote,
  the customer still pays the quote. Checking that they match is on the list in section 8.
- **Privacy.** The image endpoint's routing options have no `zdr` or `data_collection` field (facts 12.3),
  so requests are pinned to Google Cloud with `provider: { only: ["google-vertex"], allow_fallbacks: false }`,
  and the account-level settings in section 4 apply. What is sent: the image prompt, built in code from the
  ad's direction and the brand kit, and, for a designed ad, pictures of the brand's own past ads.

**Which families can make images, honestly:**

| Family | Offered | Why |
| - | - | - |
| Gemini | Yes: Nano Banana 2.1 and Nano Banana Pro | Both paths above. |
| GPT | No, shown as "Coming soon" | OpenAI's image models are on OpenRouter (`openai/gpt-image-2.6-*`), but none lists the 4:5 shape most feed ads use, none takes a resolution, none is on the zero-retention list, and there is no per-image price to quote (facts 11.3, 8.3). Open question 6. |
| Claude | No, shown as "Does not make images" | No Anthropic model outputs images (facts 11.2). |

**The "not switched on" message.** Today it appears after a person has confirmed a price and pressed the
button. It will be checked before, so the button is replaced by a notice and nothing is started:

- To a Platform Admin: "Image making needs a key. Set `OPENROUTER_API_KEY` or `GEMINI_API_KEY` in this
  Convex deployment's environment variables (Settings, Environment Variables). Neither is set."
- To everyone else: "Image making is not set up on this workspace yet, so no image was made and nothing was
  charged. Your ad copy is ready to use as it is. Ask your Vistrial contact to switch images on, or write
  to contact@vistrial.io."
- A key that is set but refused (`auth_failed`), and an OpenRouter account with no credit (`no_credit`),
  get the same split: the exact setting for a Platform Admin, a plain "not your fault, nothing charged" for
  everyone else.

No picture is ever shown that was not made: a failed image stays a failed tile with its reason.

---

## 6. Choosing a model and seeing which one ran (what PR 3 builds)

**Choosing.**

- A small switch in the chat box used on Home, in the side panel and in the Research chat (one component,
  `chat-composer.tsx`), and in ad creative generation. It shows the family's mark and the model's plain name
  ("Claude Opus 5.5"), lists Claude, GPT and Gemini, and ends with a disabled "More models coming soon". A
  family that cannot run that work is greyed with the reason.
- Other places a person starts model work, each gets the same switch or says why not: analysing an offer
  (Offers), a landing page teardown (Pages), a follow-up question on a report. Not covered, because nobody
  picks there: the free onboarding session (platform default), the weekly plan and trend posts (the
  organization's default), file and reference reading (default route).
- Settings > Agents: the organization's default family. Owner and Admin.
- The choice is stored on the piece of work (`modelChoice` on the chat, the run, the follow-up) and fixed
  when it starts.

**Seeing.** Stored when the model runs, as new optional fields; old records show nothing.

| Record | Stored | Shown |
| - | - | - |
| A run step | `modelRoute` (already stored) | mark and name on each model step in the run viewer |
| A run | `madeWith: { provider, model }`, the model that did its writing | run viewer header; and through the run, on the asset it made, the Briefing post and the task card that came from it |
| A chat turn | `model` on the agent's message when a model wrote it | mark beside the turn |
| A follow-up answer | `provider`, `model` | mark beside the answer |
| An image | `model` (already stored), `provider` | mark and name on each image set |

Marks are the three companies' own logos as local SVG files, unmodified, each beside its name, following
each company's published brand rules; sources go in PR 3's description.

**Where the marks came from (added with PR 3).** The four files in `public/model-logos/` were downloaded
on 2026-11-13 from svgl.app, the logo library this repository already uses for the Meta mark
(`claude-ai-icon.svg`, `openai.svg`, `openai_dark.svg`, `gemini.svg`), and are stored exactly as downloaded.
They are shown small, uncropped and unrecoloured, always beside the model's name, only to say which model
did a piece of work. OpenAI publishes its rules at <https://openai.com/brand/> (black mark on light, white
on dark, which is why there are two files). Anthropic's and Google's own brand pages were not read in this
work, so whether each permits this use is for the owner to confirm before launch; swapping a file needs no
code change.

Roles, client scoping and the archived-organization rule come from the builders in `lib/builders.ts`; no
new access rule is written by hand.

---

## 7. Open questions for the owner

Moved to the top of this document: "Questions for the owner, first".

---

## 8. What the first real calls must prove

Nothing below could be tested here. PR 2 ships `modelCheck.run`, an internal function a Platform Admin runs
from the Convex dashboard once the key is set. It makes one small call per line, reports codes and numbers
(never model text), and costs a few cents.

| # | Check | If it fails |
| - | - | - |
| 1 | A plain call to each of the four models returns text, `stop_reason: "end_turn"`, and a numeric `usage.cost`. | The provider is not usable; say what came back. |
| 2 | A structured-output call to each returns JSON that parses and matches the schema. | That family is not offered for anything. |
| 3 | The request's `provider` object (`data_collection`, `zdr`, `require_parameters`) is accepted, and the response's `provider` field names Azure or Google Cloud. | Privacy settings are not being honoured; stop. |
| 4 | A call with an image attached is read. | Image reading stays on the default route (as designed). |
| 5 | A web search call returns the pages found, as `web_search_tool_result` blocks or as citations with addresses, and `usage.server_tool_use.web_search_requests` counts the searches. | `OPENROUTER_WEB_SEARCH` stays off; research stays on Claude. |
| 6 | With `engine: "native"`, no search is served by Exa (the response's metadata names the engine). | Same as 5. |
| 7 | `usage.cost` for a known call is within a few percent of the table price for its tokens. | Trust the reported cost; fix the table. |
| 8 | A classify-sized call (8,000 output limit) on Hydrogen and Terra finishes without `max_tokens`. | Raise the limit for those models or lower their thinking effort. |
| 9 | One image through `/api/v1/images` on Google Cloud at 2K, 4:5: a picture comes back, and `usage.cost` is close to the table's per-image price. | Keep images on the direct Google key. |
| 10 | A deliberately bad key returns 401 and maps to `auth_failed`. | Fix the mapping. |

## 9. What the owner sets up

| What | Where | Needed for |
| - | - | - |
| An OpenRouter account with credit, and a key | <https://openrouter.ai/settings/keys> | GPT, Gemini; images without a Google key |
| The account settings in section 4 | <https://openrouter.ai/settings/privacy> | Before any customer content is sent |
| `OPENROUTER_API_KEY` | Convex dashboard, the deployment's environment variables | The same |
| `MODEL_FAMILIES=gpt,gemini` | Convex environment variables | Offering GPT and Gemini in the picker. Set it when the privacy policy is live. |
| `OPENROUTER_WEB_SEARCH=on` | Convex environment variables | Research on GPT and Gemini. Set it after check 5 passes. |
| `GEMINI_API_KEY` (optional) | <https://aistudio.google.com/apikey>, then Convex environment variables | Images and reference videos direct from Google. Reference videos need this key; images do not if OpenRouter is set. |

## 10. The four PRs

1. This document, the fact notes, and the proposed policy wording.
2. The `openrouter` provider behind the router, with tests against a fake; cost recording; error codes;
   fallbacks; `modelRoutes` able to name it; `resolveRoute`; `modelCheck.run`. No screen changes. Nothing
   changes for a deployment without the key.
3. The switch, the organization default, and the model mark everywhere a model has run.
4. Images through either key, the image model switch, and the clearer "not set up" states.

The session redesigning how results are displayed (`claude/readable-output`) owns the layout of result
screens. PR 3 adds one small mark component to those screens and lists every shared file it touches.
