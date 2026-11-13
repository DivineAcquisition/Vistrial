# OpenRouter API fact sheet (verified 2026-11-13)

All claims below come from files read on 2026-11-13 in this directory
. Nothing is from memory.

**How to read citations.** Every fact carries a bracketed `src:` tag naming a local file followed by a verbatim quote in «guillemets».

- `pages/<name>.md` is the official doc page `https://openrouter.ai/docs/<name with "_" turned back into "/">.md`
  (e.g. `pages/guides_features_zdr.md` = https://openrouter.ai/docs/guides/features/zdr.md,
  `pages/api_api-reference_chat_create-a-chat-completion.md` = https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion.md,
  `pages/api_reference_overview.md` = https://openrouter.ai/docs/api_reference/overview.md — note `api_reference` keeps its underscore).
- Quotes from the `api_api-reference_*` pages are from the embedded OpenAPI YAML; YAML wraps long strings, so grep them
  whitespace-insensitively. The verifier `../or-scripts/verify.py` (run today: all quotes found) collapses whitespace, drops leading `> ` blockquote markers (FAQ accordions) and, for `.json` files, removes all whitespace before matching.
- Raw API responses fetched today without any key:

| File | Endpoint |
| - | - |
| `models.json` | `GET https://openrouter.ai/api/v1/models` (475 models; 177 with id prefix openai/, anthropic/, google/) |
| `image-models.json` | `GET https://openrouter.ai/api/v1/images/models` (66 image models) |
| `image-endpoints/<author>_<slug>.json` | `GET https://openrouter.ai/api/v1/images/models/{author}/{slug}/endpoints` |
| `endpoints/<author>_<slug>.json` | `GET https://openrouter.ai/api/v1/models/{author}/{slug}/endpoints` |
| `endpoints-zdr.json` | `GET https://openrouter.ai/api/v1/endpoints/zdr` (1102 endpoints) |
| `providers.json` | `GET https://openrouter.ai/api/v1/providers` (122 providers) |
| `tools-401.json` | `GET https://openrouter.ai/api/v1/tools` → 401 without a key (`{"error":{"message":"No cookie auth credentials found","code":401}}`), so the live server-tool catalog could NOT be read |
| `models-table.md` | generated from `models.json` by `../or-scripts/models.py` |

"NOT STATED" = the docs/files read today do not say.

---

## 1. API shapes

### 1.1 Base URL, auth, endpoints

- Base URL `https://openrouter.ai/api/v1`, single version, no version headers.
  [src: pages/api_reference_versioning.md «There are no version headers and no date-based version pinning.»]
- Three inference "skins": Responses (`POST /api/v1/responses`), Chat Completions (`POST /api/v1/chat/completions`), Anthropic Messages (`POST /api/v1/messages`).
  [src: pages/api_reference_overview.md «OpenRouter supports two request shapes: the [Responses API](https://openrouter.ai/docs/api_reference/responses/overview.md) (`POST /api/v1/responses`) and the Chat Completions API (`POST /api/v1/chat/completions`).»]
  [src: pages/api_reference_errors-and-debugging.md «On inference endpoints (`/chat/completions`, `/responses`, `/messages`), a request can be blocked before it reaches a provider»]
  [src: pages/api_reference_errors-and-debugging.md «OpenRouter exposes three API skins.»]
- The docs now lead with the Responses API everywhere; most guide examples are Responses-shaped, Chat Completions is second.
  [src: pages/api_reference_overview.md «Where this page shows both, the Responses API comes first.»]
- Auth: `Authorization: Bearer <key>`; `x-api-key` is also accepted (for Anthropic-SDK clients). Key format `sk-or-v1-` + 64 hex.
  [src: pages/api_reference_authentication.md «Send one credential per request in the `Authorization` header as `Bearer <credential>`. For clients built on the Anthropic SDK, you can also send an API key (not an access token) in the `x-api-key` header.»]
- Passing a non-OpenRouter `sk-` key gives 401 `Invalid API key: this is not an OpenRouter API key` (SDKs silently fall back to `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`).
  [src: pages/api_reference_authentication.md «OpenAI and Anthropic SDKs fall back to `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` when you don't pass a key explicitly.»]
- Recommendation: put a credit limit on every key.
  [src: pages/api_reference_authentication.md «We recommend setting a credit limit on every key.»]

### 1.2 Optional attribution headers

- `HTTP-Referer`, `X-OpenRouter-Title` (`X-Title` still accepted), `X-OpenRouter-Categories`.
  [src: pages/api_reference_overview.md «* `X-OpenRouter-Title`: Sets/modifies your app's title (`X-Title` also accepted)»]
- RISK: `HTTP-Referer` creates a PUBLIC app page/rankings entry by default. To attribute without being listed, send `X-OpenRouter-App-Visibility: hidden` on the request that first creates the app (ignored afterwards).
  [src: pages/app-attribution.md «Send `hidden` to create the app hidden: it is excluded from the public rankings, the app marketplace, and public app pages, while attribution keeps working and the app's usage still shows in your own analytics.»]
  [src: pages/app-attribution.md «The header is ignored on every later request, so it cannot list a hidden app publicly»]
- Other useful headers: `X-OpenRouter-Metadata: enabled` (adds `openrouter_metadata` routing info to responses; legacy name `X-OpenRouter-Experimental-Metadata`), `x-session-id` (sticky provider routing for prompt caching; body `session_id` wins), `x-anthropic-beta` (passed through to Anthropic), `X-OpenRouter-Cache: true` (opt-in response cache).
  [src: pages/api_api-reference_anthropic-messages_create-a-message.md «Opt-in to surface routing metadata on the response under `openrouter_metadata`. Defaults to `disabled`.»]
  [src: pages/guides_routing_provider-selection.md «you can request specific beta features by including the `x-anthropic-beta` header in your request»]

### 1.3 Chat Completions request/response (non-streaming)

Request type (doc summary; full OpenAPI in `pages/api_api-reference_chat_create-a-chat-completion.md`, schema `ChatRequest`, only `messages` required):

```typescript
type Request = {
  messages?: Message[]; prompt?: string; model?: string;
  response_format?: ResponseFormat; stop?: string | string[]; stream?: boolean;
  plugins?: Plugin[]; max_tokens?: number; temperature?: number;
  tools?: Tool[]; tool_choice?: ToolChoice;
  ... models?: string[]; route?: 'fallback'; provider?: ProviderPreferences; user?: string;
};
```
[src: pages/api_reference_overview.md «// If "model" is unspecified, uses the user's default»]

Additional `ChatRequest` properties in the OpenAPI (not in the TS summary): `cache_control`, `image_config`, `modalities`, `max_completion_tokens`, `parallel_tool_calls`, `reasoning`, `reasoning_effort`, `service_tier`, `session_id`, `stop_server_tools_when`, `prompt_cache_key`, `metadata`, `trace`, `debug`.
[src: pages/api_api-reference_chat_create-a-chat-completion.md «Maximum tokens (deprecated, use max_completion_tokens). Note: some providers enforce a minimum of 16.»]

Unsupported parameters are silently dropped unless `provider.require_parameters` is set.
[src: pages/api_reference_overview.md «If the chosen model doesn't support a request parameter (such as `logit_bias` in non-OpenAI models, or `top_k` for OpenAI), then the parameter is ignored.»]

Images in chat messages: `{"type":"image_url","image_url":{"url": "<https URL or data: URL>","detail":"auto|low|high|original"}}`.
[src: pages/api_api-reference_chat_create-a-chat-completion.md «URL of the image (data: URLs supported)»]
Supported image types: png, jpeg, webp, gif. [src: pages/guides_overview_multimodal_image-understanding.md «* `image/webp`»]

Non-streaming response example (verbatim from docs):

```json
{
  "id": "gen-xxxxxxxxxxxxxx",
  "choices": [
    {
      "finish_reason": "stop", // Normalized finish_reason
      "native_finish_reason": "stop", // The raw finish_reason from the provider
      "message": {
        // will be "delta" if streaming
        "role": "assistant",
        "content": "Hello there!"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 4,
    "total_tokens": 14,
    "prompt_tokens_details": { "cached_tokens": 0 },
    "completion_tokens_details": { "reasoning_tokens": 0 },
    "cost": 0.00014
  },
  "model": "openai/gpt-4o"
}
```
[src: pages/api_reference_overview.md «"native_finish_reason": "stop", // The raw finish_reason from the provider»]

- `choices` is always an array; `message` may carry `content`, `tool_calls`, `reasoning`, `reasoning_details`, `refusal`, `images`, `audio`.
  [src: pages/api_api-reference_chat_create-a-chat-completion.md «Refusal message if content was refused»]
- The `id` (`gen-…`) is the generation id usable with `GET /api/v1/generation?id=`.
- `model` in the response is the model actually used (matters with fallbacks).
  [src: pages/guides_routing_model-fallbacks.md «Requests are priced using the model that was ultimately used, which will be returned in the `model` attribute of the response body.»]

### 1.4 Anthropic Messages endpoint `POST /api/v1/messages`

- Exists, documented as "Anthropic Skin".
  [src: pages/api_api-reference_anthropic-messages_create-a-message.md «Creates a message using the Anthropic Messages API format. Supports text, images, PDFs, tools, and extended thinking.»]
  [src: pages/cookbook_coding-agents_claude-code-integration.md «OpenRouter's "Anthropic Skin" behaves exactly like the Anthropic API. It handles model mapping and passes through advanced features like "Thinking" blocks and native tool use.»]
- **Works with non-Anthropic models: YES per `models.json`** — every non-batch openai/* and google/* text model lists `/api/v1/messages` in its `endpoints` array (110 of the 177 models; the other 67 are `:batch` variants that list only `/api/v1/batches`). Example: `google/gemini-4-hydrogen` → `"endpoints": ["/api/v1/chat/completions","/api/v1/completions","/api/v1/messages","/api/v1/responses"]`.
  [src: models.json «"/api/v1/messages"»]
  Docs corroborate for reasoning controls: [src: pages/guides_best-practices_reasoning-tokens.md «OpenRouter normalizes both into the unified `reasoning` parameter, so they work on every reasoning model, not only Claude.»]
  Caveat: the only compatibility *guarantee* statement found is for Claude Code and says first-party Anthropic only. [src: pages/cookbook_coding-agents_claude-code-integration.md «Claude Code with OpenRouter is only guaranteed to work with the Anthropic first-party provider.»]
  How Anthropic-specific request features (e.g. `web_search_20260209`, `cache_control`, `pause_turn`) behave on OpenAI/Google models through this skin: NOT STATED (except: block-level `cache_control` is converted for OpenAI, see below).
- **Usable with the official `@anthropic-ai/sdk`: YES.** baseURL is `https://openrouter.ai/api` (the SDK appends `/v1/messages`), key passed as `apiKey` (→ `x-api-key`, accepted) or as bearer auth token. Verbatim doc example:

```typescript
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic({
  baseURL: 'https://openrouter.ai/api',
  apiKey: '<OPENROUTER_API_KEY>',
});
const message = await anthropic.beta.messages.create({
  model: 'anthropic/claude-sonnet-4.5',
  max_tokens: 1024,
  fallbacks: [{ model: 'anthropic/claude-opus-4.1' }],
  messages: [{ role: 'user', content: 'What is the meaning of life?' }],
});
```
  [src: pages/guides_routing_model-fallbacks.md «  baseURL: 'https://openrouter.ai/api',»]
  For raw `fetch`: `POST https://openrouter.ai/api/v1/messages` with `Authorization: Bearer`. [src: pages/guides_features_service-tiers.md «curl https://openrouter.ai/api/v1/messages \»]
  Whether an `anthropic-version` header is required: NOT STATED.
- **Request fields** (`MessagesRequest`; required: `model`, `messages`): `system` (string or text blocks), `messages`, `max_tokens`, `tools`, `tool_choice`, `output_config` (`effort`, `format`, `task_budget`), `thinking`, `cache_control` (top-level automatic caching) plus block-level `cache_control`, `stop_sequences`, `temperature`, `top_p`, `top_k`, `metadata.user_id`, `service_tier`, `speed`, `context_management`, **plus OpenRouter extensions**: `provider` (full `ProviderPreferences`, same schema as chat), `models` (string[]), `fallbacks` ([{model}], max 3, not combinable with `models`), `plugins` (same plugin union incl. `web`, `web-fetch`, `response-healing`, `file-parser`), `session_id`, `stop_server_tools_when`, `user`, `trace`, `route` (deprecated).
  [src: pages/api_api-reference_anthropic-messages_create-a-message.md «description: Request schema for Anthropic Messages API endpoint»]
  [src: pages/api_api-reference_anthropic-messages_create-a-message.md «Fallback models to try if the primary model fails or refuses, in order. Handled by OpenRouter multi-model routing rather than Anthropic server-side fallbacks; cannot be combined with `models`. Each entry accepts only `model`. Maximum of 3 entries.»]
  - `tool_choice` variants: `{type:"auto"|"any"|"tool"(+name)|"none"}` with `disable_parallel_tool_use`.
  - Client tools: `{name, description, input_schema, strict?, cache_control?, type?: "custom"}`.
  - Images: `{"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":"…"}}` — also `source.type: "url"` and `"file"` (`file_id: or_file_…`).
    [src: pages/api_api-reference_anthropic-messages_create-a-message.md «media_type: image/jpeg»]
  - `output_config.format`: `{type:"json_schema", schema:{…}}` (both required).
    [src: pages/api_api-reference_anthropic-messages_create-a-message.md «A schema to specify Claude's output format in responses.»]
  - `cache_control` semantics: [src: pages/api_api-reference_anthropic-messages_create-a-message.md «Enable automatic prompt caching. When set at the top level, the system automatically applies cache breakpoints to the last cacheable block in the request. When set on an individual content block, it marks an explicit cache breakpoint; block-level markers also work on OpenAI models that support explicit prompt caching — OpenRouter converts them to the provider's native format.»]
  - Server tools accepted in `tools[]` in this format (typed in the schema): Anthropic `web_search_20250305` and `web_search_20260209` (`max_uses`, `allowed_domains`, `blocked_domains`, `user_location`), `advisor_20260301`, `bash_20250124`, `text_editor_20250124`, tool-search tools; OpenRouter `openrouter:web_search`, `openrouter:web_fetch`, `openrouter:datetime`, `openrouter:image_generation`, `openrouter:bash`, `openrouter:shell`, `openrouter:tool_search`, `openrouter:experimental__search_models`; plus a catch-all `{type: string, ...}` entry.
    `web_fetch_20260209` is NOT a typed member of the request tool union (string does not occur in the request schema); whether it is accepted via the catch-all: NOT STATED. It *is* the native type that `openrouter:web_fetch` is translated to on Anthropic endpoints (see §3).
  - Video input is NOT supported on this endpoint. [src: pages/guides_overview_multimodal_videos.md «The Messages API (`/api/v1/messages`) does not support video inputs.»]
- **Response** (`MessagesResult`): standard Anthropic message (`id`, `type:"message"`, `role`, `content[]`, `model`, `stop_reason`, `stop_details`, `stop_sequence`, `usage`, `container`) + OpenRouter extras `provider` (string), `openrouter_metadata` (opt-in), `safeguard_results`, `context_management`.
  Example from the reference:

```yaml
content:
  - citations: []
    text: I'm doing well, thank you for asking! How can I help you today?
    type: text
id: msg_abc123
model: anthropic/claude-sonnet-4
role: assistant
stop_details: null
stop_reason: end_turn
stop_sequence: null
type: message
usage:
  cache_creation: null
  cache_creation_input_tokens: null
  cache_read_input_tokens: null
  inference_geo: null
  input_tokens: 12
  output_tokens: 18
  output_tokens_details: null
  server_tool_use: null
  service_tier: standard
```
  [src: pages/api_api-reference_anthropic-messages_create-a-message.md «Non-streaming response from the Anthropic Messages API with OpenRouter extensions»]
- **`usage` shape**: Anthropic fields (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `cache_creation`, `output_tokens_details`, `server_tool_use`, `service_tier`, `inference_geo`) **plus OpenRouter additions `cost` (number|null), `cost_details`, `is_byok`, `iterations`, `speed`, `deferred_tools_details`**. So yes, `usage.cost` is in the Messages response schema.
  [src: pages/api_api-reference_anthropic-messages_create-a-message.md «upstream_inference_completions_cost: 0.0004»]
  `usage.server_tool_use` = `{web_search_requests, web_fetch_requests, tool_calls_requested?, tool_calls_executed?}`, `null` (not omitted) when no server tool ran.
  [src: pages/guides_features_server-tools.md «The Messages API reports the same counters in Anthropic's `usage.server_tool_use` object, which is `null` instead of omitted when no server tool runs.»]
  `service_tier` base label is `standard` here (vs `default` on chat/responses). [src: pages/guides_features_service-tiers.md «So the Messages API returns `service_tier: "standard"` where the Chat Completions and Responses APIs return `"default"`.»]
- **`stop_reason` enum** (`ORAnthropicStopReason`): `end_turn`, `max_tokens`, `model_context_window_exceeded`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal`, `compaction`, `null`. `stop_details` is `{type:"refusal", category: cyber|bio|frontier_llm|reasoning_extraction|general_harms|null, explanation}` or null.
  [src: pages/api_api-reference_anthropic-messages_create-a-message.md «- model_context_window_exceeded»]
  [src: pages/api_api-reference_anthropic-messages_create-a-message.md «description: Structured information about a refusal»]
  When `pause_turn` is actually emitted through OpenRouter / how to continue: NOT STATED (only present in the enum).
- **Errors** on this endpoint use the Anthropic envelope `{type:"error", error:{type, message, error_type}, request_id}` (see §6).

### 1.5 Responses endpoint `POST /api/v1/responses`

OpenAI-Responses-compatible; `input`, `instructions`, `max_output_tokens`, `text.format`, `tools`, plus the same routing fields (`models`, `provider`, `plugins`, `user`). Output is `output[]` items; usage is `input_tokens`/`output_tokens`/`total_tokens` (+ `cost`).
[src: pages/api_reference_overview.md «A Responses API request takes `input` (a string or an array of input items), optional `instructions`, and the same routing fields as Chat Completions (`models`, `provider`, `plugins`, `user`).»]

---

## 2. Tool calling (client tools)

- Chat Completions shape = OpenAI: `tools:[{type:"function",function:{name,description,parameters,strict?}}]`; response `message.tool_calls:[{id,type:"function",function:{name,arguments(JSON string)}}]`, `finish_reason:"tool_calls"`; results go back as `{role:"tool", tool_call_id, content}`.
  [src: pages/guides_features_tool-calling.md «On Chat Completions, function tools are nested under `function`, the model returns `tool_calls` on an assistant message, and tool results go back as `role: "tool"` messages.»]
- `tools` must be re-sent on every turn. [src: pages/guides_features_tool-calling.md «the `tools` parameter must be included in every request (Steps 1 and 3) so the router can validate the tool schema on each call»]
- `tool_choice`: `"none" | "auto" | "required" | {"type":"function","function":{"name":…}}` (+ OpenRouter extension `{"type":"openrouter:web_search"}` to force a server tool).
  [src: pages/api_reference_parameters.md «'required' means the model must call one or more tools.»]
- `parallel_tool_calls` (boolean, default true). [src: pages/guides_features_tool-calling.md «Control whether multiple tools can be called simultaneously with the `parallel_tool_calls` parameter (default is true for most models):»]
- Which models: `supported_parameters` contains `tools` (models page filter `supported_parameters=tools`). In `models.json`, 163 of the 177 openai/anthropic/google entries list `tools`; the ones that do NOT: `google/gemini-omni-1.2-flash`, `google/gemini-omni-1.1-flash`, `google/gemini-3.1-flash-lite-image`, `google/gemini-3.1-flash-image`, `openai/gpt-5.4-image-2`, `google/lyria-3-pro-preview`, `google/lyria-3-clip-preview`, `google/gemini-3.1-flash-image-preview`, `google/gemini-3-pro-image-preview`, `openai/gpt-5-image-mini`, `openai/gpt-5-image`, `google/gemini-2.5-flash-image`, `google/gemma-3-4b-it`, `google/gemma-2-27b-it`.
  [src: pages/guides_features_tool-calling.md «**Supported Models**: You can find models that support tool calling by filtering on»]
- Routing for tools: best-effort by default (soft preference even without `require_parameters`); hard requirement via `provider.require_parameters: true`.
  [src: pages/guides_routing_provider-selection.md «When you send a request with `tools` or `tool_choice`, OpenRouter makes a best effort to route to providers known to support tool use.»]
  [src: pages/guides_routing_provider-selection.md «When you set `require_parameters` to `true`, the request won't even be routed to that provider.»]
  [src: pages/guides_routing_provider-selection.md «Even when `require_parameters` is `false`, a small set of parameters is used as a soft preference when choosing between providers of the same model: `tools`, the response format (`text.format` on the Responses API, `response_format` on Chat Completions, including structured outputs), and `verbosity`.»]
- **RISK — forced tool choice on the newest Claude models.** The per-endpoint `supports_tool_choice` flags fetched today say `required: false, function: false` on EVERY endpoint (anthropic, claude-on-aws, vertex, bedrock, azure) of `anthropic/claude-fable-5.2`, `claude-opus-5.5`, `claude-sonnet-5.5`, `claude-haiku-5.5` (only `none` and `auto` true). Older Claude (`claude-sonnet-4.6`, `claude-haiku-4.5`, `claude-sonnet-5`, `claude-opus-5`) and all checked OpenAI/Google text endpoints report all four true.
  [src: endpoints/anthropic_claude-sonnet-5.5.json «"supports_tool_choice": {"none": true, "auto": true, "required": false, "function": false}»]
  [src: endpoints/anthropic_claude-sonnet-5.json «"supports_tool_choice": {"none": true, "auto": true, "required": true, "function": true}»]
  Meaning of the flags: [src: pages/api_api-reference_endpoints_list-all-endpoints-for-a-model.md «`tool_choice` in `supported_parameters` only says the parameter is accepted; these flags say which of its values passed testing.»]
- Strict tool use on Claude needs the `x-anthropic-beta: structured-outputs-2025-11-13` header, otherwise `strict` is stripped.
  [src: pages/guides_routing_provider-selection.md «For **strict tool use** (`strict: true` on tools), you must explicitly pass the `structured-outputs-2025-11-13` header. Without this header, OpenRouter will strip the `strict` field and route normally.»]
- Reasoning + tools: to keep Claude thinking across tool turns on chat/completions, pass back `message.reasoning_details` unchanged (OpenRouter extension). [src: pages/guides_best-practices_reasoning-tokens.md «# Preserve the complete reasoning_details when passing back»]

---

## 3. Server tools / web search / web fetch

**Status: BETA.** [src: pages/guides_features_server-tools.md «Server tools are currently in beta. The API and behavior may change.»]

### 3.1 Request syntax

- Canonical, all three API formats: add to `tools`: `{ "type": "openrouter:web_search", "parameters": {…} }` and/or `{ "type": "openrouter:web_fetch", "parameters": {…} }`. Can be mixed with client `function` tools.
  [src: pages/guides_features_server-tools_web-search.md «1. You include `{ "type": "openrouter:web_search" }` in your `tools` array.»]
  [src: pages/api_reference_responses_web-search.md «which works with both the Chat Completions and Responses APIs via the `tools` array»]
  Messages format: `OpenRouterWebSearchServerTool` / `WebFetchServerTool` are members of `MessagesRequest.tools`.
  [src: pages/api_api-reference_anthropic-messages_create-a-message.md «OpenRouter built-in server tool: searches the web for current information»]
- Chat Completions also accepts OpenAI-style shorthands `web_search`, `web_search_preview`, `web_search_preview_2025_03_11`, `web_search_2025_08_26` (auto-converted).
  [src: pages/api_api-reference_chat_create-a-chat-completion.md «Web search tool using OpenAI Responses API syntax. Automatically converted to openrouter:web_search.»]
- Messages format also accepts Anthropic-native `{"type":"web_search_20260209","name":"web_search","max_uses":…,"allowed_domains":[…],"blocked_domains":[…],"user_location":{…}}` (and `web_search_20250305`) as typed entries in the request schema. Whether these are hoisted to `openrouter:web_search` or passed straight to Anthropic: NOT STATED (the catalog endpoint that lists "accepted `tools[].type` spellings per API format" needs a key — `tools-401.json`).
  [src: pages/api_api-reference_tools_list-server-tools.md «Every spelling accepted in `tools[].type` for this tool, including the canonical `id`, and what the call surfaces as under each»]
- Full example with parameters (verbatim):

```json
{
  "type": "openrouter:web_search",
  "parameters": {
    "engine": "exa",
    "max_results": 5,
    "max_total_results": 20,
    "search_context_size": "medium",
    "allowed_domains": ["example.com"],
    "excluded_domains": ["reddit.com"]
  }
}
```
```json
{
  "type": "openrouter:web_fetch",
  "parameters": {
    "engine": "exa",
    "max_uses": 10,
    "max_content_tokens": 100000,
    "allowed_domains": ["docs.example.com"],
    "blocked_domains": ["private.example.com"]
  }
}
```
  [src: pages/guides_features_server-tools_web-fetch.md «"blocked_domains": ["private.example.com"]»]

### 3.2 Parameters

Web search (`parameters`): `engine` (`auto` default | `native` | `exa` | `firecrawl` | `parallel` | `perplexity`), `max_results` (default 5; non-native engines only), `max_uses` (cap on searches; with native search forwarded only to Anthropic), `max_total_results`, `search_context_size` (low/medium/high), `max_characters`, `user_location` (native only), `allowed_domains`, `excluded_domains`, `mode`, `x_search`.
[src: pages/guides_features_server-tools_web-search.md «| `max_uses` | integer | N/A | Maximum number of searches the model may perform in a single request. Once reached, further search calls return an error result instead of executing. With native provider search, forwarded only to Anthropic (as `max_uses`); other native search providers ignore it |»]
[src: pages/guides_features_server-tools_web-search.md «| `max_results` | integer | 5 | Maximum results per search call (1–25; 1–20 for Perplexity). Applies to Exa, Firecrawl, Parallel, and Perplexity engines; ignored with native provider search |»]

Domain filter support by engine (verbatim rows):
[src: pages/guides_features_server-tools_web-search.md «| **Native (Anthropic)** | Yes | Yes | Mutually exclusive |»]
[src: pages/guides_features_server-tools_web-search.md «| **Native (OpenAI)** | Yes | No | `excluded_domains` ignored (no error) |»]
[src: pages/guides_features_server-tools_web-search.md «| **Native (Google)** | No | No | Not supported. With `engine: "auto"`, falls back to Exa when filters are set. With `engine: "native"`, returns a 400 error |»]

Web fetch (`parameters`): `engine` (`auto` | `native` | `exa` | `openrouter` | `firecrawl` | `parallel`), `max_uses`, `max_content_tokens`, `allowed_domains`, `blocked_domains`. Hard limit 50 fetches/request on `openrouter`/`native` engines.
[src: pages/guides_features_server-tools_web-fetch.md «* **OpenRouter/native engines**: Hard limit of 50 fetches per request»]

Global agent-loop budget: top-level `max_tool_calls` default 30 = max; `stop_server_tools_when` (e.g. `[{type:"step_count_is",step_count:5},{type:"max_cost",max_cost_in_dollars:0.5}]`) overrides it.
[src: pages/guides_features_server-tools.md «| `max_tool_calls` | `30` | `30` | Total server-tool steps allowed for the request, across all server tools |»]
(Note: `max_tool_calls` is described as a sibling of `input`/`tools`, i.e. Responses API. `ChatRequest` and `MessagesRequest` list `stop_server_tools_when` as a top-level property but no top-level `max_tool_calls` (in the chat reference it only occurs inside Fusion/Subagent/Advisor configs) — so on chat/messages use `stop_server_tools_when`, e.g. `[{"type":"step_count_is","step_count":5}]`; whether a top-level `max_tool_calls` is honoured there: NOT STATED.)

### 3.3 Engines / which models get native search

- `auto` = native if the endpoint has it, else Exa. Native providers: OpenAI, Anthropic, Google, SpaceXAI, Perplexity.
  [src: pages/guides_features_server-tools_web-search.md «* **`auto`** (default): Uses native search if the provider supports it, otherwise falls back to Exa»]
  [src: pages/guides_features_server-tools_web-search.md «* **[Anthropic](https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool)**: Claude 3.5 Haiku, Claude 3.7 Sonnet, Claude 4 and later (all Opus/Sonnet variants)»]
  [src: pages/guides_features_server-tools_web-search.md «* **[OpenAI](https://platform.openai.com/docs/guides/tools/web-search)**: GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano, GPT-5 and later, o3, o3 Pro, o4-mini»]
  [src: pages/guides_features_server-tools_web-search.md «* **[Google](https://ai.google.dev/gemini-api/docs/grounding)**: Gemini 3 Flash, Gemini 3 Pro, Gemini 3.1 Flash/Lite, Gemini 3.5 Flash»]
- **Native support is per ENDPOINT (provider), not per model** — read `native_tools` from `/api/v1/models/{id}/endpoints`. Fetched today:
  - Claude (fable-5.2 / opus-5.5 / sonnet-5.5 / haiku-5.5): only `anthropic`, `anthropic/fast` and `claude-on-aws` endpoints have `openrouter:web_search → web_search_20260209` and `openrouter:web_fetch → web_fetch_20260209`. Vertex / Bedrock / Azure Claude endpoints have only `openrouter:bash` ⇒ with `engine:"auto"` a request routed there falls back to **Exa** (third party, extra fee).
    [src: endpoints/anthropic_claude-sonnet-5.5.json «"native_tools": {"openrouter:web_search": {"type": "web_search_20260209"}, "openrouter:web_fetch": {"type": "web_fetch_20260209"}, "openrouter:bash": {"type": "bash_20250124"}, "openrouter:advisor": {"type": "advisor_20260301"}}»]
  - OpenAI (gpt-6-astra / 6.1-sol / 6.1-terra / 6-luna): `openai*` and `azure*` endpoints have `openrouter:web_search → web_search` (+ apply_patch); `amazon-bedrock*` endpoints have `{}`. No native web_fetch on any OpenAI endpoint.
    [src: endpoints/openai_gpt-6.1-sol.json «"native_tools": {"openrouter:web_search": {"type": "web_search"}, "openrouter:apply_patch": {"type": "apply_patch"}}»]
  - Google (gemini-4-*, 3.8-flash, 3.5-flash-lite, image models): all AI Studio and Vertex endpoints have `openrouter:web_search → google_search`. No native web_fetch.
    [src: endpoints/google_gemini-4-carbon.json «"native_tools": {"openrouter:web_search": {"type": "google_search"}}»]
- Web fetch `auto` falls back to Exa; `native` falls back to the `openrouter` direct fetcher.
  [src: pages/guides_features_server-tools_web-fetch.md «* **`native`**: Prefers the provider's built-in web fetch; falls back to the `openrouter` engine if the model doesn't support native fetch.»]

### 3.4 Pricing

Search (verbatim table rows):
[src: pages/guides_features_server-tools_web-search.md «| **Exa** | Instant/Fast/Auto: \$0.007 per request; Deep Lite/Deep: \$0.012; Deep Reasoning: \$0.015. Includes up to 10 results, then \$0.001 per additional result |»]
[src: pages/guides_features_server-tools_web-search.md «| **Parallel** | Turbo or Fast: \$0.001/request; Basic or Advanced: \$0.005/request. Includes up to 10 results, then \$0.001 per additional result |»]
[src: pages/guides_features_server-tools_web-search.md «| **Perplexity** | \$0.005 per request using OpenRouter credits |»]
[src: pages/guides_features_server-tools_web-search.md «| **Firecrawl** | $0.005 per search plus $0.0125 per returned result |»]
Native = provider pass-through; `models.json` `pricing.web_search` gives the per-search number: `"0.01"` for every Anthropic and OpenAI model that has the key, `"0.014"` for every Google Gemini model (units: [src: pages/guides_overview_models.md «All pricing values are in USD per token/request/unit.»]).
Fetch:
[src: pages/guides_features_server-tools_web-fetch.md «| **Exa** | \$1 per 1,000 fetches |»]
[src: pages/guides_features_server-tools_web-fetch.md «| **OpenRouter** | Free |»]
[src: pages/guides_features_server-tools_web-fetch.md «| **Native** | Passed through from the provider |»]
All on top of token cost of the injected results. [src: pages/guides_features_server-tools_web-search.md «All pricing is in addition to standard LLM token costs for processing the search result content.»]

### 3.5 How results / citations come back

- Chat Completions: `message.annotations[]` of `url_citation` (documented on the deprecated-plugin page, stated to be standardized "for all models"). NOTE the `ChatAssistantMessage` OpenAPI schema does not declare `annotations` (grep finds none in that page) — treat as optional/untyped.

```json
{
  "message": {
    "role": "assistant",
    "content": "Here's the latest news I found: ...",
    "annotations": [
      {
        "type": "url_citation",
        "url_citation": {
          "url": "https://www.example.com/web-search-result",
          "title": "Title of the web search result",
          "content": "Content of the web search result", // Added by OpenRouter if available
          "start_index": 100, // The index of the first character of the URL citation in the message.
          "end_index": 200 // The index of the last character of the URL citation in the message.
        }
      }
    ]
  }
}
```
  [src: pages/guides_features_plugins_web-search.md «Web search results for all models (including native-only models like Perplexity and OpenAI Online) are available in the API and standardized by OpenRouter to follow the same annotation schema»]
- Responses API: flat annotation on `output_text` parts: `{"type":"url_citation","url":…,"start_index":…,"end_index":…,"content":…}`.
  [src: pages/api_reference_responses_web-search.md «"content": "Excerpt from the web page..."»]
- Messages format: the response content-block union (`ORAnthropicContentBlock`) includes `server_tool_use`, `web_search_tool_result` (content = `web_search_result[]` with `url`, `title`, `page_age`, `encrypted_content`, or a `web_search_tool_result_error`), `web_fetch_tool_result` (`web_fetch_result` with `url`, `retrieved_at`, `content` document), and text blocks carry `citations[]` whose union includes `web_search_result_location` (`cited_text`, `encrypted_index`, `title`, `url`). So the SCHEMA allows native Anthropic search blocks + citations to come back; under exactly which engine/model they are emitted (vs. only text) is NOT STATED in prose.
  [src: pages/api_api-reference_anthropic-messages_create-a-message.md «web_search_tool_result: '#/components/schemas/AnthropicWebSearchToolResult'»]
  [src: pages/api_api-reference_anthropic-messages_create-a-message.md «type: web_search_result_location»]
- What the model receives from web_fetch: `{url,title,content,status:"completed",retrieved_at}` or `{url,status:"failed",error}`. [src: pages/guides_features_server-tools_web-fetch.md «"error": "HTTP 404: Page not found"»]

### 3.6 Usage reporting

- Chat/Responses: `usage.server_tool_use_details {tool_calls_requested, tool_calls_executed, web_search_requests}` (omitted when none). Messages: `usage.server_tool_use {web_search_requests, web_fetch_requests, …}` (null when none).
  [src: pages/guides_features_server-tools.md «`web_search_requests` is currently the only tool-specific counter.»]
  [src: pages/guides_features_server-tools.md «provider-native web search may report `web_search_requests` without incrementing that field, so do not add the two together»]
- Fees are inside `usage.cost`. [src: pages/guides_features_server-tools.md «Server tool usage is included in the request's overall `usage.cost`»]
- `/generation` reports `num_search_results`, `num_fetches`, `web_search_engine`.

### 3.7 Deprecated forms

- `plugins: [{id:"web"}]` and `:online` are **deprecated** (still accepted). The plugin always searches once per request; `:online` ≡ the web plugin.
  [src: pages/guides_features_server-tools_web-search.md «(`plugins: [{ id: "web" }]`) and the [`:online` variant](https://openrouter.ai/docs/guides/routing/model-variants/online) are deprecated. Use the `openrouter:web_search` server tool instead.»]
  Plugin param names differ: `include_domains` / `exclude_domains` (vs `allowed_domains` / `excluded_domains` on the tool; web_fetch uses `blocked_domains`).
- `web_search_options: {search_context_size}` (chat) is documented only on the deprecated plugin page; in `models.json` only the gpt-4o family lists `web_search_options` in `supported_parameters`.
- A `web-fetch` plugin id also exists in the plugin union (`WebFetchPlugin`: `max_uses`, `max_content_tokens`, `allowed_domains`, `blocked_domains`); no prose docs found for it.

### 3.8 Privacy/regional caveats of server tools

- ZDR does not cover tool backends; only Firecrawl is rejected under ZDR. Exa/Parallel/Perplexity/native apply their own retention.
  [src: pages/guides_features_server-tools.md «ZDR settings restrict which provider endpoints serve model inference. They do not disable server tools or plugins, and they do not change the retention policy of a third-party backend.»]
- On `eu.openrouter.ai`: no web search engine and no web fetch engine is available (403). On `us.openrouter.ai`: search = Exa only, fetch = none.
  [src: pages/guides_features_server-tools_web-search.md «No engine is available on `eu.openrouter.ai`.»]
  [src: pages/guides_features_server-tools_web-fetch.md «* **IRR availability:** no engine is available on `eu.openrouter.ai` or `us.openrouter.ai`. Regional requests that include `openrouter:web_fetch` are rejected with a `403` error.»]

---

## 4. Structured outputs

- Chat Completions:

```json
"response_format": {
  "type": "json_schema",
  "json_schema": {
    "name": "weather",
    "strict": true,
    "schema": { "type": "object", "properties": { … }, "required": [ … ], "additionalProperties": false }
  }
}
```
  [src: pages/guides_features_structured-outputs.md «On Chat Completions (`/api/v1/chat/completions`), include a `response_format` parameter in your request, with `type` set to `json_schema` and the `json_schema` object containing your schema:»]
  `json_schema.name` is required (max 64 chars, `a-z A-Z 0-9 _ -`); `strict`, `description`, `schema` optional. Also `{type:"json_object"}`. [src: pages/api_api-reference_chat_create-a-chat-completion.md «description: Schema name (a-z, A-Z, 0-9, underscores, dashes, max 64 chars)»]
- Responses: `text.format: {type:"json_schema", name, strict, schema}`.
- Messages format: `output_config: { format: { type: "json_schema", schema: {…} } }` (see §1.4).
- `strict` is not a universal guarantee. [src: pages/guides_features_structured-outputs.md «Enforcement varies by provider: some guarantee schema-conforming output, while others translate your schema into their own structured-output format or treat it as a strong hint, so exact compliance is not guaranteed on every endpoint.»]
- Support is per endpoint. Force it with `provider.require_parameters: true`.
  [src: pages/guides_features_structured-outputs.md «Support is determined per endpoint, not just per model: the same model may be served by multiple providers, and only some of those providers may support structured outputs.»]
  [src: pages/guides_features_structured-outputs.md «2. Set `require_parameters: true` in your provider preferences»]
  Fetched today: **Amazon Bedrock endpoints of Claude 5.5 / Fable 5.2 do NOT list `structured_outputs`** (they list `response_format` only); `claude-on-aws` lacks it for sonnet-5.5 and haiku-5.5; Bedrock endpoints of gpt-6.1-sol / gpt-6.1-terra list neither `structured_outputs` nor `response_format`. `anthropic`, `google-vertex`, `azure`, `openai`, `google-ai-studio` endpoints of the checked text models all list it. (See `endpoints/*.json` → `supported_parameters`.)
- For Claude, OpenRouter auto-applies the Anthropic structured-outputs beta header for json_schema response formats. [src: pages/guides_routing_provider-selection.md «* **Structured outputs for JSON schema response format** (`text.format.type: "json_schema"`, or `response_format.type: "json_schema"` on Chat Completions) — the header is automatically applied»]
- Which models (models.json, the three vendors): 168/177 list `structured_outputs`; NOT listed for `google/gemini-omni-1.2-flash`, `google/gemini-omni-1.1-flash`, `google/gemini-3.1-flash-lite-image`, `google/gemma-4-26b-a4b-it:free`, `google/gemma-4-31b-it:free`, `google/lyria-3-pro-preview`, `google/lyria-3-clip-preview`, `anthropic/claude-opus-4.1`, `openai/gpt-4`.
- **Response-healing plugin**: `plugins: [{ "id": "response-healing" }]`; non-streaming only; only when `response_format`/`text.format` is `json_schema` or `json_object`; repairs syntax (missing brackets, trailing commas, markdown fences, leading prose, unquoted keys) — it does not validate against the schema.
  [src: pages/guides_features_plugins_response-healing.md «The plugin activates for non-streaming requests when you set `text.format` in a [Responses API](https://openrouter.ai/docs/api_reference/responses/overview.md) request (or `response_format` on Chat Completions) to either `type: "json_schema"` or `type: "json_object"`, and include the response-healing plugin in your `plugins` array.»]
  The plugin is also a member of the Messages request `plugins` union; whether it activates for `output_config.format` there: NOT STATED.
- Reasoning-budget trap with structured output: if a reasoning model spends all of `max_tokens` on reasoning you get 200, `finish_reason:"length"`, empty content — billed. [src: pages/api_reference_errors-and-debugging.md «The response is a `200` with `finish_reason: "length"`, empty `content`, and `usage.completion_tokens_details.reasoning_tokens` close to `usage.completion_tokens`.»]

---

## 5. Cost reporting

- `usage` (incl. `cost`) is always returned on non-streaming responses; no opt-in flag. `usage: {include: true}` and `stream_options.include_usage` are deprecated no-ops.
  [src: pages/cookbook_administration_usage-accounting.md «On Chat Completions, the `usage: { include: true }` and `stream_options: { include_usage: true }` parameters are deprecated and have no effect.»]
  [src: pages/api_reference_overview.md «// Usage data is always returned for non-streaming.»]
  (Schema caveat: `usage` is not in `ChatResult.required`, and `cost` is typed `number | null` / "optional" — code defensively.)
- Units: `usage.cost` is "credits"; credits are USD-denominated; `/generation` and the Image API say USD explicitly.
  [src: pages/api_reference_overview.md «/** Cost in credits (optional) */»]
  [src: pages/faq.md «OpenRouter uses a credit system where the base currency is US dollars.»]
  [src: pages/api_api-reference_generations_get-request-&-usage-metadata-for-a-generation.md «description: Total cost of the generation in USD»]
- Chat `usage` fields: `prompt_tokens`, `completion_tokens`, `total_tokens`, `prompt_tokens_details {cached_tokens, cache_write_tokens?, audio_tokens?, video_tokens?}`, `completion_tokens_details {reasoning_tokens?, audio_tokens?, image_tokens?}`, `cost`, `is_byok`, `cost_details {upstream_inference_cost, upstream_inference_prompt_cost, upstream_inference_completions_cost, server_tool_cost?}`, `server_tool_use_details`.
  [src: pages/api_reference_overview.md «cache_write_tokens?: number;  // Tokens written to cache (models with explicit caching)»]
  [src: pages/cookbook_administration_usage-accounting.md «`cached_tokens` is the number of tokens that were *read* from the cache. `cache_write_tokens` is the number of tokens that were *written* to the cache (only returned for models with explicit caching and cache write pricing).»]
- `cost` vs `cost_details`: [src: pages/cookbook_administration_usage-accounting.md «* `cost`: The total amount charged to your account»] ; [src: pages/cookbook_administration_usage-accounting.md «* `cost_details.upstream_inference_cost`: The actual cost charged by the upstream AI provider»]. Via `/generation`, `upstream_inference_cost` is BYOK-only: [src: pages/cookbook_administration_usage-accounting.md «the `upstream_inference_cost` field is only available for BYOK (Bring Your Own Key) requests. For all other requests it will be 0 or null.»]
  Exactly what `usage.cost` contains for a BYOK request (the 5 % fee only vs. 0): NOT STATED on the pages read.
- Token counts are native-tokenizer counts and billing is based on them. [src: pages/api_reference_overview.md «Credit usage and model pricing are based on these native token counts.»]
- Reasoning tokens are billed as output tokens. [src: pages/guides_best-practices_reasoning-tokens.md «Reasoning tokens are considered output tokens and charged accordingly.»]
- Server-tool fees are included in `usage.cost` (§3.6). `cost_details.server_tool_cost` is only for *metered* tools (sandbox time): [src: pages/api_api-reference_anthropic-messages_create-a-message.md «Metered server-tool execution cost (for example, shell sandbox time) billed for this request, in USD.»]
- Long-context / conditional pricing: `pricing.overrides[]` in models.json (e.g. all gpt-6.x: `min_prompt_tokens: 272000` doubles input price; `claude-haiku-5.5`: `min_prompt_tokens: 100000` → 5×). [src: pages/guides_overview_models.md «The top-level pricing keys always reflect the price that applies to a request under default conditions; `overrides` carries the conditional exceptions.»]
- `GET /api/v1/generation?id=<gen-…>` (key required): `total_cost`, `usage` (USD), `upstream_inference_cost`, `cache_discount`, `native_tokens_prompt/completion/reasoning/cached`, `native_tokens_completion_images`, `num_search_results`, `num_fetches`, `num_media_prompt/completion`, `finish_reason`, `native_finish_reason`, `provider_name`, `provider_responses`, `is_byok`, `cancelled`, `latency`, `generation_time`, `data_region`.
  [src: pages/api_reference_overview.md «You can also use the returned `id` to query for the generation stats (including token counts and cost) after the request is complete via the `/api/v1/generation` endpoint.»]
- No markup on inference; fee is on credit purchase. [src: pages/faq.md «OpenRouter charges a 5.5% (\$0.80 minimum) fee when you purchase credits.»]
- Opt-in data-sharing discount: 1 %. [src: pages/guides_privacy_data-collection.md «In exchange, you receive a 1% discount on all model usage.»]
- **Zero-completion insurance** (automatic): [src: pages/guides_features_zero-completion-insurance.md «* The response has zero completion tokens AND a blank/null finish reason»] ; [src: pages/guides_features_zero-completion-insurance.md «* The response has an error finish reason»]. It covers model tokens only — search/fetch/PDF fees already incurred may still be billed: [src: pages/guides_features_zero-completion-insurance.md «It does not cover charges for auxiliary services that already ran before the response failed.»]
- NOT covered: a reasoning model that burns the whole budget (finish_reason `length`, completion_tokens > 0) — billed (§4). A model refusal returned as normal output (`finish_reason: "content_filter"` / `stop_reason: "refusal"`) — whether billed: NOT STATED (it has a non-error finish reason, so the insurance conditions above do not match unless completion tokens are zero AND finish reason blank).
- No-content caveat: [src: pages/api_reference_errors-and-debugging.md «In some cases, you may still be charged for the prompt processing cost by the upstream provider, even if no content is generated.»]
- Image generation billing is all-or-nothing (§12). Response-cache hits are free (opt-in feature). [src: pages/guides_features_response-caching.md «returns it immediately from cache with no billing (all billable usage counters are reported as `0`)»]
- Prompt-cache multipliers: Anthropic write 1.25× (5 min) / 2× (1 h), read 0.1×; OpenAI read 0.25×/0.5×, and **GPT-5.6+ charge cache WRITES at 1.25× automatically**; Gemini implicit read 0.25×.
  [src: pages/guides_best-practices_prompt-caching.md «GPT-5.6 and later charge cache writes at 1.25x the price of the original input pricing, even with automatic caching — no opt-in required.»]

---

## 6. Errors

- Body shape (chat/responses): `{ "error": { "code": number, "message": string, "metadata"?: {…} } }`; HTTP status = `error.code` for pre-flight errors.
  [src: pages/api_reference_errors-and-debugging.md «The HTTP Response will have the same status code as `error.code`, forming a request error if:»]
- Codes (verbatim):
  [src: pages/api_reference_errors-and-debugging.md «* **400**: Bad Request (invalid or missing params, CORS)»]
  [src: pages/api_reference_errors-and-debugging.md «* **401**: Invalid credentials (OAuth session expired, disabled/invalid API key)»]
  [src: pages/api_reference_errors-and-debugging.md «* **402**: Your account or API key has insufficient credits. Add more credits and retry the request.»]
  [src: pages/api_reference_errors-and-debugging.md «* **403**: Forbidden (insufficient permissions, guardrail block, or moderation flag)»]
  [src: pages/api_reference_errors-and-debugging.md «* **408**: Your request timed out»]
  [src: pages/api_reference_errors-and-debugging.md «* **429**: You are being rate limited»]
  [src: pages/api_reference_errors-and-debugging.md «* **502**: Your chosen model is down or we received an invalid response from it»]
  [src: pages/api_reference_errors-and-debugging.md «* **503**: There is no available model provider that meets your routing requirements»]
  Also in the typed table: 404 `not_found` (also returned when `provider.only` ∩ account allow-list is empty), 412, 413 `payload_too_large`, 422, 500 `server`/`unmapped`, 504 `timeout`; Messages reference additionally lists 529 overloaded.
- `Retry-After` may be sent on 429, 503 and on 402 with `metadata.limit_source = "openrouter_in_flight_budget"`.
  [src: pages/api_reference_errors-and-debugging.md «A `402` without the header is not a wait-and-retry case»]
- **Stable machine code**: `error.metadata.error_type` (chat), `error.error_type` (messages), top-level `error_type` (responses). Values: `context_length_exceeded`, `max_tokens_exceeded`, `token_limit_exceeded`, `string_too_long`, `authentication`, `permission_denied`, `payment_required`, `rate_limit_exceeded`, `provider_overloaded`, `provider_unavailable`, `invalid_request`, `invalid_prompt`, `not_found`, `precondition_failed`, `payload_too_large`, `unprocessable`, `content_policy_violation`, `refusal`, `invalid_image`, `image_too_large`, `image_too_small`, `unsupported_image_format`, `image_not_found`, `image_download_failed`, `server`, `timeout`, `unmapped`.
  [src: pages/api_reference_errors-and-debugging.md «Use this value, not the HTTP status code alone, to programmatically distinguish error categories.»]
  `metadata.provider_code` = upstream code (omitted on 500s; 500 messages are masked).
- Moderation error metadata: `{reasons: string[], flagged_input: string, provider_name: string, model_slug: string}`.
  [src: pages/api_reference_errors-and-debugging.md «provider_name: string; // The name of the provider that requested moderation»]
- Content policy / refusal as ERROR → 403 with `error_type` `content_policy_violation` (filter, e.g. Gemini SAFETY) or `refusal` (provider returned refusal as an error).
  [src: pages/api_reference_errors-and-debugging.md «| `content_policy_violation` | 403 | The input or output was flagged by a content filter that runs separately from the model (provider- or OpenRouter-level), such as Gemini's `SAFETY` block. |»]
- Refusal as normal OUTPUT is not an error: chat returns `message.refusal` + `finish_reason: "content_filter"`; Messages keeps `stop_reason: "refusal"`.
  [src: pages/api_reference_errors-and-debugging.md «Chat Completions returns `message.refusal` with `finish_reason: "content_filter"`, and the Responses API returns `status: "incomplete"` with `incomplete_details.reason: "content_filter"` and a `refusal` content part.»]
- **200-with-error (applies to NON-streaming too)**: once a provider accepted the request, status is already 200.
  [src: pages/api_reference_errors-and-debugging.md «If the provider returns headers and then fails, you receive a `200 OK` whose JSON body holds only an `error` object and no `choices`; its `id` identifies the generation when you report the failure. Check the body for an `error` field even on a `200`, rather than relying on the status alone.»]
  And a per-choice error with partial content:

```json
{
  "choices": [{
    "message": { "role": "assistant", "content": "partial output..." },
    "finish_reason": "error",
    "error": {
      "code": 502,
      "message": "Provider disconnected mid-stream",
      "metadata": { "error_type": "provider_unavailable" }
    }
  }]
}
```
  [src: pages/api_reference_errors-and-debugging.md «"message": "Provider disconnected mid-stream",»]
  Status stays 200 even when every provider failed after the first accepted: [src: pages/api_reference_errors-and-debugging.md «so the status stays `200` even when every provider fails — the last error reaches you in the response body»]
- `finish_reason` normalized set: `tool_calls`, `stop`, `length`, `content_filter`, `error` (schema also allows `null`); raw value in `native_finish_reason`.
  [src: pages/api_reference_overview.md «OpenRouter normalizes each model's `finish_reason` to one of the following values: `tool_calls`, `stop`, `length`, `content_filter`, `error`.»]
- Messages skin error envelope and type mapping:

```json
{ "type": "error", "error": { "type": "authentication_error", "message": "Invalid credentials", "error_type": "authentication" }, "request_id": null }
```
  [src: pages/api_reference_errors-and-debugging.md «| `context_length_exceeded`, `content_policy_violation`, `refusal`, `invalid_request`, ... | `invalid_request_error` |»]
  [src: pages/api_reference_errors-and-debugging.md «| `payment_required` | `billing_error` |»]
  Note: in the Messages skin a provider-side `refusal`/content-policy *error* is typed `invalid_request_error` natively (HTTP 403) — rely on `error.error_type`.
- Guardrail/budget blocks → 403 before reaching a provider, `metadata.limit_source` ∈ `openrouter_guardrail_budget | openrouter_workspace_budget | openrouter_key_limit`.
- Upstream 429s are retried on other providers before surfacing; successful responses carry no `X-RateLimit-*` headers.
  [src: pages/api_reference_limits.md «Successful inference responses do not include `X-RateLimit-*` headers.»]

---

## 7. Fallbacks and provider routing

### 7.1 Model fallbacks

- `models: ["a","b",…]` in priority order (chat/responses/messages). Any error can trigger the next model, incl. moderation refusals.
  [src: pages/guides_routing_model-fallbacks.md «The `models` parameter lets you automatically try other models if the primary model's providers are down, rate-limited, or refuse to reply due to content moderation.»]
  [src: pages/guides_routing_model-fallbacks.md «* Context length validation errors»]
- Billed at the model that actually served; check `response.model`.
- Messages skin alternative: `fallbacks: [{model}]` (≤3; no per-entry overrides; not with `models`) — 400 otherwise.
- `route: "fallback"` is deprecated. [src: pages/api_api-reference_chat_create-a-chat-completion.md «**DEPRECATED** Use providers.sort.partition instead.»]
- `~author/family-latest` alias slugs exist (e.g. `~anthropic/claude-sonnet-latest`). [src: pages/guides_features_latest-resolution.md «`~author/family-latest` slugs always resolve to the newest concrete model in a given family»]

### 7.2 `provider` object (verbatim table rows)

[src: pages/guides_routing_provider-selection.md «| `order` | string\[] | - | List of provider slugs to try in order (e.g. `["anthropic", "openai"]`). [Learn more](#ordering-specific-providers) |»]
[src: pages/guides_routing_provider-selection.md «| `allow_fallbacks` | boolean | `true` | Whether to allow backup providers when the primary is unavailable. [Learn more](#disabling-fallbacks) |»]
[src: pages/guides_routing_provider-selection.md «| `require_parameters` | boolean | `false` | Only use providers that support all parameters in your request. [Learn more](#requiring-providers-to-support-all-parameters) |»]
[src: pages/guides_routing_provider-selection.md «| `data_collection` | "allow" \| "deny" | "allow" | Control whether to use providers that may store data. [Learn more](#requiring-providers-to-comply-with-data-policies) |»]
[src: pages/guides_routing_provider-selection.md «| `zdr` | boolean | - | Restrict routing to only ZDR (Zero Data Retention) endpoints. [Learn more](#zero-data-retention-enforcement) |»]
[src: pages/guides_routing_provider-selection.md «| `enforce_distillable_text` | boolean | - | Restrict routing to only models that allow text distillation. [Learn more](#distillable-text-enforcement) |»]
[src: pages/guides_routing_provider-selection.md «| `only` | string\[] | - | List of provider slugs to allow for this request. [Learn more](#allowing-only-specific-providers) |»]
[src: pages/guides_routing_provider-selection.md «| `ignore` | string\[] | - | List of provider slugs to skip for this request. [Learn more](#ignoring-providers) |»]
[src: pages/guides_routing_provider-selection.md «| `quantizations` | string\[] | - | List of quantization levels to filter by (e.g. `["int4", "int8"]`). [Learn more](#quantization) |»]
[src: pages/guides_routing_provider-selection.md «| `sort` | string \| object | - | Sort providers by price, throughput, or latency. Can be a string (e.g. `"price"`) or an object with `by` and `partition` fields. [Learn more](#provider-sorting) |»]
[src: pages/guides_routing_provider-selection.md «| `max_price` | object | - | The maximum pricing you want to pay for this request. [Learn more](#max-price) |»]
Also `preferred_min_throughput`, `preferred_max_latency` (soft preferences), `options` (per-provider passthrough). The schema is `additionalProperties: false` (unknown keys in `provider` are invalid).

Semantics:
- Default (no prefs): weighted-random among providers near the best on effective price/throughput/latency/reliability — NOT simply cheapest; BYOK keys first. Default routing is bypassed by `sort`, `order`, `:nitro`/`:floor`.
  [src: pages/guides_routing_provider-selection.md «Providers close to the best share most of the traffic, and each request picks one at random, weighted by those shares.»]
- `order`: tried in sequence, then (unless `allow_fallbacks:false`) all other providers. [src: pages/guides_routing_provider-selection.md «OpenRouter will try them one at a time and proceed to other providers if none are operational. If you don't want to allow any other public providers, you should [disable fallbacks](#disabling-fallbacks) as well.»]
- `allow_fallbacks:false` without `order` ⇒ only the top-ranked provider. [src: pages/guides_routing_provider-selection.md «Without `order`, the request is served only by the top-ranked provider.»]
- `only`: intersected with the account-wide allow list; empty ⇒ 404. `ignore`: merged with account-wide ignore list.
  [src: pages/guides_routing_provider-selection.md «If no provider satisfies both, the request fails with a 404.»]
- Slugs: base slug (`"google-vertex"`) matches all regions/variants but NOT service-tier endpoints; shape `provider[/variant][/region][/tier]`. Slugs seen today for the 3 vendors: `anthropic`, `anthropic/fast`, `claude-on-aws`, `amazon-bedrock[/region]`, `google-vertex/global|us|europe|eu`, `azure[/global|us|eu]`, `openai`, `openai/flex|fast|ultrafast`, `google-ai-studio[/flex|priority]`.
  [src: pages/guides_routing_provider-selection.md «A base slug does not by itself opt into a [service tier endpoint]»]
- Regional (surcharged; +10 % in most endpoint records fetched today, e.g. $2.2 vs $2 for `amazon-bedrock/us-east-1` Claude Sonnet 5.5) endpoints of closed-weight models are skipped on the global domain unless pinned by full slug. [src: pages/guides_features_in-region-routing.md «A bare provider slug such as `amazon-bedrock` does not pin its regional endpoints»]
- `require_parameters`: default false ⇒ unsupported params silently ignored by the provider; true ⇒ provider excluded. Soft preference for `tools`/response format/`verbosity` always applies (§2).
- `data_collection`: [src: pages/guides_routing_provider-selection.md «* `allow`: (default) allow providers which store user data non-transiently and may train on it»] ; [src: pages/guides_routing_provider-selection.md «* `deny`: use only providers which do not collect user data»]. If none qualifies the request errors.
- `zdr: true`: only ZDR endpoints, plus Safety-Retention endpoints unless account/guardrail says "ZDR only"; OR-ed with account/guardrail settings (can only tighten).
  [src: pages/guides_routing_provider-selection.md «Safety Retention endpoints (which may retain prompts and responses from any request, only to prevent abuse, and don't train on them) are also eligible unless your privacy settings or guardrail are set to **ZDR only**.»]
- `sort`: `"price" | "throughput" | "latency"` or `{by, partition: "model"(default) | "none"}`; setting it disables load balancing.
- `max_price`: `{prompt, completion, request, image, audio}` USD (per M tokens for prompt/completion); hard filter. [src: pages/guides_routing_provider-selection.md «This is different than `max_price`, which will prevent your request from running if the price is not available.»]
- `quantizations`, `enforce_distillable_text`: irrelevant for first-party closed models (filters only).
- Sticky routing: after a cached request OpenRouter keeps the same provider per account+model+conversation for 60 min; `session_id` makes it explicit; ignored when `provider.order` is set.
  [src: pages/guides_best-practices_prompt-caching.md «Sticky routing is not used when you specify a manual [provider order]»]

---

## 8. Privacy / data

### 8.1 What OpenRouter itself keeps

- Prompts/completions: not stored by default; metadata is.
  [src: pages/guides_privacy_data-collection.md «OpenRouter does not store your prompts or responses, *unless* you opt in to one or both of the following, or content is flagged as potential CSAM:»]
  [src: pages/guides_privacy_data-collection.md «OpenRouter does store metadata (e.g. number of prompt and completion tokens, latency, etc) for each request.»]
  [src: pages/faq.md «We do zero logging of your prompts/completions, even if an error occurs, unless you opt-in to logging them.»]
- Two opt-ins (both OFF by default):
  - **"Private Input & Output Logging"** — Observability settings (`https://openrouter.ai/workspaces/default/observability`); beta; stored ≥ 3 months; not applied on regional hosts.
    [src: pages/guides_features_input-output-logging.md «* **Retention**: Data is retained for a minimum of 3 months, and may be retained beyond 3 months at OpenRouter's discretion unless you request deletion.»]
  - **"OpenRouter Use of Inputs/Outputs"** — Privacy settings; 1 % discount; lets OpenRouter use the data.
    [src: pages/guides_privacy_data-collection.md «* **OpenRouter Use of Inputs/Outputs:** Allow OpenRouter to use your prompt and completion data to improve the product.»]
- Exceptions even at defaults: (a) CSAM screening of all inference traffic incl. ZDR (flagged content may be retained); (b) anonymous prompt-category sampling; (c) requests to Safety-Retention endpoints.
  [src: pages/guides_features_zdr.md «OpenRouter will screen all inference requests, including ZDR traffic, for child sexual abuse material (CSAM) in flight.»]
  [src: pages/guides_privacy_data-collection.md «OpenRouter samples a small number of prompts for categorization to power our reporting and model ranking.»]
  [src: pages/guides_privacy_data-collection.md «Requests to Safety Retention endpoints are the exception: OpenRouter or the provider may retain prompts and responses from any request, only to prevent abuse, and not for training.»]
- `user` field is hashed before going upstream; if omitted an account-level identity is used (a policy block can then hit the whole account).
  [src: pages/api_api-reference_chat_create-a-chat-completion.md «If omitted, requests use an account-level identity, so provider policy blocks can affect the whole account.»]

### 8.2 Account-level privacy settings (`https://openrouter.ai/settings/privacy`)

- Training toggles: "separate settings for paid and free models" (exact toggle label NOT STATED). Providers that log or have unconfirmed policy are not routed to unless the training toggle is on.
  [src: pages/guides_privacy_provider-logging.md «On your account settings page, you can set whether you would like to allow routing to providers that may train on your data (according to their own policies). There are separate settings for paid and free models.»]
  [src: pages/faq.md «Providers that do log, or where we have been unable to confirm their policy, will not be routed to unless the model training toggle is switched on in the [privacy settings](https://openrouter.ai/settings/privacy) tab.»]
- ZDR enforcement per model group — five toggles: **Anthropic, OpenAI, Google, SpaceXAI, All other models**; plus the choice **"ZDR only"** vs **"Allow Safety Retention"** (separately for Google and for all other models).
- Account-wide allowed providers / ignored providers; maximum API key lifetime.
- Guardrails (per workspace: Workspaces > Default > Guardrails; assignable to members or API keys; nothing is enforced until assigned): budget, model allowlist, provider allowlist, ZDR per model group (`enforce_zdr_anthropic|openai|google|xai|other`), `allow_safety_retention_google|other`, `allowed_data_regions` (`global|europe|us`, Business/Enterprise), prompt-injection/PII/content filters. Combination rule: stricter wins.
  [src: pages/guides_features_guardrails.md «A guardrail enforces nothing until it is assigned.»]
  [src: pages/guides_features_guardrails.md «* **Zero Data Retention**: OR logic per model group»]

### 8.3 Data-policy tiers and ZDR semantics

- Three tiers: ZDR / Safety Retention / Retention and Training.
  [src: pages/guides_features_zdr.md «| **Safety Retention** | OpenRouter or a provider may retain prompts and responses from any request, whether flagged or not, only to detect, investigate, and prevent abuse. | No |»]
- Unknown policy ⇒ treated as retain+train. [src: pages/guides_features_zdr.md «we take a conservative stance and assume that the endpoint both retains and trains on data and mark it as such»]
- **What ZDR enforcement does to the three vendors (decisive):**
  [src: pages/guides_features_zdr.md «| **Anthropic** | Removes first-party Anthropic endpoints (Bedrock and Vertex remain available) |»]
  [src: pages/guides_features_zdr.md «| **OpenAI** | Removes first-party OpenAI endpoints (Azure remains available) |»]
  [src: pages/guides_features_zdr.md «| **Google** | Removes AI Studio endpoints. Vertex endpoints that use Safety Retention remain available only if Safety Retention is allowed»]
  ⇒ **first-party Anthropic, first-party OpenAI and Google AI Studio endpoints are NOT ZDR on OpenRouter.**
- Google Vertex is Safety-Retention, not strict ZDR, since 2026-10-18.
  [src: pages/guides_features_zdr.md «Starting October 18, 2026, Google requires Safety Retention for Google models served through Vertex. With Safety Retention, Google doesn't retain prompts by default, but it may retain prompts that its safety classifiers flag, for up to 90 days, for abuse monitoring. Google doesn't use retained prompts for training. These endpoints don't meet a strict Zero Data Retention requirement.»]
  [src: pages/guides_features_zdr.md «| **ZDR only** | Excludes endpoints that use Safety Retention. Most Google models become unavailable. |»]
  Default if you never chose: self-serve = Allow Safety Retention; enterprise = ZDR only. [src: pages/guides_features_zdr.md «If you haven't chosen, self-serve accounts allow Safety Retention and enterprise accounts use ZDR only.»]
- ZDR caveats:
  - Only inference routing; not plugins/tools (web search/fetch backends) — §3.8.
    [src: pages/guides_features_zdr.md «ZDR enforcement only applies to provider routing for inference requests. It does not apply to [plugins](https://openrouter.ai/docs/guides/features/plugins.md) and tools you choose to enable»]
  - Provider in-memory prompt caching is allowed under ZDR. [src: pages/guides_features_zdr.md «OpenRouter has taken the stance that in-memory caching of prompts is *not* considered "retaining" data»]
  - CSAM exception; BYOK keys follow the same rules unless you *declare* ZDR on the key (unverified attestation); video generation endpoints always count as retaining.
  - Losing native tools: Vertex/Bedrock/Azure Claude endpoints have no native web search/fetch (§3.3), so ZDR for Claude ⇒ search runs on Exa.
- `data_collection: "deny"` filters on the *training/collection* policy; `zdr` filters on *retention*. A provider can be non-training but retaining.
  [src: pages/guides_features_zdr.md «However we do have some endpoints & providers who do not train on your data but *do* retain it (e.g. to scan for abuse or for legal reasons).»]
  Whether first-party Anthropic/OpenAI/AI Studio endpoints pass `data_collection: "deny"` (i.e. are marked non-training): **NOT STATED** in any file read — the per-provider policy table on the provider-logging page is not present in the markdown export, `providers.json` only has policy URLs, and `/models/{id}/endpoints` has no data-policy field. Must be checked in the dashboard (model page "Data Policy" tag / guardrail eligibility preview) or with an authenticated `GET /api/v1/models/user`.
- **ZDR-eligible endpoints today for the candidate models** (`endpoints-zdr.json`; `safety_retention` flag in brackets):

| Model | Endpoints in ZDR list |
| - | - |
| anthropic/claude-fable-5.2 | **none** (model has anthropic, anthropic/fast, vertex/global, bedrock, azure endpoints, none listed) |
| anthropic/claude-opus-5.5 | amazon-bedrock, amazon-bedrock/eu-west-1, amazon-bedrock/us-east-1, google-vertex/global, google-vertex/us, google-vertex/europe (all false) |
| anthropic/claude-sonnet-5.5 | same six as opus-5.5 (all false) |
| anthropic/claude-haiku-5.5 | same six (all false) |
| openai/gpt-6-astra | azure, azure/us (false) |
| openai/gpt-6.1-sol | azure, azure/eu, azure/us (false) |
| openai/gpt-6.1-terra | azure, azure/eu, azure/us (false) |
| openai/gpt-6-luna | azure, azure/eu, azure/us (false) |
| google/gemini-4-argon | google-vertex/global, google-vertex/global/priority, google-vertex/us (**all safety_retention=true**) |
| google/gemini-4-carbon | google-vertex/global, /global/priority, /us, /eu (all true) |
| google/gemini-4-hydrogen | google-vertex/global, /global/priority, /us, /eu (all true) |
| google/gemini-3.8-flash | google-vertex/global, /global/flex, /global/priority, /us (all true) |
| google/gemini-3.5-flash-lite | google-vertex/global, /global/flex, /global/priority, /us, /eu (all true) |
| google image models (nano-banana-2.1, 3-pro-image, 3.1-flash-image, 3.1-flash-lite-image, 2.5-flash-image) | google-vertex/global (3.1-flash-image also /us) (all true) |
| openai/gpt-5.4-image-2, openai/gpt-image-2.6-*, openai/gpt-image-2, google/gemini-omni-1.2-flash | **none** |

  [src: pages/api_api-reference_endpoints_preview-the-impact-of-zdr-on-the-available-endpoints.md «Whether the endpoint uses Safety Retention: prompts are not retained by default, but the provider may retain prompts its safety classifiers flag. A ZDR-enforced request reaches these endpoints only when the account allows Safety Retention and no applied guardrail disallows it.»]
  (Fetched unauthenticated; the page title is "Preview the impact of ZDR on the available endpoints" — whether results vary per account: NOT STATED. Bedrock endpoints lack `structured_outputs` for Claude 5.5, see §4.)

### 8.4 In-region routing (EU/US)

- Hostnames `https://eu.openrouter.ai` / `https://us.openrouter.ai`; Business or Enterprise plan only; fails closed; excludes "global" provider deployments (so only regional, surcharged endpoints).
  [src: pages/guides_features_in-region-routing.md «EU in-region routing (`eu.openrouter.ai`) and US in-region routing (`us.openrouter.ai`) are available on the Business and Enterprise plans.»]
  [src: pages/guides_features_in-region-routing.md «In-region routing fails closed: OpenRouter never silently routes a regional request outside the region.»]
- Account/billing data may still be in the US. [src: pages/faq.md «Account and billing data may be stored or processed in the US.»]
- I/O logging is skipped on regional hosts; web search/fetch unavailable on EU (§3.8).

### 8.5 Moderation / OpenAI extras

- `top_provider.is_moderated` in models.json: true for all Anthropic entries except `anthropic/claude-opus-4.8`, true for 82 of 98 OpenAI entries, false for all 47 Google entries. Doc definition is only: [src: pages/guides_overview_models.md «"is_moderated": boolean         // Whether content moderation is applied»]. Who performs it / with which classifier: NOT STATED. A moderation flag yields 403 with `ModerationErrorMetadata` (§6) and can trigger model fallback.
- OpenAI organization verification / ID verification requirements: NOT STATED anywhere in the pages read (grep for "organization verification", "verified org" = no hits).
- BYOK required for specific OpenAI features only (container `file_ids` on the Responses API): [src: pages/api_api-reference_responses_create-a-response.md «requires BYOK (your own OpenAI key)»]

---

## 9. Rate limits and credits

- Paid models: no platform request cap; capacity governed globally; extra accounts/keys do not help.
  [src: pages/api_reference_limits.md «Making additional accounts or API keys will not affect your rate limits, as we govern capacity globally.»]
  [src: pages/api_reference_limits.md «switch to the paid variant of the model, which has no platform-level request cap»]
- Free (`:free`) models: 20 req/min; 50/day if < 10 credits ever purchased, 1000/day otherwise.
  [src: pages/api_reference_limits.md «| Less than 10 | 20 | 50 |»]
- 429 can come from OpenRouter or upstream; upstream 429s are first retried on other providers. `Retry-After` when every attempted provider gave a hint.
- Check key: `GET https://openrouter.ai/api/v1/key` → `data.{label, limit, limit_reset, limit_remaining, usage, usage_daily/weekly/monthly, byok_usage*, is_free_tier, budgets[], effective_budget, free_model_daily_requests}`. Per-IP burst-limited.
  [src: pages/api_reference_limits.md «To check the rate limit or credits left on an API key, make a GET request to `https://openrouter.ai/api/v1/key`.»]
- `GET /api/v1/credits` (`total_credits`, `total_usage`) needs a **management key**. [src: pages/api_api-reference_credits_get-remaining-credits.md «Get total credits purchased and used for the authenticated user. [Management key](/docs/guides/overview/auth/management-api-keys) required.»]
- 402 cases: negative balance (even free models fail), key limit exhausted (`limit_source: openrouter_key_limit`), balance can't cover (`openrouter_credits`), or **in-flight spending budget** (`openrouter_in_flight_budget`, transient, has `Retry-After`).
  [src: pages/api_reference_limits.md «If your account has a negative credit balance, you may see  errors, including for free models.»]
  [src: pages/api_reference_limits.md «A request whose estimated cost does not fit alongside your running and recently completed requests is rejected with  before it reaches a provider, even though your balance is positive.»]
  The in-flight estimate uses input tokens + `max_tokens` (or a fixed cap if unset) ⇒ many concurrent requests with large `max_tokens` on a small balance can 402. Applies only to low-balance / new prepaid accounts.
  [src: pages/api_reference_limits.md «The budget applies to prepaid accounts spending their own credits, and only to a subset of them: accounts whose balance is below a threshold, and, while the mechanism is being rolled out, newer accounts without an established spending history.»]
- Budget blocks are 403 (not 402), no `Retry-After`.
- Fees: 5.5 % ($0.80 min) on credit purchases; crypto 5 %. Credits may expire after one year; refunds only within 24 h, fees non-refundable.
  [src: pages/faq.md «Crypto payments are charged a fee of 5%.»]
  [src: pages/faq.md «we reserve the right to expire unused credits after one year of purchase»]
- Auto top-up exists. [src: pages/faq.md «set up auto top up so that the balance is replenished when it gets below the set threshold»]

---

## 10. BYOK

- Configure provider keys in workspace BYOK settings (`https://openrouter.ai/integrations`, per-provider pages like `/settings/integrations/openai`).
- Fee: 5 % of the normal OpenRouter price, deducted from OpenRouter credits, after a free allowance of $25,000/month list-price usage on pay-as-you-go.
  [src: pages/guides_overview_auth_byok.md «The cost of using custom provider keys on OpenRouter is **5% of what the same model/provider would cost normally on OpenRouter** and will be deducted from your OpenRouter credits.»]
  [src: pages/guides_overview_auth_byok.md «Pay-as-you-go includes \$25,000 per month, while Enterprise allowances are custom.»]
- Routing: prioritized BYOK keys are tried before shared capacity (unless `provider.order` says otherwise); by default falls back to OpenRouter credits when the key fails.
  [src: pages/guides_overview_auth_byok.md «By default, if all keys in both sections encounter a rate limit or failure, OpenRouter will fall back to using shared OpenRouter endpoints.»]
  Per-key "Shared capacity fallback": **Use shared capacity** (default) / **Never use shared capacity for models this key applies to** / **Never use shared capacity for any model on this provider**.
- Providers explicitly documented with BYOK setup: OpenAI, Anthropic (key declarations mentioned), Azure (Foundry / Azure OpenAI), Amazon Bedrock (API key or AWS credentials), Google Vertex (service-account JSON with optional `region`). **Google AI Studio BYOK: NOT STATED** on the BYOK page (no mention of AI Studio / Gemini API keys).
  [src: pages/guides_overview_auth_byok.md «To use Google Vertex AI with OpenRouter, provide your Google Cloud service account key in JSON format.»]
  [src: pages/guides_overview_auth_byok.md «your OpenAI project, your Azure resource, or your Anthropic organization»]
- BYOK does not bypass data policies; ZDR declaration per key ("Provider agreement" → "My account has ZDR") is an unverified attestation that makes that key eligible under ZDR.
  [src: pages/guides_overview_auth_byok.md «A BYOK key does not exempt a provider from your `data_collection` restrictions.»]
- BYOK spend does not count toward guardrail/workspace budgets unless "Include BYOK spend" is on. `usage.is_byok` flags such requests.
- Debug BYOK failures via Activity → "View Raw Metadata" → `provider_responses`.

---

## 11. MODELS (from `models.json`, fetched 2026-11-13)

Counts: openai/ 98, google/ 47, anthropic/ 32 (= 177). 67 of them are `:batch` variants whose `endpoints` is only `["/api/v1/batches"]` (not usable for synchronous calls). All 110 non-batch entries list `/api/v1/chat/completions`, `/api/v1/completions`, `/api/v1/messages`, `/api/v1/responses`; 10 additionally `/api/v1/images`; 2 additionally `/api/v1/videos`.

Notes on columns: prices are `pricing.prompt` / `pricing.completion` × 1e6 ("Pricing from the top provider for this model"; other endpoints can differ — regional endpoints are ~10 % higher, flex ~50 % lower, priority/fast 1.8–2×). `web_search $` is per search. `image` = `pricing.image` (input image price, USD/token for Gemini). `reasoning`: `mand` = `reasoning.mandatory: true`; efforts list; `def=` default effort; `param` = `reasoning` in supported_parameters but no `reasoning` object. `endpoints` abbreviated without `/api/v1/`. `created` = unix `created` → UTC date (date added to OpenRouter).

### 11.1 Full table (all ids starting with anthropic/, openai/, google/)

| id | name | created | ctx | max_out | in $/M | out $/M | cache rd $/M | cache wr $/M | web_search $ | image | in mod | out mod | tools | structured_outputs | response_format | web_search_options | reasoning | endpoints | is_moderated | expires |
|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|
| `anthropic/claude-fable-5.2` | Claude Fable 5.2 | 2026-11-09 | 1000000 | 128000 | 8 | 40 | 0.2 | 10 | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=high | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-fable-5.2:batch` | Claude Fable 5.2 (batch) | 2026-11-09 | 1000000 | 128000 | 4 | 20 | 0.1 | 5 | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=high | batches | True | - |
| `anthropic/claude-haiku-5.5` | Claude Haiku 5.5 | 2026-10-07 | 1000000 | 128000 | 0.1 | 0.5 | 0.01 | 0.125 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-haiku-5.5:batch` | Claude Haiku 5.5 (batch) | 2026-10-07 | 1000000 | 128000 | 0.05 | 0.25 | 0.005 | 0.0625 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | batches | True | - |
| `anthropic/claude-sonnet-5.5` | Claude Sonnet 5.5 | 2026-09-28 | 1000000 | 128000 | 2 | 10 | 0.1 | 2.5 | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=high | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-sonnet-5.5:batch` | Claude Sonnet 5.5 (batch) | 2026-09-28 | 1000000 | 128000 | 1 | 5 | 0.05 | 1.25 | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=high | batches | True | - |
| `anthropic/claude-opus-5.5` | Claude Opus 5.5 | 2026-09-22 | 1000000 | 128000 | 4 | 20 | 0.2 | 5 | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=high | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-opus-5.5:batch` | Claude Opus 5.5 (batch) | 2026-09-22 | 1000000 | 128000 | 2 | 10 | 0.1 | 2.5 | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=high | batches | True | - |
| `anthropic/claude-fable-5.1` | Claude Fable 5.1 | 2026-09-01 | 1000000 | 128000 | 10 | 50 | 0.25 | 12.5 | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=high | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-fable-5.1:batch` | Claude Fable 5.1 (batch) | 2026-09-01 | 1000000 | 128000 | 5 | 25 | 0.125 | 6.25 | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=high | batches | True | - |
| `anthropic/claude-opus-5` | Claude Opus 5 | 2026-07-24 | 1000000 | 128000 | 5 | 25 | 0.5 | 6.25 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=high | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-opus-5:batch` | Claude Opus 5 (batch) | 2026-07-24 | 1000000 | 128000 | 2.5 | 12.5 | 0.25 | 3.125 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=high | batches | True | - |
| `anthropic/claude-sonnet-5` | Claude Sonnet 5 | 2026-06-30 | 1000000 | 128000 | 2 | 10 | 0.2 | 2.5 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=high | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-sonnet-5:batch` | Claude Sonnet 5 (batch) | 2026-06-30 | 1000000 | 128000 | 1 | 5 | 0.1 | 1.25 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=high | batches | True | - |
| `anthropic/claude-fable-5` | Claude Fable 5 | 2026-06-09 | 1000000 | 128000 | 10 | 50 | 1 | 12.5 | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=high | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-fable-5:batch` | Claude Fable 5 (batch) | 2026-06-09 | 1000000 | 128000 | 5 | 25 | 0.5 | 6.25 | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=high | batches | True | - |
| `anthropic/claude-opus-4.8` | Claude Opus 4.8 | 2026-05-27 | 1000000 | 128000 | 5 | 25 | 0.5 | 6.25 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=high | chat/completions,completions,messages,responses | False | - |
| `anthropic/claude-opus-4.8:batch` | Claude Opus 4.8 (batch) | 2026-05-27 | 1000000 | 128000 | 2.5 | 12.5 | 0.25 | 3.125 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=high | batches | True | - |
| `anthropic/claude-opus-4.7` | Claude Opus 4.7 | 2026-04-16 | 1000000 | 128000 | 5 | 25 | 0.5 | 6.25 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=high | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-opus-4.7:batch` | Claude Opus 4.7 (batch) | 2026-04-16 | 1000000 | 128000 | 2.5 | 12.5 | 0.25 | 3.125 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=high | batches | True | - |
| `anthropic/claude-sonnet-4.6` | Claude Sonnet 4.6 | 2026-02-17 | 1000000 | 128000 | 3 | 15 | 0.3 | 3.75 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-sonnet-4.6:batch` | Claude Sonnet 4.6 (batch) | 2026-02-17 | 1000000 | 128000 | 1.5 | 7.5 | 0.15 | 1.875 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/high/medium/low/none def=medium | batches | True | - |
| `anthropic/claude-opus-4.6` | Claude Opus 4.6 | 2026-02-04 | 1000000 | 128000 | 5 | 25 | 0.5 | 6.25 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/high/medium/low/none def=high | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-opus-4.6:batch` | Claude Opus 4.6 (batch) | 2026-02-04 | 1000000 | 128000 | 2.5 | 12.5 | 0.25 | 3.125 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt max/high/medium/low/none def=high | batches | True | - |
| `anthropic/claude-opus-4.5` | Claude Opus 4.5 | 2025-11-24 | 200000 | 64000 | 5 | 25 | 0.5 | 6.25 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt  | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-opus-4.5:batch` | Claude Opus 4.5 (batch) | 2025-11-24 | 200000 | 64000 | 2.5 | 12.5 | 0.25 | 3.125 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt  | batches | True | - |
| `anthropic/claude-haiku-4.5` | Claude Haiku 4.5 | 2025-10-15 | 200000 | 64000 | 1 | 5 | 0.1 | 1.25 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt  | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-haiku-4.5:batch` | Claude Haiku 4.5 (batch) | 2025-10-15 | 200000 | 64000 | 0.5 | 2.5 | 0.05 | 0.625 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt  | batches | True | - |
| `anthropic/claude-sonnet-4.5` | Claude Sonnet 4.5 | 2025-09-29 | 1000000 | 64000 | 3 | 15 | 0.3 | 3.75 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt  | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-sonnet-4.5:batch` | Claude Sonnet 4.5 (batch) | 2025-09-29 | 1000000 | 64000 | 1.5 | 7.5 | 0.15 | 1.875 | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt  | batches | True | - |
| `anthropic/claude-opus-4.1` | Claude Opus 4.1 | 2025-08-05 | 200000 | 32000 | 15 | 75 | 1.5 | 18.75 | 0.01 | - | image,text,file | text | Y | n | n | n | opt  | chat/completions,completions,messages,responses | True | - |
| `anthropic/claude-opus-4.1:batch` | Claude Opus 4.1 (batch) | 2025-08-05 | 200000 | 32000 | 7.5 | 37.5 | 0.75 | 9.375 | 0.01 | - | image,text,file | text | Y | Y | Y | n | opt  | batches | True | - |
| `openai/gpt-6.1-terra-pro` | GPT-6.1 Terra Pro | 2026-10-26 | 1050000 | 128000 | 1 | 5 | 0.05 | 1.25 | 0.01 | - | file,image,text | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-6.1-terra-pro:batch` | GPT-6.1 Terra Pro (batch) | 2026-10-26 | 1050000 | 128000 | 0.5 | 2.5 | 0.025 | 0.625 | 0.01 | - | file,image,text | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=medium | batches | True | - |
| `openai/gpt-6.1-terra` | GPT-6.1 Terra | 2026-10-26 | 1050000 | 128000 | 1 | 5 | 0.05 | 1.25 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-6.1-terra:batch` | GPT-6.1 Terra (batch) | 2026-10-26 | 1050000 | 128000 | 0.5 | 2.5 | 0.025 | 0.625 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-6.1-sol-pro` | GPT-6.1 Sol Pro | 2026-09-29 | 1050000 | 128000 | 2 | 10 | 0.1 | 2.5 | 0.01 | - | file,image,text | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-6.1-sol-pro:batch` | GPT-6.1 Sol Pro (batch) | 2026-09-29 | 1050000 | 128000 | 1 | 5 | 0.05 | 1.25 | 0.01 | - | file,image,text | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=medium | batches | True | - |
| `openai/gpt-6.1-sol` | GPT-6.1 Sol | 2026-09-29 | 1050000 | 128000 | 2 | 10 | 0.1 | 2.5 | 0.01 | - | file,image,text | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-6.1-sol:batch` | GPT-6.1 Sol (batch) | 2026-09-29 | 1050000 | 128000 | 1 | 5 | 0.05 | 1.25 | 0.01 | - | file,image,text | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=medium | batches | True | - |
| `openai/gpt-6-luna-pro` | GPT-6 Luna Pro | 2026-09-22 | 1050000 | 128000 | 0.1 | 0.5 | 0.01 | 0.125 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-6-luna-pro:batch` | GPT-6 Luna Pro (batch) | 2026-09-22 | 1050000 | 128000 | 0.05 | 0.25 | 0.005 | 0.0625 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-6-luna` | GPT-6 Luna | 2026-09-22 | 1050000 | 128000 | 0.1 | 0.5 | 0.01 | 0.125 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-6-luna:batch` | GPT-6 Luna (batch) | 2026-09-22 | 1050000 | 128000 | 0.05 | 0.25 | 0.005 | 0.0625 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-6-sol-pro` | GPT-6 Sol Pro | 2026-09-22 | 1050000 | 128000 | 2 | 10 | 0.2 | 2.5 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-6-sol-pro:batch` | GPT-6 Sol Pro (batch) | 2026-09-22 | 1050000 | 128000 | 1 | 5 | 0.1 | 1.25 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-6-sol` | GPT-6 Sol | 2026-09-22 | 1050000 | 128000 | 2 | 10 | 0.2 | 2.5 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-6-sol:batch` | GPT-6 Sol (batch) | 2026-09-22 | 1050000 | 128000 | 1 | 5 | 0.1 | 1.25 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-6-astra` | GPT-6 Astra | 2026-09-04 | 1050000 | 128000 | 10 | 50 | 1 | 12.5 | 0.01 | - | file,image,text | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-6-astra:batch` | GPT-6 Astra (batch) | 2026-09-04 | 1050000 | 128000 | 5 | 25 | 0.5 | 6.25 | 0.01 | - | file,image,text | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=medium | batches | True | - |
| `openai/gpt-6-astra-pro` | GPT-6 Astra Pro | 2026-09-04 | 1050000 | 128000 | 10 | 50 | 1 | 12.5 | 0.01 | - | file,image,text | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-6-astra-pro:batch` | GPT-6 Astra Pro (batch) | 2026-09-04 | 1050000 | 128000 | 5 | 25 | 0.5 | 6.25 | 0.01 | - | file,image,text | text | Y | Y | Y | n | mand max/xhigh/high/medium/low def=medium | batches | True | - |
| `openai/gpt-5.6-luna-pro` | GPT-5.6 Luna Pro | 2026-07-09 | 1050000 | 128000 | 0.2 | 1.2 | 0.02 | 0.25 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.6-luna-pro:batch` | GPT-5.6 Luna Pro (batch) | 2026-07-09 | 1050000 | 128000 | 0.1 | 0.6 | 0.01 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-5.6-luna` | GPT-5.6 Luna | 2026-07-09 | 1050000 | 128000 | 0.2 | 1.2 | 0.02 | 0.25 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.6-luna:batch` | GPT-5.6 Luna (batch) | 2026-07-09 | 1050000 | 128000 | 0.1 | 0.6 | 0.01 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-5.6-terra-pro` | GPT-5.6 Terra Pro | 2026-07-09 | 1050000 | 128000 | 2 | 12 | 0.2 | 2.5 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.6-terra-pro:batch` | GPT-5.6 Terra Pro (batch) | 2026-07-09 | 1050000 | 128000 | 1 | 6 | 0.1 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-5.6-terra` | GPT-5.6 Terra | 2026-07-09 | 1050000 | 128000 | 2 | 12 | 0.2 | 2.5 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.6-terra:batch` | GPT-5.6 Terra (batch) | 2026-07-09 | 1050000 | 128000 | 1 | 6 | 0.1 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-5.6-sol-pro` | GPT-5.6 Sol Pro | 2026-07-09 | 1050000 | 128000 | 4 | 20 | 0.4 | 5 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.6-sol-pro:batch` | GPT-5.6 Sol Pro (batch) | 2026-07-09 | 1050000 | 128000 | 2 | 10 | 0.2 | 2.5 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-5.6-sol` | GPT-5.6 Sol | 2026-07-09 | 1050000 | 128000 | 4.4 | 22 | 0.44 | 5.5 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-5.6-sol:batch` | GPT-5.6 Sol (batch) | 2026-07-09 | 1050000 | 128000 | 2 | 10 | 0.2 | 2.5 | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt max/xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-chat-latest` | GPT Chat Latest | 2026-05-05 | 400000 | 128000 | 5 | 30 | 0.5 | - | 0.01 | - | text,image,file | text | Y | Y | Y | n | - | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.5-pro` | GPT-5.5 Pro | 2026-04-24 | 1050000 | 128000 | 30 | 180 | - | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | mand xhigh/high/medium def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.5-pro:batch` | GPT-5.5 Pro (batch) | 2026-04-24 | 1050000 | 128000 | 15 | 90 | - | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | mand xhigh/high/medium def=medium | batches | True | - |
| `openai/gpt-5.5` | GPT-5.5 | 2026-04-24 | 1050000 | 128000 | 5 | 30 | 0.5 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.5:batch` | GPT-5.5 (batch) | 2026-04-24 | 1050000 | 128000 | 2.5 | 15 | 0.25 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-5.4-image-2` | GPT-5.4 Image 2 | 2026-04-21 | 272000 | 128000 | 8 | 15 | 2 | - | 0.01 | - | image,text,file | image,text | n | Y | Y | n | opt xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses,images | True | - |
| `openai/gpt-5.4-nano` | GPT-5.4 Nano | 2026-03-17 | 400000 | 128000 | 0.2 | 1.25 | 0.02 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.4-nano:batch` | GPT-5.4 Nano (batch) | 2026-03-17 | 400000 | 128000 | 0.1 | 0.625 | 0.01 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-5.4-mini` | GPT-5.4 Mini | 2026-03-17 | 400000 | 128000 | 0.75 | 4.5 | 0.075 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.4-mini:batch` | GPT-5.4 Mini (batch) | 2026-03-17 | 400000 | 128000 | 0.375 | 2.25 | 0.0375 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-5.4-pro` | GPT-5.4 Pro | 2026-03-05 | 1050000 | 128000 | 30 | 180 | - | - | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand xhigh/high/medium def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.4-pro:batch` | GPT-5.4 Pro (batch) | 2026-03-05 | 1050000 | 128000 | 15 | 90 | - | - | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand xhigh/high/medium def=medium | batches | True | - |
| `openai/gpt-5.4` | GPT-5.4 | 2026-03-05 | 1050000 | 128000 | 2.5 | 15 | 0.25 | - | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.4:batch` | GPT-5.4 (batch) | 2026-03-05 | 1050000 | 128000 | 1.25 | 7.5 | 0.125 | - | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-5.3-codex` | GPT-5.3-Codex | 2026-02-24 | 400000 | 128000 | 1.75 | 14 | 0.175 | - | 0.01 | - | text,image,file | text | Y | Y | Y | n | opt xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-audio` | GPT Audio | 2026-01-19 | 128000 | 16384 | 2.5 | 10 | - | - | - | - | text,audio | text,audio | Y | Y | Y | n | - | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-audio-mini` | GPT Audio Mini | 2026-01-19 | 128000 | 16384 | 0.6 | 2.4 | - | - | - | - | text,audio | text,audio | Y | Y | Y | n | - | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.2-codex` | GPT-5.2-Codex | 2026-01-14 | 400000 | 128000 | 1.75 | 14 | 0.175 | - | 0.01 | - | text,image | text | Y | Y | Y | n | mand xhigh/high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-5.2-chat` | GPT-5.2 Chat | 2025-12-10 | 128000 | 32000 | 1.75 | 14 | 0.175 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | - | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-5.2-pro` | GPT-5.2 Pro | 2025-12-10 | 400000 | 128000 | 21 | 168 | - | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | mand xhigh/high/medium def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.2-pro:batch` | GPT-5.2 Pro (batch) | 2025-12-10 | 400000 | 128000 | 10.5 | 84 | - | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | mand xhigh/high/medium def=medium | batches | True | - |
| `openai/gpt-5.2` | GPT-5.2 | 2025-12-10 | 400000 | 128000 | 1.75 | 14 | 0.175 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt xhigh/high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.2:batch` | GPT-5.2 (batch) | 2025-12-10 | 400000 | 128000 | 0.875 | 7 | 0.0875 | - | 0.01 | - | file,image,text | text | Y | Y | Y | n | opt xhigh/high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-5.1-codex-max` | GPT-5.1-Codex-Max | 2025-12-04 | 400000 | 128000 | 1.25 | 10 | 0.125 | - | 0.01 | - | text,image | text | Y | Y | Y | n | mand xhigh/high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-5.1` | GPT-5.1 | 2025-11-13 | 400000 | 128000 | 1.25 | 10 | 0.125 | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | opt high/medium/low/none def=medium | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-5.1:batch` | GPT-5.1 (batch) | 2025-11-13 | 400000 | 128000 | 0.625 | 5 | 0.0625 | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | opt high/medium/low/none def=medium | batches | True | - |
| `openai/gpt-5.1-codex` | GPT-5.1-Codex | 2025-11-13 | 400000 | 128000 | 1.25 | 10 | 0.13 | - | 0.01 | - | text,image | text | Y | Y | Y | n | mand high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-5.1-codex-mini` | GPT-5.1-Codex-Mini | 2025-11-13 | 400000 | 128000 | 0.25 | 2 | 0.03 | - | 0.01 | - | image,text | text | Y | Y | Y | n | mand high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-oss-safeguard-20b` | gpt-oss-safeguard-20b | 2025-10-29 | 131072 | 65536 | 0.075 | 0.3 | 0.0375 | - | - | - | text | text | Y | Y | Y | n | mand  | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-5-image-mini` | GPT-5 Image Mini | 2025-10-16 | 400000 | 128000 | 2.5 | 2 | 0.25 | - | 0.01 | - | file,image,text | image,text | n | Y | Y | n | mand  | chat/completions,completions,messages,responses,images | True | 2026-12-01 |
| `openai/gpt-5-image` | GPT-5 Image | 2025-10-14 | 400000 | 128000 | 10 | 10 | 1.25 | - | 0.01 | - | image,text,file | image,text | n | Y | Y | n | mand  | chat/completions,completions,messages,responses,images | True | 2026-12-11 |
| `openai/gpt-5-pro` | GPT-5 Pro | 2025-10-06 | 400000 | 128000 | 15 | 120 | - | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | mand high def=high | chat/completions,completions,messages,responses | True | 2026-12-11 |
| `openai/gpt-5-pro:batch` | GPT-5 Pro (batch) | 2025-10-06 | 400000 | 128000 | 7.5 | 60 | - | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | mand high def=high | batches | True | 2026-12-11 |
| `openai/gpt-5` | GPT-5 | 2025-08-07 | 400000 | 128000 | 1.25 | 10 | 0.125 | - | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand high/medium/low/minimal def=medium | chat/completions,completions,messages,responses | True | 2026-12-11 |
| `openai/gpt-5:batch` | GPT-5 (batch) | 2025-08-07 | 400000 | 128000 | 0.625 | 5 | 0.0625 | - | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand high/medium/low/minimal def=medium | batches | True | 2026-12-11 |
| `openai/gpt-5-mini` | GPT-5 Mini | 2025-08-07 | 400000 | 128000 | 0.25 | 2 | 0.025 | - | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand high/medium/low/minimal def=medium | chat/completions,completions,messages,responses | True | 2026-12-11 |
| `openai/gpt-5-mini:batch` | GPT-5 Mini (batch) | 2025-08-07 | 400000 | 128000 | 0.125 | 1 | 0.0125 | - | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand high/medium/low/minimal def=medium | batches | True | 2026-12-11 |
| `openai/gpt-5-nano` | GPT-5 Nano | 2025-08-07 | 400000 | 128000 | 0.05 | 0.4 | 0.005 | - | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand high/medium/low/minimal def=medium | chat/completions,completions,messages,responses | True | 2026-12-11 |
| `openai/gpt-5-nano:batch` | GPT-5 Nano (batch) | 2025-08-07 | 400000 | 128000 | 0.025 | 0.2 | 0.0025 | - | 0.01 | - | text,image,file | text | Y | Y | Y | n | mand high/medium/low/minimal def=medium | batches | True | 2026-12-11 |
| `openai/gpt-oss-120b` | gpt-oss-120b | 2025-08-05 | 131072 | 65536 | 0.15 | 0.6 | 0.075 | - | - | - | text | text | Y | Y | Y | n | mand high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-oss-120b:batch` | gpt-oss-120b (batch) | 2025-08-05 | 131072 | 117964 | 0.0296 | 0.136 | - | - | - | - | text | text | Y | Y | Y | n | mand high/medium/low def=medium | batches | False | - |
| `openai/gpt-oss-20b` | gpt-oss-20b | 2025-08-05 | 131072 | 117964 | 0.03 | 0.13 | 0.03 | - | - | - | text | text | Y | Y | Y | n | mand high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-oss-20b:batch` | gpt-oss-20b (batch) | 2025-08-05 | 131072 | 117964 | 0.024 | 0.112 | - | - | - | - | text | text | Y | Y | Y | n | mand high/medium/low def=medium | batches | False | - |
| `openai/o3-pro` | o3 Pro | 2025-06-10 | 200000 | 100000 | 20 | 80 | - | - | 0.01 | - | text,file,image | text | Y | Y | Y | n | mand  | chat/completions,completions,messages,responses | True | 2026-12-11 |
| `openai/o3` | o3 | 2025-04-16 | 200000 | 100000 | 2 | 8 | 0.5 | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | mand  | chat/completions,completions,messages,responses | True | 2026-12-11 |
| `openai/o3:batch` | o3 (batch) | 2025-04-16 | 200000 | 100000 | 1 | 4 | 0.25 | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | mand  | batches | True | 2026-12-11 |
| `openai/o4-mini:batch` | o4 Mini (batch) | 2025-04-16 | 200000 | 100000 | 0.55 | 2.2 | 0.1375 | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | mand  | batches | True | - |
| `openai/gpt-4.1` | GPT-4.1 | 2025-04-14 | 1047576 | 32768 | 2 | 8 | 0.5 | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | - | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-4.1:batch` | GPT-4.1 (batch) | 2025-04-14 | 1047576 | 32768 | 1 | 4 | 0.25 | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | - | batches | True | - |
| `openai/gpt-4.1-mini` | GPT-4.1 Mini | 2025-04-14 | 1047576 | 32768 | 0.4 | 1.6 | 0.1 | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | - | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-4.1-mini:batch` | GPT-4.1 Mini (batch) | 2025-04-14 | 1047576 | 32768 | 0.2 | 0.8 | 0.05 | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | - | batches | True | - |
| `openai/gpt-4.1-nano` | GPT-4.1 Nano | 2025-04-14 | 1047576 | 942818 | 0.1 | 0.4 | 0.03 | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | - | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-4.1-nano:batch` | GPT-4.1 Nano (batch) | 2025-04-14 | 1047576 | 32768 | 0.05 | 0.2 | 0.0125 | - | 0.01 | - | image,text,file | text | Y | Y | Y | n | - | batches | True | - |
| `openai/o3-mini:batch` | o3 Mini (batch) | 2025-01-31 | 200000 | 100000 | 0.55 | 2.2 | 0.275 | - | 0.01 | - | text,file | text | Y | Y | Y | n | mand  | batches | True | - |
| `openai/gpt-4o-2024-11-20` | GPT-4o (2024-11-20) | 2024-11-20 | 128000 | 16384 | 2.5 | 10 | 1.25 | - | - | - | text,image,file | text | Y | Y | Y | Y | - | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-4o-2024-08-06` | GPT-4o (2024-08-06) | 2024-08-06 | 128000 | 16384 | 2.5 | 10 | 1.25 | - | - | - | text,image,file | text | Y | Y | Y | Y | - | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-4o-mini` | GPT-4o-mini | 2024-07-18 | 128000 | 16384 | 0.15 | 0.6 | 0.075 | - | - | - | text,image,file | text | Y | Y | Y | Y | - | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-4o-mini-2024-07-18` | GPT-4o-mini (2024-07-18) | 2024-07-18 | 128000 | 16384 | 0.15 | 0.6 | 0.075 | - | - | - | text,image,file | text | Y | Y | Y | Y | - | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-4o-mini:batch` | GPT-4o-mini (batch) | 2024-07-18 | 128000 | 16384 | 0.075 | 0.3 | 0.0375 | - | 0.01 | - | text,image,file | text | Y | Y | Y | Y | - | batches | True | - |
| `openai/gpt-4o` | GPT-4o | 2024-05-13 | 128000 | 16384 | 2.5 | 10 | 1.25 | - | - | - | text,image,file | text | Y | Y | Y | Y | - | chat/completions,completions,messages,responses | True | - |
| `openai/gpt-4o-2024-05-13` | GPT-4o (2024-05-13) | 2024-05-13 | 128000 | 4096 | 5 | 15 | - | - | - | - | text,image,file | text | Y | Y | Y | Y | - | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-4o:batch` | GPT-4o (batch) | 2024-05-13 | 128000 | 16384 | 1.25 | 5 | 0.625 | - | 0.01 | - | text,image,file | text | Y | Y | Y | Y | - | batches | True | - |
| `openai/gpt-4-turbo:batch` | GPT-4 Turbo (batch) | 2024-04-09 | 128000 | 4096 | 5 | 15 | - | - | 0.01 | - | text,image | text | Y | Y | Y | n | - | batches | True | - |
| `openai/gpt-3.5-turbo-0613` | GPT-3.5 Turbo (older v0613) | 2024-01-25 | 4095 | 3685 | 1 | 2 | - | - | - | - | text | text | Y | Y | Y | n | - | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-3.5-turbo-16k` | GPT-3.5 Turbo 16k | 2023-08-28 | 16385 | 4096 | 3 | 4 | - | - | - | - | text | text | Y | Y | Y | n | - | chat/completions,completions,messages,responses | False | - |
| `openai/gpt-4` | GPT-4 | 2023-05-28 | 8191 | 4096 | 30 | 60 | - | - | - | - | text | text | Y | n | Y | n | - | chat/completions,completions,messages,responses | False | - |
| `google/gemini-4-hydrogen` | Gemini 4 Hydrogen | 2026-11-12 | 1048576 | 943718 | 1.5 | 7.5 | 0.075 | 0.083333 | 0.014 | 0.0000015 | audio,file,image,text,video | text | Y | Y | Y | n | mand xhigh/high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `google/gemini-4-hydrogen:batch` | Gemini 4 Hydrogen (batch) | 2026-11-12 | 1048576 | 943718 | 0.75 | 3.75 | 0.0375 | 0.083333 | 0.014 | 0.00000075 | audio,file,image,text,video | text | Y | Y | Y | n | mand xhigh/high/medium/low def=medium | batches | False | - |
| `google/gemini-4-carbon` | Gemini 4 Carbon | 2026-11-10 | 1048576 | 943718 | 2 | 10 | 0.1 | 0.1875 | 0.014 | 0.000002 | audio,file,image,text,video | text | Y | Y | Y | n | mand high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `google/gemini-4-carbon:batch` | Gemini 4 Carbon (batch) | 2026-11-10 | 1048576 | 943718 | 1 | 5 | 0.05 | 0.1875 | 0.014 | 0.000001 | audio,file,image,text,video | text | Y | Y | Y | n | mand high/medium/low def=medium | batches | False | - |
| `google/gemini-omni-1.2-flash` | Gemini Omni 1.2 Flash | 2026-11-05 | 131072 | 65536 | 1.5 | 9 | - | - | 0.014 | - | text,image,video | text,video | n | n | n | n | mand high/low def=low | chat/completions,completions,messages,responses,videos | False | - |
| `google/gemini-omni-1.1-flash` | Gemini Omni 1.1 Flash | 2026-11-04 | 131072 | 65536 | 1.5 | 9 | - | - | 0.014 | - | text,image,video | text,video | n | n | n | n | mand high/low def=low | chat/completions,completions,messages,responses,videos | False | - |
| `google/gemini-4-argon` | Gemini 4 Argon | 2026-10-13 | 1048576 | 943718 | 2 | 10 | 0.1 | 0.1875 | 0.014 | 0.000002 | audio,file,image,text,video | text | Y | Y | Y | n | mand high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `google/gemini-4-argon:batch` | Gemini 4 Argon (batch) | 2026-10-13 | 1048576 | 943718 | 1 | 5 | 0.05 | 0.1875 | 0.014 | 0.000001 | audio,file,image,text,video | text | Y | Y | Y | n | mand high/medium/low def=medium | batches | False | - |
| `google/gemini-nano-banana-2.1` | Nano Banana 2.1 | 2026-10-06 | 65536 | 58982 | 1.5 | 7.5 | - | - | 0.014 | - | image,text | image,text | Y | Y | Y | n | opt high/minimal/none def=minimal | chat/completions,completions,messages,responses,images | False | - |
| `google/gemini-3.8-flash` | Gemini 3.8 Flash | 2026-09-02 | 1048576 | 65536 | 0.825 | 4.125 | 0.0825 | 0.041667 | 0.014 | 0.000000825 | text,image,video,file,audio | text | Y | Y | Y | n | mand high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `google/gemini-3.8-flash:batch` | Gemini 3.8 Flash (batch) | 2026-09-02 | 1048576 | 65536 | 0.375 | 1.875 | 0.0375 | 0.041667 | 0.014 | 0.000000375 | text,image,video,file,audio | text | Y | Y | Y | n | mand high/medium/low def=medium | batches | False | - |
| `google/gemini-3.7-flash` | Gemini 3.7 Flash | 2026-08-13 | 1048576 | 65536 | 0.75 | 3.75 | 0.075 | 0.041667 | 0.014 | 0.00000075 | text,image,video,file,audio | text | Y | Y | Y | n | mand high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `google/gemini-3.7-flash:batch` | Gemini 3.7 Flash (batch) | 2026-08-13 | 1048576 | 65536 | 0.375 | 1.875 | 0.0375 | 0.041667 | 0.014 | 0.000000375 | text,image,video,file,audio | text | Y | Y | Y | n | mand high/medium/low def=medium | batches | False | - |
| `google/gemini-3.6-flash` | Gemini 3.6 Flash | 2026-07-21 | 1048576 | 65536 | 0.75 | 3.75 | 0.075 | 0.041667 | 0.014 | 0.00000075 | text,image,video,file,audio | text | Y | Y | Y | n | mand high/medium/low/minimal def=medium | chat/completions,completions,messages,responses | False | - |
| `google/gemini-3.6-flash:batch` | Gemini 3.6 Flash (batch) | 2026-07-21 | 1048576 | 65536 | 0.375 | 1.875 | 0.0375 | 0.041667 | 0.014 | 0.000000375 | text,image,video,file,audio | text | Y | Y | Y | n | mand high/medium/low/minimal def=medium | batches | False | - |
| `google/gemini-3.5-flash-lite` | Gemini 3.5 Flash Lite | 2026-07-21 | 1048576 | 65536 | 0.3 | 2.5 | 0.03 | 0.083333 | 0.014 | 0.0000003 | text,image,video,file,audio | text | Y | Y | Y | n | mand high/medium/low/minimal def=minimal | chat/completions,completions,messages,responses | False | - |
| `google/gemini-3.5-flash-lite:batch` | Gemini 3.5 Flash Lite (batch) | 2026-07-21 | 1048576 | 65536 | 0.15 | 1.25 | 0.015 | - | 0.014 | 0.00000015 | text,image,video,file,audio | text | Y | Y | Y | n | mand high/medium/low/minimal def=minimal | batches | False | - |
| `google/gemini-3.1-flash-lite-image` | Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image) | 2026-06-30 | 65536 | 58982 | 0.25 | 1.5 | - | - | 0.014 | - | image,text | image,text | n | n | Y | n | opt high/minimal/none def=minimal | chat/completions,completions,messages,responses,images | False | - |
| `google/gemini-3.1-flash-image` | Nano Banana 2 (Gemini 3.1 Flash Image) | 2026-06-18 | 131072 | 32768 | 0.5 | 3 | - | - | 0.014 | - | image,text | image,text | n | Y | Y | n | opt high/minimal/none def=minimal | chat/completions,completions,messages,responses,images | False | - |
| `google/gemini-3-pro-image` | Nano Banana Pro (Gemini 3 Pro Image) | 2026-06-18 | 131072 | 32768 | 2 | 12 | 0.2 | 0.375 | 0.014 | 0.000002 | image,text | image,text | Y | Y | Y | n | mand  | chat/completions,completions,messages,responses,images | False | - |
| `google/gemini-3.5-flash` | Gemini 3.5 Flash | 2026-05-19 | 1048576 | 65536 | 1.5 | 9 | 0.15 | 0.083333 | 0.014 | 0.0000015 | text,image,video,file,audio | text | Y | Y | Y | n | mand high/medium/low/minimal def=medium | chat/completions,completions,messages,responses | False | - |
| `google/gemini-3.5-flash:batch` | Gemini 3.5 Flash (batch) | 2026-05-19 | 1048576 | 65536 | 0.75 | 4.5 | 0.075 | - | 0.014 | 0.00000075 | text,image,video,file,audio | text | Y | Y | Y | n | mand high/medium/low/minimal def=medium | batches | False | - |
| `google/gemini-3.1-flash-lite` | Gemini 3.1 Flash Lite | 2026-05-07 | 1048576 | 65536 | 0.25 | 1.5 | 0.025 | 0.083333 | 0.014 | 0.00000025 | text,image,video,file,audio | text | Y | Y | Y | n | opt high/medium/low/minimal/none def=minimal | chat/completions,completions,messages,responses | False | - |
| `google/gemini-3.1-flash-lite:batch` | Gemini 3.1 Flash Lite (batch) | 2026-05-07 | 1048576 | 65536 | 0.125 | 0.75 | 0.0125 | - | 0.014 | 0.000000125 | text,image,video,file,audio | text | Y | Y | Y | n | opt high/medium/low/minimal/none def=minimal | batches | False | - |
| `google/gemma-4-26b-a4b-it` | Gemma 4 26B A4B  | 2026-04-03 | 262144 | 235929 | 0.0765 | 0.255 | 0.0425 | - | - | - | image,text,video | text | Y | Y | Y | n | opt  | chat/completions,completions,messages,responses | False | - |
| `google/gemma-4-26b-a4b-it:free` | Gemma 4 26B A4B  (free) | 2026-04-03 | 262144 | 32768 | 0 | 0 | - | - | - | - | image,text,video | text | Y | n | Y | n | opt  | chat/completions,completions,messages,responses | False | - |
| `google/gemma-4-31b-it` | Gemma 4 31B | 2026-04-02 | 262144 | 16384 | 0.2 | 0.4 | - | - | - | - | image,text,video | text | Y | Y | Y | n | opt  | chat/completions,completions,messages,responses | False | - |
| `google/gemma-4-31b-it:free` | Gemma 4 31B (free) | 2026-04-02 | 262144 | 32768 | 0 | 0 | - | - | - | - | image,text,video | text | Y | n | Y | n | opt  | chat/completions,completions,messages,responses | False | - |
| `google/lyria-3-pro-preview` | Lyria 3 Pro Preview | 2026-03-30 | 1048576 | 65536 | 0 | 0 | - | - | - | - | text,image | text,audio | n | n | Y | n | - | chat/completions,completions,messages,responses | False | - |
| `google/lyria-3-clip-preview` | Lyria 3 Clip Preview | 2026-03-30 | 1048576 | 65536 | 0 | 0 | - | - | - | - | text,image | text,audio | n | n | Y | n | - | chat/completions,completions,messages,responses | False | - |
| `google/gemini-3.1-flash-lite-preview` | Gemini 3.1 Flash Lite Preview | 2026-03-03 | 1048576 | 65536 | 0.25 | 1.5 | 0.025 | 0.083333 | 0.014 | 0.00000025 | text,image,video,file,audio | text | Y | Y | Y | n | opt high/medium/low/minimal/none def=minimal | chat/completions,completions,messages,responses | False | - |
| `google/gemini-3.1-flash-image-preview` | Nano Banana 2 (Gemini 3.1 Flash Image Preview) | 2026-02-26 | 65536 | 58982 | 0.5 | 3 | - | - | 0.014 | - | image,text | image,text | n | Y | Y | n | opt high/minimal/none def=minimal | chat/completions,completions,messages,responses,images | False | - |
| `google/gemini-3.1-pro-preview-customtools` | Gemini 3.1 Pro Preview Custom Tools | 2026-02-25 | 1048576 | 65536 | 2 | 12 | 0.2 | 0.375 | 0.014 | 0.000002 | text,audio,image,video,file | text | Y | Y | Y | n | mand high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `google/gemini-3.1-pro-preview` | Gemini 3.1 Pro Preview | 2026-02-19 | 1048576 | 65536 | 2 | 12 | 0.2 | 0.375 | 0.014 | 0.000002 | audio,file,image,text,video | text | Y | Y | Y | n | mand high/medium/low def=medium | chat/completions,completions,messages,responses | False | - |
| `google/gemini-3.1-pro-preview:batch` | Gemini 3.1 Pro Preview (batch) | 2026-02-19 | 1048576 | 65536 | 1 | 6 | - | - | 0.014 | 0.000001 | audio,file,image,text,video | text | Y | Y | Y | n | mand high/medium/low def=medium | batches | False | - |
| `google/gemini-3-flash-preview` | Gemini 3 Flash Preview | 2025-12-17 | 1048576 | 65536 | 0.5 | 3 | 0.05 | 0.083333 | 0.014 | 0.0000005 | text,image,file,audio,video | text | Y | Y | Y | n | opt high/medium/low/minimal/none def=medium | chat/completions,completions,messages,responses | False | - |
| `google/gemini-3-flash-preview:batch` | Gemini 3 Flash Preview (batch) | 2025-12-17 | 1048576 | 65536 | 0.25 | 1.5 | - | - | 0.014 | 0.00000025 | text,image,file,audio,video | text | Y | Y | Y | n | opt high/medium/low/minimal/none def=medium | batches | False | - |
| `google/gemini-3-pro-image-preview` | Nano Banana Pro (Gemini 3 Pro Image Preview) | 2025-11-20 | 65536 | 32768 | 2 | 12 | 0.2 | 0.375 | 0.014 | 0.000002 | image,text | image,text | n | Y | Y | n | mand  | chat/completions,completions,messages,responses,images | False | - |
| `google/gemini-2.5-flash-image` | Nano Banana (Gemini 2.5 Flash Image) | 2025-10-07 | 32768 | 8192 | 0.3 | 2.5 | 0.03 | 0.083333 | 0.014 | 0.0000003 | image,text | image,text | n | Y | Y | n | - | chat/completions,completions,messages,responses,images | False | - |
| `google/gemini-2.5-flash-lite` | Gemini 2.5 Flash Lite | 2025-07-22 | 1048576 | 65535 | 0.1 | 0.4 | 0.01 | 0.083333 | 0.014 | 0.0000001 | text,image,file,audio,video | text | Y | Y | Y | n | opt  | chat/completions,completions,messages,responses | False | - |
| `google/gemini-2.5-flash` | Gemini 2.5 Flash | 2025-06-17 | 1048576 | 65535 | 0.3 | 2.5 | 0.03 | 0.083333 | 0.014 | 0.0000003 | file,image,text,audio,video | text | Y | Y | Y | n | opt  | chat/completions,completions,messages,responses | False | - |
| `google/gemini-2.5-pro` | Gemini 2.5 Pro | 2025-06-17 | 1048576 | 65536 | 1.25 | 10 | 0.125 | 0.375 | 0.014 | 0.00000125 | text,image,file,audio,video | text | Y | Y | Y | n | mand  | chat/completions,completions,messages,responses | False | - |
| `google/gemini-2.5-pro-preview` | Gemini 2.5 Pro Preview 06-05 | 2025-06-05 | 1048576 | 65536 | 1.25 | 10 | 0.125 | 0.375 | 0.014 | 0.00000125 | file,image,text,audio | text | Y | Y | Y | n | mand  | chat/completions,completions,messages,responses | False | - |
| `google/gemma-3-4b-it` | Gemma 3 4B | 2025-03-13 | 131072 | 16384 | 0.05 | 0.1 | - | - | - | - | text,image | text | n | Y | Y | n | - | chat/completions,completions,messages,responses | False | - |
| `google/gemma-3-12b-it` | Gemma 3 12B | 2025-03-13 | 131072 | 16384 | 0.05 | 0.15 | - | - | - | - | text,image | text | Y | Y | Y | n | - | chat/completions,completions,messages,responses | False | - |
| `google/gemma-3-27b-it` | Gemma 3 27B | 2025-03-12 | 131072 | 117964 | 0.08 | 0.35 | 0.04 | - | - | - | text,image | text | Y | Y | Y | n | - | chat/completions,completions,messages,responses | False | - |
| `google/gemma-2-27b-it` | Gemma 2 27B | 2024-07-13 | 8192 | 2048 | 0.65 | 0.65 | - | - | - | - | text | text | n | Y | Y | n | - | chat/completions,completions,messages,responses | False | - |

Extra pricing keys not in the table: `input_cache_write_1h` (Claude), `image_output` (image models, below), `internal_reasoning`, `audio`, `input_audio_cache`, `overrides` (long-context tiers; 49 entries have them). `supported_parameters` never contains a search-specific key except `web_search_options` (gpt-4o family only); native search capability is exposed via `pricing.web_search` and endpoint `native_tools`.

`temperature` is NOT in `supported_parameters` for any Claude 4.7+/5.x/Fable model nor for any GPT-5.x/6.x text model (it is listed only by Gemini/Gemma, Claude ≤ 4.6, gpt-4.1/4o and older, gpt-oss, gpt-audio, and the two expiring `gpt-5-image*` models) — it will be silently ignored there (or the provider excluded with `require_parameters:true`).

Expiring (`expiration_date`): `openai/gpt-5-image-mini` 2026-12-01; `openai/gpt-5-image`, `openai/gpt-5-pro`, `openai/gpt-5`, `openai/gpt-5-mini`, `openai/gpt-5-nano` (+ their `:batch`), `openai/o3-pro`, `openai/o3` (+batch) 2026-12-11.

### 11.2 Models (3 vendors) whose `output_modalities` includes "image" (models.json)

| id | name | created | ctx | in $/M | out $/M | `image_output` $/M tokens | tools | structured_outputs | endpoints | expires |
| - | - | - | - | - | - | - | - | - | - | - |
| `google/gemini-nano-banana-2.1` | Nano Banana 2.1 | 2026-10-06 | 65536 | 1.5 | 7.5 | 30 | Y | Y | chat, completions, messages, responses, images | - |
| `google/gemini-3.1-flash-lite-image` | Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image) | 2026-06-30 | 65536 | 0.25 | 1.5 | 30 | n | n | same | - |
| `google/gemini-3.1-flash-image` | Nano Banana 2 (Gemini 3.1 Flash Image) | 2026-06-18 | 131072 | 0.5 | 3 | 60 | n | Y | same | - |
| `google/gemini-3-pro-image` | Nano Banana Pro (Gemini 3 Pro Image) | 2026-06-18 | 131072 | 2 | 12 | 120 | Y | Y | same | - |
| `openai/gpt-5.4-image-2` | GPT-5.4 Image 2 | 2026-04-21 | 272000 | 8 | 15 | 30 | n | Y | same | - |
| `google/gemini-3.1-flash-image-preview` | Nano Banana 2 (… Preview) | 2026-02-26 | 65536 | 0.5 | 3 | 60 | n | Y | same | - |
| `google/gemini-3-pro-image-preview` | Nano Banana Pro (… Preview) | 2025-11-20 | 65536 | 2 | 12 | 120 | n | Y | same | - |
| `openai/gpt-5-image-mini` | GPT-5 Image Mini | 2025-10-16 | 400000 | 2.5 | 2 | 8 | n | Y | same | 2026-12-01 |
| `openai/gpt-5-image` | GPT-5 Image | 2025-10-14 | 400000 | 10 | 10 | 40 | n | Y | same | 2026-12-11 |
| `google/gemini-2.5-flash-image` | Nano Banana (Gemini 2.5 Flash Image) | 2025-10-07 | 32768 | 0.3 | 2.5 | 30 | n | Y | same | - |

No Anthropic model outputs images. (`google/gemini-omni-*` output `text,video`; `google/lyria-*` and `openai/gpt-audio*` output audio.)

### 11.3 Dedicated image-models endpoint (`image-models.json`), openai/ + google/ entries

`supported_parameters` = union over endpoints; no per-image price here — pricing is on the per-endpoint records (next table) and is **per token**, not per image, for all of these.

| id | created | aspect_ratio values | resolution | quality | n | input_references (max) | output_format | background | streaming |
| - | - | - | - | - | - | - | - | - | - |
| `openai/gpt-image-2.6-sunburst` | 2026-11-04 | 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9, auto | – | auto, low, medium, high, xhigh, max | 1–10 | 16 | png, jpeg, webp, gif | auto, transparent, opaque | yes |
| `openai/gpt-image-2.6-flare` | 2026-11-04 | same | – | same | 1–10 | 16 | png, jpeg, webp, gif | auto, transparent, opaque | yes |
| `google/gemini-nano-banana-2.1` | 2026-10-06 | 1:1, 1:4, 1:8, 2:3, 3:2, 3:4, 4:1, 4:3, 4:5, 5:4, 8:1, 9:16, 16:9, 21:9 | 1K, 2K, 4K | – | 1 | 14 | – | – | no |
| `openai/gpt-image-2.5-sunburst` | 2026-09-09 | 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9, auto | – | auto…max | 1–10 | 16 | png, jpeg, webp | auto, transparent, opaque | yes |
| `openai/gpt-image-2.5-flare` | 2026-09-09 | same | – | auto…max | 1–10 | 16 | png, jpeg, webp | auto, transparent, opaque | yes |
| `google/gemini-3.1-flash-lite-image` | 2026-06-30 | (14 ratios as nano-banana-2.1) | 1K | – | 1 | 14 | – | – | no |
| `openai/gpt-image-2` | 2026-06-24 | 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9, auto | – | auto, low, medium, high | 1–10 | 16 | png, jpeg, webp | auto, opaque | yes |
| `openai/gpt-image-1-mini` | 2026-06-24 | 1:1, 3:2, 2:3, auto | – | auto, low, medium, high | 1–10 | 16 | png, jpeg, webp | auto, transparent, opaque | yes |
| `openai/gpt-image-1` | 2026-06-24 | 1:1, 3:2, 2:3, auto | – | auto, low, medium, high | 1–10 | 16 | – | auto, transparent, opaque | yes |
| `google/gemini-3.1-flash-image` | 2026-06-18 | (14 ratios) | 512, 1K, 2K, 4K | – | 1 | 14 | – | – | no |
| `google/gemini-3-pro-image` | 2026-06-18 | 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 | 1K, 2K, 4K | – | 1 | 14 | – | – | no |
| `openai/gpt-5.4-image-2` | 2026-04-21 | 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9, auto | – | auto, low, medium, high | 1–10 | 16 | png, jpeg, webp | auto, opaque | yes |
| `google/gemini-3.1-flash-image-preview` | 2026-02-26 | (14 ratios) | 512, 1K, 2K, 4K | – | 1 | 14 | – | – | no |
| `google/gemini-3-pro-image-preview` | 2025-11-20 | (10 ratios as 3-pro-image) | 1K, 2K, 4K | – | 1 | 14 | – | – | no |
| `openai/gpt-5-image-mini` | 2025-10-16 | 1:1, 3:2, 2:3, auto | – | auto, low, medium, high | 1–10 | 16 | png, jpeg, webp | auto, transparent, opaque | yes |
| `openai/gpt-5-image` | 2025-10-14 | 1:1, 3:2, 2:3, auto | – | auto, low, medium, high | 1–10 | 16 | – | auto, transparent, opaque | yes |
| `google/gemini-2.5-flash-image` | 2025-10-07 | 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 | – (no resolution param) | – | 1 | 3 | – | – | no |

**Fit to the app's needs (1:1, 4:5, 9:16, 16:9 at 1K/2K, with reference images):** every Google image model supports all four ratios; 1K+2K on `gemini-nano-banana-2.1`, `gemini-3-pro-image` (Vertex endpoint: 1K/2K only; AI Studio: 1K/2K/4K), `gemini-3.1-flash-image`; `gemini-3.1-flash-lite-image` is 1K only; `gemini-2.5-flash-image` has no resolution parameter and max 3 references. **No OpenAI image model lists `4:5`** and none has a `resolution` parameter.

Per-endpoint records fetched (`image-endpoints/*.json`): pricing lines `[billable, unit, cost_usd]`:

| model | provider_tag | pricing |
| - | - | - |
| google/gemini-nano-banana-2.1 | google-vertex/global; google-ai-studio | output_image token $0.00003 (= $30/M tokens) |
| google/gemini-3-pro-image | google-ai-studio/global (1K/2K/4K); google-vertex/global (1K/2K) | input_image token $0.000002; output_image token $0.00012 |
| google/gemini-3.1-flash-image | google-ai-studio; google-vertex/global; google-vertex/us | output_image token $0.00006 (vertex/us $0.000066) |
| google/gemini-3.1-flash-lite-image | google-vertex/global; google-ai-studio | output_image token $0.00003 |
| google/gemini-2.5-flash-image | google-vertex/global | input_image token $0.0000003; output_image token $0.00003 |
| openai/gpt-image-2.6-sunburst / -flare | openai | input_image token $0.000008; input_text token $0.000005; output_image token $0.00003 |
| openai/gpt-image-2 | openai | input_image $0.000008; input_text $0.000005; output_image $0.00003 (per token) |
| openai/gpt-5.4-image-2 | openai | input_image token $0.000008; output_image token $0.00003 |

[src: image-endpoints/google_gemini-nano-banana-2.1.json «"billable":"output_image","unit":"token","cost_usd":0.00003»]
Dollar cost per image is therefore not derivable from these files (tokens per image per resolution: NOT STATED); read `usage.cost` per request.

### 11.4 Flagship / mid / cheapest per family — judged ONLY from names, prices, created dates and descriptions in models.json

**Anthropic** (tiers visible: Fable > Opus > Sonnet > Haiku)
- Flagship: `anthropic/claude-fable-5.2` — newest Anthropic entry (created 2026-11-09), most expensive current-generation price ($8 / $40), description "Anthropic's most capable model for the most demanding technical work". Ambiguity: `anthropic/claude-opus-5.5` (2026-09-22, $4 / $20) is described as "Anthropic's flagship model for demanding reasoning, coding, and long-horizon agentic work" — i.e. Fable is a tier above Opus. Fable 5.2 has NO ZDR-listed endpoint today; Opus 5.5 has (Bedrock/Vertex).
- Mid-tier: `anthropic/claude-sonnet-5.5` (2026-09-28, $2 / $10) — "Sonnet-class model for well-scoped everyday work".
- Cheapest/fastest: `anthropic/claude-haiku-5.5` (2026-10-07, $0.10 / $0.50; override at ≥100k prompt tokens: $0.50 / $2.50) — "small, fast model for high-volume, cost-sensitive work". Reasoning optional (`mandatory: false`, effort `none` allowed); fable/opus/sonnet 5.5 have `reasoning.mandatory: true`, default effort `high`.
- All four: context 1,000,000, max output 128,000, `is_moderated: true`, no `temperature`, forced tool_choice not supported (§2).

**OpenAI** (tier names in the file: Astra > Sol > Terra > Luna; `-pro` = same model with `reasoning.mode: pro`, same list price, "spends far more")
- Flagship: `openai/gpt-6-astra` (2026-09-04, $10 / $50) — "OpenAI's flagship model for demanding end-to-end work". Ambiguity: newer series entries exist (`gpt-6.1-sol` 2026-09-29, `gpt-6.1-terra` 2026-10-26) but there is no 6.1 Astra; `gpt-6.1-sol` is described as "positioned below the flagship GPT-6 Astra".
- Mid-tier: `openai/gpt-6.1-sol` (2026-09-29, $2 / $10) — upgrade to GPT-6 Sol; or `openai/gpt-6.1-terra` (2026-10-26, $1 / $5), which the file literally calls "the mid-tier model in OpenAI's GPT-6.1 series, priced below GPT-6.1 Sol". Pick depends on whether "mid" means Sol (≈ Sonnet price) or Terra.
- Cheapest/fastest: `openai/gpt-6-luna` (2026-09-22, $0.10 / $0.50) — "fast, cost-efficient model in OpenAI's GPT-6 series". (Nominally cheaper `openai/gpt-5-nano` $0.05 / $0.40 expires 2026-12-11; `gpt-oss-*` are open-weight models on third-party hosts.)
- All gpt-6.x: context 1,050,000, max output 128,000, long-context override at ≥272k prompt tokens (2× input), `is_moderated: true`, no `temperature`; astra and 6.1-sol have mandatory reasoning.

**Google**
- Flagship: `google/gemini-4-argon` (2026-10-13, $2 / $10) — "Google's flagship reasoning model". Ambiguity: `google/gemini-4-carbon` (2026-11-10, same $2 / $10) is newer and described as "a frontier Gemini 4 model from Google for coding, agentic and complex reasoning work"; the file does not rank them. Today `gemini-4-argon`'s Vertex endpoints report `status` -2 / -5 (non-zero; meaning of codes NOT STATED) while AI Studio is 0; carbon's are all 0 and carbon has a Vertex EU endpoint, argon does not.
- Mid-tier: `google/gemini-4-hydrogen` (2026-11-12, newest Google entry, $1.5 / $7.5) — "the high-efficiency workhorse model of the Gemini 4 family"; alternative `google/gemini-3.8-flash` (2026-09-02, listed $0.825 / $4.125; its global endpoints are $0.75 / $3.75) — "Google's most intelligent Flash model".
- Cheapest/fastest: `google/gemini-3.5-flash-lite` (2026-07-21, $0.30 / $2.50) — newest "Lite" entry, default reasoning effort `minimal`; older and cheaper: `google/gemini-3.1-flash-lite` ($0.25 / $1.50, 2026-05-07), `google/gemini-2.5-flash-lite` ($0.10 / $0.40, 2025-07-22).
- The Gemini text models named above: context 1,048,576, `is_moderated: false`, `temperature` supported, text+image+video+audio+file input, `pricing.web_search` 0.014 (USD per search), mandatory reasoning.
- No Gemini-4 model has "preview" in its id; ids containing `-preview` (3.1-pro-preview, 3-flash-preview, image previews, lyria) are older.

---

## 12. Images

### 12.1 Dedicated Image API — `POST https://openrouter.ai/api/v1/images`

- [src: pages/guides_overview_multimodal_image-generation.md «Send a `POST` request to `/api/v1/images` with the model and prompt:»]
- Request fields (`ImageGenerationRequest`; required `model`, `prompt`): `n` (1–10; Gemini models: max 1), `resolution` (`512|768|1K|1.5K|2K|4K`), `aspect_ratio` (enum incl. `1:1`, `4:5`, `9:16`, `16:9`, `auto`, …), `size` (tier `"2K"` or pixels `"2048x2048"`), `quality`, `output_format` (`png|jpeg|webp|svg|gif`), `background`, `output_compression`, `seed`, `stream`, `input_references` (array of `{type:"image_url", image_url:{url}}`, https URL or base64 data URL), `markup`, `frame_count`, `frame_duration_ms`, `user`, `session_id`, `trace`, `provider` (`only`, `order`, `ignore`, `sort`, `allow_fallbacks`, `options`).
  [src: pages/api_api-reference_images_generate-an-image.md «Reference images to guide image-to-image generation, as base64 data URLs or HTTP(S) URLs.»]
  [src: pages/guides_overview_multimodal_image-generation.md «* `aspect_ratio`: normalized ratio. Pass `auto` to let the provider choose.»]
  [src: pages/guides_overview_multimodal_image-generation.md «Providers clamp to their supported subset.»]
- Verbatim examples:

```json
{
  "model": "bytedance-seed/seedream-4.5",
  "prompt": "a landscape photo",
  "resolution": "2K",
  "aspect_ratio": "16:9"
}
```
```json
{
  "model": "openai/gpt-image-1",
  "prompt": "make this scene look like a watercolor painting",
  "input_references": [
    { "type": "image_url", "image_url": { "url": "https://example.com/photo.jpg" } }
  ]
}
```
```json
{
  "model": "google/gemini-2.5-flash-image",
  "prompt": "a red panda astronaut floating in space",
  "provider": { "only": ["google-ai-studio"], "allow_fallbacks": false }
}
```
- Response: **base64 only** (`data[].b64_json` + optional `media_type`); there is no `url` response format in the schema.

```json
{
  "created": 1748372400,
  "data": [ { "b64_json": "<base64-encoded-image>", "media_type": "image/png" } ],
  "usage": { "prompt_tokens": 0, "completion_tokens": 4175, "total_tokens": 4175, "cost": 0.04 }
}
```
  [src: pages/guides_overview_multimodal_image-generation.md «Images are returned as base64-encoded bytes. The `usage` field reports token counts and cost when available.»]
- Cost: `usage.cost` in USD ("when available" — `usage` is not a required response field). Billing all-or-nothing; failures return 502 and are not billed.
  [src: pages/guides_overview_multimodal_image-generation.md «The `usage` object in the completed event includes `cost` (USD), matching the buffered response shape.»]
  [src: pages/guides_overview_multimodal_image-generation.md «Image generation billing is **all-or-nothing**.»]
  [src: pages/guides_overview_multimodal_image-generation.md «When a generation does not complete, the request returns a `502 Bad Gateway` rather than a partial result, and no charge is recorded.»]
- Discovery: `GET /api/v1/images/models` (no key needed) and `GET /api/v1/images/models/{author}/{slug}/endpoints`; "An absent key means the parameter is unsupported by that endpoint."
- Streaming partial images only on OpenAI endpoints.
- The Image API endpoint appears in the changelog as early as the "July 7, 2026" entry (`POST /images` "now returns `413`"). Not marked beta on its guide page.

### 12.2 Image output via chat/completions

- `ChatRequest.modalities` (enum `text|image|audio`) and `image_config` exist in the OpenAPI; response `message.images[]` = `[{ "image_url": { "url": "data:image/png;base64,…" } }]`.
  [src: pages/api_api-reference_chat_create-a-chat-completion.md «Output modalities for the response. Supported values are "text", "image", and "audio".»]
  [src: pages/api_api-reference_chat_create-a-chat-completion.md «description: Generated images from image generation models»]
  [src: pages/api_api-reference_chat_create-a-chat-completion.md «description: URL or base64-encoded data of the generated image»]
- `image_config` is an untyped map; example `{aspect_ratio: '16:9', quality: high}`.
  [src: pages/api_api-reference_chat_create-a-chat-completion.md «Provider-specific image configuration options. Keys and values vary by model/provider.»]
  **The prose guide it points to no longer documents the chat path at all** (the image-generation guide only covers `/api/v1/images`; grep for `image_config`, `modalities`, `message.images` in the guide = no hits). So supported `image_config` keys/values per model for chat (e.g. `image_size` 1K/2K) are NOT STATED today; the only authoritative per-model capability data is the Image API's `supported_parameters`.
- Which models: the 10 models in §11.2 list `/api/v1/chat/completions` in `endpoints` and have `image` in `output_modalities`. Pure image models (`openai/gpt-image-*`) are only in `image-models.json`, i.e. Image API only.
- Cost for the chat path: normal `usage` (`completion_tokens_details.image_tokens`, `cost`).
- Third path: server tool `{type:"openrouter:image_generation", parameters:{model, aspect_ratio, quality, size,…}}` (beta; default model `openai/gpt-image-2.6-flare`).

### 12.3 ZDR / data_collection for images

- The Image API's `provider` object (`ImageGenerationProviderPreferences`) has only `allow_fallbacks`, `ignore`, `only`, `options`, `order`, `sort` — **no `zdr`, no `data_collection`** per-request fields.
  [src: pages/api_api-reference_images_generate-an-image.md «Provider routing preferences and provider-specific passthrough configuration.»]
- Whether account-level privacy settings / guardrails apply to `/api/v1/images`: NOT STATED explicitly for the Image API. (For the image *server tool*: [src: pages/guides_features_server-tools.md «Inner generations run under your API key, so account and guardrail ZDR settings apply. Request-level `provider` preferences are not forwarded.»])
- Per `endpoints-zdr.json`, Google image models have a Vertex `global` endpoint (Safety Retention = true); OpenAI image models have none. Via chat/completions the full `provider` object (incl. `zdr`, `data_collection`, `only: ["google-vertex"]`) is available.

---

## 13. Video input (video understanding)

- Send as content part. Chat Completions: `{"type":"video_url","video_url":{"url":"<URL or data:video/mp4;base64,…>","processing":"agentic|static"}}` (legacy `type:"input_video"` deprecated in chat). Responses: `{"type":"input_video","video_url":"…"}`. **Messages endpoint: not supported.**

```json
{
  "model": "google/gemini-2.5-flash",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "What is the height of the Rio Cathedral?" },
      { "type": "video_url", "video_url": { "url": "https://www.youtube.com/watch?v=-11ookL1yPA", "processing": "agentic" } }
    ]
  }]
}
```
  [src: pages/guides_overview_multimodal_videos.md «* **Chat Completions API** (`/api/v1/chat/completions`): on the `video_url` content part»]
- URL vs base64 depends on the PROVIDER endpoint:
  [src: pages/guides_overview_multimodal_videos.md «* **Google Gemini (AI Studio)**: Only supports YouTube links (e.g., `https://www.youtube.com/watch?v=...`)»]
  [src: pages/guides_overview_multimodal_videos.md «* **Google Gemini (Vertex AI)**: Does not support video URLs. Use base64-encoded data URLs instead»]
  [src: pages/guides_overview_multimodal_videos.md «OpenRouter only sends video URLs to providers that explicitly support them.»]
  ⇒ arbitrary https video URLs are not supported for Gemini; non-YouTube video must be base64 in the JSON body. Max body/video size: NOT STATED ("Check model-specific file size limits"; 413 `payload_too_large` exists). No Files-API-for-video statement found.
- Formats: `video/mp4`, `video/mpeg`, `video/mov`, `video/webm`.
- `processing` is Gemini-only; omitted ⇒ Gemini default.
- Usage: `prompt_tokens_details.video_tokens`.
- Google models with `video` in `input_modalities` (models.json, non-batch): `google/gemini-4-hydrogen`, `google/gemini-4-carbon`, `google/gemini-4-argon`, `google/gemini-omni-1.2-flash`, `google/gemini-omni-1.1-flash`, `google/gemini-3.8-flash`, `google/gemini-3.7-flash`, `google/gemini-3.6-flash`, `google/gemini-3.5-flash-lite`, `google/gemini-3.5-flash`, `google/gemini-3.1-flash-lite`, `google/gemini-3.1-flash-lite-preview`, `google/gemini-3.1-pro-preview`, `google/gemini-3.1-pro-preview-customtools`, `google/gemini-3-flash-preview`, `google/gemini-2.5-flash-lite`, `google/gemini-2.5-flash`, `google/gemini-2.5-pro`, `google/gemma-4-26b-a4b-it`(+`:free`), `google/gemma-4-31b-it`(+`:free`). No OpenAI or Anthropic model lists video input.
- Under ZDR/"only Vertex" routing, YouTube links stop working (Vertex endpoint needs base64).

---

## 14. Surprising / risky for an integrator

1. **HTTP 200 can carry an error, also for non-streaming** (body with only `error`, or `choices[0].finish_reason:"error"` + `choices[0].error`). Always inspect the body. (§6)
2. **Forced tool choice is flagged unsupported on Claude 5.5 / Fable 5.2 endpoints** (`required:false, function:false`); older Claude ok. Structured extraction via "force this tool" must move to `response_format`/`output_config.format` or use `auto`. (§2)
3. **Capabilities are per provider endpoint.** Default routing spreads traffic over Anthropic 1P, Bedrock, Vertex, Azure, Claude-on-AWS. Bedrock lacks `structured_outputs` for Claude 5.5; Vertex/Bedrock/Azure lack native web search/fetch for Claude; Bedrock lacks native search for OpenAI. Pin with `provider.only`/`order` (+ `allow_fallbacks:false`) or `require_parameters:true` when behaviour must be identical to calling Anthropic directly. (§2–4)
4. **First-party Anthropic / OpenAI / Google AI Studio are not ZDR on OpenRouter**; `zdr:true` moves Claude to Bedrock/Vertex, OpenAI to Azure, Gemini to Vertex (Safety Retention, not strict ZDR). `claude-fable-5.2` and all OpenAI image models have no ZDR endpoint today. ZDR never covers search/fetch backends (Exa etc.). (§8, §3.8)
5. **Server tools (web search/fetch) are BETA**; the `web` plugin and `:online` are deprecated. Google native search can't do domain filters (auto → silently Exa; native → 400). Web fetch has no native engine on OpenAI/Google (→ Exa at $1/1k or free `openrouter` fetcher). (§3)
6. **Mandatory reasoning** on current flagships + shared `max_tokens` budget ⇒ `finish_reason:"length"` with empty content is possible and billed. `temperature` unsupported on new Claude/GPT. (§4, §11)
7. **In-flight spending budget**: low-balance/new prepaid accounts can get 402 with positive balance when many concurrent requests reserve `max_tokens`. Keep balance well funded / set realistic `max_tokens`; handle `Retry-After` on 402. (§9)
8. **Messages skin specifics**: `service_tier` label `standard`; `usage.server_tool_use` null vs omitted; errors use Anthropic envelope with lossy `error.type` (use `error.error_type`); no video input; `web_fetch_20260209` not a typed request tool; behaviour of Anthropic-only features on non-Claude models not documented. (§1.4)
9. **Docs drift**: guides are now Responses-API-first; the chat/completions image path (`modalities`/`image_config`) is only in the OpenAPI, not in prose; `annotations` isn't in the chat response schema. The live server-tool catalog (`/api/v1/tools`) needs a key. (§12.2, §3.5)
10. **Image API**: base64 only (large JSON responses — mind Convex action response/memory limits), Gemini models `n` max 1, OpenAI image models lack `4:5`, per-token (not per-image) pricing, no per-request `zdr`/`data_collection`. (§12)
11. **Video**: AI Studio = YouTube URLs only, Vertex = base64 only; no generic URL ingestion. (§13)
12. **Attribution header creates a public app listing** unless `X-OpenRouter-App-Visibility: hidden` is sent at creation. (§1.2)
13. **Pricing surprises**: regional endpoints +10 %; long-context overrides (2× above 272k on gpt-6.x; 5× above 100k on haiku-5.5); GPT-5.6+ bill cache writes at 1.25× automatically; `anthropic/fast` / `openai/fast` tiers 2× (only used when `service_tier`/tier slug requested); 5.5 % credit purchase fee. (§5, §7, §11)
14. **Deprecations/expiry**: OpenAI gpt-5 family, o3, gpt-5-image(-mini) expire 2026-12-01/11; `usage:{include:true}`, `stream_options.include_usage`, `route`, `max_tokens` (chat: "deprecated, use max_completion_tokens"), legacy `input_video` chat part, `enforce_zdr` guardrail field are deprecated.
15. **Changelog (2026-08-13 … 2026-11-12)**: auto-generated from OpenAPI diffs almost daily. In "Breaking changes" sections of that window, entries touching Chat/Messages/Image/endpoint schemas are all tagged "No action needed" (e.g. `PublicEndpoint` gained required `supports_tool_choice` 2026-08-28, `native_tools` 2026-09-28, `service_tier` 2026-10-15; `MessagesErrorResponse` schema object removed 2026-08-13). No human-written migration note for `/chat/completions`, `/messages` or `/images` in the window. Policy: non-breaking changes (new fields/enum values) ship without notice — parse defensively.
    [src: pages/api_reference_versioning.md «Write clients defensively: ignore response fields you don't recognize, and don't fail on unknown enum values.»]
    [src: pages/changelog.md «* `PublicEndpoint`: required `native_tools` property addedNo action needed»]
16. Scheduled policy change noted in docs: CSAM screening of all traffic incl. ZDR ("Planned update (October 27, 2026)"); Google Vertex Safety Retention since 2026-10-18.
