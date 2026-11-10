# Creative Production: research and recommendations

Date: 2026-11-10. Research only; no product code. For the owner's decision before any build.

**How to read the facts here.** Every vendor fact was fetched on 2026-11-10 from the linked page. Models and prices change every few months, so re-check before signing or building. Three labels are used throughout:

- **Verified**: read on the provider's own page that day.
- **3P**: only a third-party source supports it.
- **UNVERIFIED**: could not be confirmed. Several provider pages would not load (OpenAI terms, Google Cloud pricing, HeyGen's rate table, D-ID pricing, Kling pricing, several Meta help pages).

Nobody signed up for anything, called a paid API or used a key, so **no latency or quality figure here is measured**. Almost no vendor publishes latency. A short hands-on bake-off is the first build task (Section 6).

Sections 3 and 4 are **not legal advice**. Counsel should review them before launch.

---

## One-page summary

**What to build first.** Phase 1 is "Make our version" for **static ads, carousels, scripts, hooks and captions**, with a brand kit, a pre-run cost quote and a 4-variation set tied to the outcome loop. It costs the customer about $2 a set, needs no slow video jobs and no likeness consent, and proves the full path from reference to brief to checks to approval. Video comes in Phase 2, avatars and the big packs in Phase 3.

**Recommended models (default, then fallback):**

| Job | Default | Fallback | Real cost |
|---|---|---|---|
| Image with in-image text | Google Nano Banana 2.1 (step up to Nano Banana Pro for text-heavy layouts) | OpenAI gpt-image-2.6 | $0.03–$0.13 per image |
| Image editing, product shots | Google Nano Banana 2.1 | Black Forest Labs FLUX.2 [pro] | $0.03–$0.11 per image |
| 9:16 video (text or image to video) | Google Gemini Omni 1.2 Flash | Kling 4 through an aggregator | $0.07–$0.24 per second |
| Avatar or talking head | HeyGen API v3 | D-ID | about $1–$4 per minute (UNVERIFIED) |
| Voice and voice cloning | ElevenLabs v4 | Cartesia Sonic-3.6 | $0.04–$0.08 per 1,000 characters |
| Music and sound | Licensed library: Epidemic Sound Partner API | Generated: Google Lyria 3 clip or ElevenLabs Music | $0.04–$0.15 per track; library price by quote |
| Captions and transcription | Deepgram Nova-3 | ElevenLabs Scribe v2 | about $0.26 per hour |
| Breaking down a reference ad | Google Gemini 3.8 Flash | Claude Sonnet 5.5 on frames plus transcript | $0.01–$0.11 per ad |
| Scripts, briefs, checks | Claude (already in the product) | n/a | $0.10–$0.60 per job |

**Five findings that change the plan:**

1. **OpenAI's Sora API was shut down on 2026-09-24**, and Veo left the Gemini API on 2026-10-22. Video models churn fast. Build every generator behind an adapter so a model can be swapped in a day.
2. **The reference video cannot be downloaded from YouTube, Instagram or TikTok without breaking their terms.** The compliant path is: embed for display; Gemini's YouTube-link input for public YouTube videos; **user upload** for everything else.
3. **Avatar and voice vendors restrict reselling.** HeyGen's and ElevenLabs's standard terms do not let us offer their service to our customers' clients without an enterprise or OEM agreement. Start those conversations before Phase 3.
4. **No vendor covers trademark claims**, and generated logos come out wrong. Vistrial should never generate a logo: it places the customer's real logo file on top.
5. **Video is where the money goes.** A 15-second video costs the customer about $6–$10; ten full video variations would cost about $54. Design variations as hook swaps (about $15) and always show a quote first.

**What $150 of monthly credits buys** (that is $50 of real cost at 3×): for example one month's organic pack with video ($53), six static ad sets in three sizes ($18), five 15-second videos ($40) and five 30-second avatar videos ($27), with about $11 left. A user who only makes static ads and copy will barely dent it; a user who makes many videos will need top-ups.

**Rules to build in from day one:** the similarity dial copies structure and never expression; the reference file is never an input to a generator; real people need a stored consent record; no celebrities, minors, political ads or fake testimonials; AI labelling metadata stays on every file.

**Decisions needed from the owner** are listed in Section 6.4.

---

## 1. Model shortlist per job

Aspect ratios needed: 1:1, 4:5, 9:16, 16:9 and 1.91:1.

### 1.1 Image generation with accurate in-image text

| Model | Access | Price per image | Sizes and ratios | Rights and policy | Watermark |
|---|---|---|---|---|---|
| **Google Nano Banana 2.1** (`gemini-nano-banana-2.1`, GA 2026-10-06) | Self-serve, paid tier | 1K $0.034, 2K $0.050, 4K $0.113; batch half price | Up to 4K; 1:1, 4:5, 9:16, 16:9. **No 1.91:1** (crop from 16:9) | Google claims no ownership; paid-tier prompts not used to improve products. No indemnity in the Gemini API terms | SynthID on every image; no off switch |
| **Google Nano Banana Pro** (`gemini-3-pro-image`) | Same | 1K/2K $0.134, 4K $0.24 | Up to 4K; same ratios | Same | Same |
| **OpenAI gpt-image-2.6** (`-sunburst`, `-flare`; released 2026-11-04, 3P) | Self-serve; organisation verification may apply | Token-based. Per-image price for 2.6 UNVERIFIED; GPT Image 2 at 1024²: $0.006 low, $0.053 medium, $0.211 high | Any size in multiples of 16, so **all five ratios including 1.91:1** | Terms page blocked: ownership UNVERIFIED; "Copyright Shield" indemnity is 3P | C2PA and SynthID reported (3P) |
| **Ideogram 4.5** | Self-serve | $0.03–$0.10 (3P; official table did not load) | UNVERIFIED | 2024 API terms are silent on output ownership, require AI disclosure, ban political use | Not stated |
| **Recraft V4.1** | Self-serve | $0.035; Pro 2K $0.21; vector $0.08 | Up to 3072×1536; no 1.91:1 listed | API ownership sits in separate Developer Terms (UNVERIFIED); trains on inputs by default with opt-out | "May" embed |
| **FLUX.2 [flex] / FLUX 3** (Black Forest Labs) | Self-serve | FLUX.2 flex $0.05; FLUX 3 $0.048 at 1K | FLUX 3: exact pixel sizes, so 1.91:1 works | Commercial use allowed; **BFL takes a perpetual licence to inputs and outputs** | Must not remove AI marking |

Latency and rate limits: UNVERIFIED for all (Google's per-model limits show only inside its console; Recraft publishes 100 images a minute; Ideogram 10 requests in flight).

**Recommendation.** Default **Nano Banana 2.1** at 2K: generally available, cheap, native 4:5 and 9:16, and the cleanest terms we could read. Step up to **Nano Banana Pro** when the layout is text-heavy, which Google's docs recommend for accurate text. Fallback **gpt-image-2.6**: the only one with true 1.91:1, but six days old with unverified price and terms. Ideogram is held back until its price and ownership terms can be read.

Sources: [Gemini pricing](https://aistudio.google.com/docs/pricing), [Gemini image docs](https://aistudio.google.com/docs/image-generation), [Gemini changelog](https://aistudio.google.com/docs/changelog), [Gemini API terms](https://aistudio.google.com/docs/terms), [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [OpenAI image guide](https://developers.openai.com/api/docs/guides/image-generation), [Ideogram API terms](https://ideogram.ai/legal/api-tos), [Recraft pricing](https://www.recraft.ai/docs/api-reference/pricing), [Recraft terms](https://www.recraft.ai/terms), [BFL pricing](https://bfl.ai/pricing), [BFL terms](https://bfl.ai/legal/terms-of-service).

### 1.2 Image editing and brand-consistent product shots

| Model | What it offers | Price | Concern |
|---|---|---|---|
| **Nano Banana 2.1** | Up to 14 reference images; keeps up to 10 objects and 4 characters consistent | $0.034–$0.113 | SynthID always on |
| **FLUX.2 [pro]** (pinned snapshot) / **FLUX 3 Image** | 8–10 reference images, hex brand colours, bounding-box edits, exact pixel sizes | FLUX.2 pro $0.03 per megapixel plus $0.015 per reference; FLUX 3 $0.048–$0.10 | BFL's perpetual licence over inputs and outputs needs legal review before client product photos go through it |
| **gpt-image-2.6** | Multi-image edits, prompt masks, transparent background | UNVERIFIED | OpenAI's own docs say it can struggle with brand-element consistency |
| **Recraft V4.1** | Custom styles from 1–10 reference images; real SVG output | $0.035 plus $0.005 | Edits only on the older V3 |

**Recommendation.** Default **Nano Banana 2.1**; fallback **FLUX.2 [pro]** if counsel accepts BFL's licence, otherwise gpt-image-2.6.

**Whatever the model: logos are never generated.** The only indemnity we could verify (Google Cloud's) excludes trademark claims, and generated logos distort. Vistrial composites the real logo file from the brand kit on top of the image in its own code.

Sources: as 1.1, plus [FLUX.2 overview](https://docs.bfl.ml/flux_2/flux2_overview.md), [Google Cloud service terms](https://cloud.google.com/terms/service-terms).

### 1.3 Text-to-video and image-to-video at 9:16

What changed this year:

- **OpenAI Sora**: the Videos API, `sora-2` and `sora-2-pro` shut down 2026-09-24, with no replacement named ([OpenAI deprecations](https://developers.openai.com/api/docs/deprecations)).
- **Google Veo**: removed from the Gemini API on 2026-10-22; Veo 3.1 lives on Vertex AI only. Google's Gemini API video model is now **Gemini Omni** ([Gemini video docs](https://aistudio.google.com/docs/video)).
- **Runway and Pika** now also resell other vendors' models through their own APIs.

| Model | Access | Price per second | Length and 9:16 | Audio | Rights and people | Watermark | Limits |
|---|---|---|---|---|---|---|---|
| **Google Gemini Omni 1.2 Flash** (`gemini-omni-1.2-flash`) | Self-serve, paid tier | Audio included: 720p about $0.07, 1080p (upscaled) $0.104, 4K $0.209 | 3–15 s, extendable to 30 s; 9:16 native; text, image, first and last frame, 6 reference images | Native sound and dialogue | Blocks uploads of certain recognisable people; extra limits in EEA/UK/CH. Output-rights terms as Gemini API | SynthID always on | UNVERIFIED |
| **Google Veo 3.1** (Vertex AI) | Vertex only; page says pay-as-you-go is not supported (confirm) | UNVERIFIED direct; resellers $0.20 silent, $0.40 with audio; Fast $0.10/$0.15 | 4, 6 or 8 s clips; 9:16; up to 1080p or 4K | Yes | UNVERIFIED | C2PA | 50 requests a minute |
| **Runway Gen-4.5 / Gen-4 Turbo** | Self-serve | $0.12 / $0.05 (Turbo is image-to-video only) | UNVERIFIED | UNVERIFIED | Runway claims no ownership; **may train on inputs and outputs**; you indemnify Runway | Not stated | Tier 1: 1–2 at once, 50–200 a day; rises with spend |
| **Kling 3.0 / 4.0** (Kuaishou) | Official API with prepaid packs; also on fal and Runway | Official UNVERIFIED. Via resellers: 3.0 Pro $0.11–$0.17; Kling 4 $0.157 at 720p, $0.235 at 1080p | UNVERIFIED | Yes | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| **Luma Ray3.2** | Self-serve "Build" tier | In credits; dollar rate not stated (UNVERIFIED) | 5 or 10 s, extend by 5 s; 9:16; 1080p | Not stated | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| **Pika** | Own API, now multi-model | UNVERIFIED | UNVERIFIED | | | | |

Others seen on reseller lists only: ByteDance Seedance 2.5 (up to 30 s in one take, $0.30–$0.68 per second), Alibaba Wan 3 ($0.10–$0.14), MiniMax Hailuo 3 ($0.10–$0.15), xAI Grok Imagine 1.5 ($0.16).

Latency: no vendor publishes it. Plan for minutes, not seconds, and measure in the bake-off.

**Recommendation.** Default **Gemini Omni 1.2 Flash, direct**: the only option verified end to end for the brief (native 9:16, 3–15 s extendable to 30 s, sound, image input) and the cheapest with audio. Catches: 1080p is upscaled, SynthID is always on, and uploads of recognisable people are blocked, which is fine because our people formats go through the avatar path. Fallback **Kling 4 through one aggregator**. Keep **Runway Gen-4 Turbo** ($0.05 per second) in mind as a cheap way to add motion to an approved still.

Sources: [Gemini pricing](https://aistudio.google.com/docs/pricing), [Omni docs](https://aistudio.google.com/docs/omni), [Veo 3.1 on Vertex](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate), [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/), [Runway tiers](https://docs.dev.runwayml.com/usage/tiers/), [Runway terms](https://runway.com/terms-of-use), [Kling billing](https://kling.ai/document-api/productBilling/prePaidResourcePackage), [Luma pricing](https://lumalabs.ai/api/pricing), [Pika developer site](https://dev.pika.art/).

### 1.4 Aggregators: fal.ai, Replicate and Runway's API

| | fal.ai | Replicate | Runway API |
|---|---|---|---|
| Carries | Veo 3.1 (endpoint flagged for removal 2026-11-17), Kling, Seedance, Wan, Hailuo, Grok, FLUX, avatar and lip-sync models | Veo 3.1, Wan; rest UNVERIFIED | Its own models plus Veo, Kling, Seedance, Wan, Hailuo, Grok, Omni |
| Job handling | Queue with request ID, polling or webhook, automatic retries; no charge for queue time or server errors | Predictions plus webhooks | Task queue; over-limit tasks wait |
| Output rights | Terms do not expressly assign output ownership; model pages carry a "Commercial use" tag | You get rights "if any", subject to each model's own terms, which you must pass on to your users | As Runway terms |
| Indemnity, SLA | You indemnify fal; no SLA in standard terms | You indemnify Replicate; no SLA | You indemnify Runway |
| Data | Media links are public and expire by setting | Inputs and outputs deleted after 1 hour by default | UNVERIFIED |

Replicate: Cloudflare announced it would buy Replicate on 2025-11-17; whether the deal closed is UNVERIFIED (Replicate's terms still name Replicate, LLC).

Price check, per second:

| Model | Direct | fal | Runway API |
|---|---|---|---|
| Omni 1.2 Flash 720p / 1080p | $0.07 / $0.104 | not seen | $0.07 / $0.10 |
| Veo 3.1 with audio | UNVERIFIED | $0.40 | $0.40 |
| Kling 3.0 Pro, silent / audio | UNVERIFIED | $0.112 / $0.168 | $0.12 / $0.17 |
| Kling 4 | UNVERIFIED | $0.157 | $0.157 (720p), $0.235 (1080p) |

**What an aggregator buys us:** one key, one bill and one job pattern across many models; self-serve access to the Chinese models without prepaid packs; fast swaps when a model is withdrawn. Where we could compare, the markup was about zero.

**What it costs:** a weaker legal position (no indemnity, no SLA, output rights passed through or not stated), a second company handling client assets, and endpoint churn of its own.

**Recommendation.** Go **direct to Google** for the defaults (images, video, video understanding), where one set of terms covers most of the volume. Use **one aggregator, fal.ai**, for fallbacks only. Avoid Runway's API for client assets unless its training clause is acceptable.

Sources: [fal pricing](https://fal.ai/pricing), [fal queue docs](https://fal.ai/docs/model-apis/model-endpoints/queue), [fal terms](https://fal.ai/legal/terms-of-service), [Replicate terms](https://replicate.com/terms), [Replicate data retention](https://replicate.com/docs/topics/predictions/data-retention), [Cloudflare announcement](https://blog.cloudflare.com/replicate-joins-cloudflare/).

### 1.5 Avatar and talking-head video

| Provider | Access | Price | Specs | Consent for a real person's avatar |
|---|---|---|---|---|
| **HeyGen API v3** (engines Avatar III, IV, V) | Self-serve pay-as-you-go wallet | Official table not retrievable. HeyGen's blog: Avatar III $0.0167/s, Avatar IV $0.05/s, Avatar V $0.0667/s; the same page also quotes $7.20 a minute for Avatar V. **UNVERIFIED** | 720p/1080p; 9:16, 4:5, 1:1, 16:9; up to 30 minutes; 10 jobs at once | The person records a consent statement with a spoken code on a HeyGen-hosted page (link valid 24 hours). Uploading a pre-recorded consent video is Enterprise-only. Photo avatars have no check |
| **D-ID** (V4 Expressive, V3) | Self-serve key | Pricing page would not load (3P: $18–$198 a month) | "Full HD" | Fully through the API: we request a script with a 3-word passcode, the person reads it on video, we upload it within 30 minutes |
| **Synthesia** | API plan gating unclear | $19–$89 a month; API "up to 360 minutes a year" | Render about 3–5 minutes | Consent video must be recorded live; inviting another person is Enterprise-only; no personal-avatar creation through the API found |
| **Captions "Mirage" API** | Self-serve | $0.15 per second (about $9 a minute) | 9:16, 16:9 | No consent endpoint found |
| **Tavus** | Self-serve; advertises white-label on Enterprise | About $0.80–$1.00 a minute overage, plans $22–$975 a month | UNVERIFIED | Docs page missing |
| **fal.ai lip-sync models** (OmniHuman 1.5, Kling AI Avatar v2, VEED Fabric, sync) | Self-serve | $0.08–$0.16 per second | Up to 720p on Fabric | **None enforced**: consent is entirely on us |

**Reselling.** HeyGen's general terms say "you may not authorize third parties to use the Services" and bar white-labelling unless HeyGen provides it. Our use (generating for customers and their clients) therefore needs an **Enterprise agreement**, which is also the only way to upload a client's consent video. HeyGen's terms also ban political campaigning and require us to disclose that output is AI-generated. Terms for D-ID and Synthesia could not be loaded.

**How the three modes map:**

- **Stock presenters:** HeyGen's library.
- **The user's own avatar:** HeyGen's hosted consent link, or D-ID's passcode consent.
- **A client's avatar:** send the client HeyGen's consent link so they record it themselves, **and** store Vistrial's own consent record first (Section 3.2). The vendor's consent covers the vendor; ours covers what the agency may do.

**Recommendation.** Default **HeyGen API v3**; fallback **D-ID**, whose consent runs entirely inside our own screens. Use fal lip-sync models only for stock or synthetic faces.

Sources: [HeyGen quick start](https://developers.heygen.com/docs/quick-start), [HeyGen avatar video](https://developers.heygen.com/generate-avatar-video.md), [HeyGen usage limits](https://developers.heygen.com/docs/usage-limits.md), [HeyGen avatar consent](https://developers.heygen.com/docs/avatar-consent.md), [HeyGen pricing help](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained), [HeyGen blog rates](https://www.heygen.com/blog/best-ai-avatar-talking-head-apis), [HeyGen terms](https://www.heygen.com/terms), [D-ID docs](https://docs.d-id.com/reference/get-started), [D-ID instant avatar](https://docs.d-id.com/docs/v3-instant-avatar-quickstart.md), [Synthesia pricing](https://www.synthesia.io/pricing), [Synthesia personal avatars](https://docs.synthesia.io/docs/personal-avatars.md), [Captions API pricing](https://captions.ai/help/docs/api/pricing), [Tavus pricing](https://www.tavus.io/pricing), [fal OmniHuman](https://fal.ai/models/fal-ai/bytedance/omnihuman/v1.5), [fal VEED Fabric](https://fal.ai/models/veed/fabric-1.0).

### 1.6 Voice cloning and text-to-speech

| Provider | Models | Price | Cloning and consent | Notes |
|---|---|---|---|---|
| **ElevenLabs** | `eleven_v4` (90+ languages), `eleven_v4_turbo`, `eleven_flash_v2_5` | Per 1,000 characters: v4 $0.08, Turbo and Flash $0.04. Plans $6–$990 a month | Instant clone: 1–2 minutes of audio and a tick-box, **no voice check**. Professional clone: 30+ minutes, the owner reads a prompted text ("voice captcha"), and **only the owner can create it** | Commercial licence on paid plans. Licence is "non-sublicensable"; separate OEM terms cover building it into our product. No under-18 voices; political use needs written consent; watermarks must stay |
| **Cartesia** | Sonic-3.6 | $0.038–$0.065 per 1,000 characters | Instant clones on Pro; consent mechanics UNVERIFIED | Self-serve; commercial use on paid plans |
| **OpenAI** | Speech models deprecated, shut down 2027-01-06 | | Custom voices by sales only | Do not adopt |
| **Google Chirp 3 HD**, **Azure Personal Voice** | | UNVERIFIED | Both need a fixed spoken consent statement; both gated by sales or an intake form | Later options |
| **Hume**, **PlayHT** | Hume sunset 2026-11-13 (search snippet); PlayHT shut down (3P) | | | Do not adopt |

**Recommendation.** Default **ElevenLabs v4** for final reads and Turbo or Flash for previews. A clone is created only after Vistrial's own recorded consent step, because the instant clone has no check of its own. Confirm with ElevenLabs whether our use needs OEM terms. Fallback **Cartesia Sonic-3.6**.

Sources: [ElevenLabs models](https://elevenlabs.io/docs/overview/models), [ElevenLabs API pricing](https://elevenlabs.io/pricing/api), [instant cloning](https://elevenlabs.io/docs/product-guides/voices/voice-cloning/instant-voice-cloning), [professional cloning](https://elevenlabs.io/docs/product-guides/voices/voice-cloning/professional-voice-cloning), [ElevenLabs terms](https://elevenlabs.io/terms-of-use), [ElevenLabs use policy](https://elevenlabs.io/use-policy), [Cartesia pricing](https://cartesia.ai/pricing), [OpenAI text-to-speech](https://developers.openai.com/api/docs/guides/text-to-speech), [Google instant custom voice](https://docs.cloud.google.com/text-to-speech/docs/chirp3-instant-custom-voice), [Azure Personal Voice](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/personal-voice-overview).

### 1.7 Music and sound

| Option | Access | Price | Ad-use position |
|---|---|---|---|
| **Epidemic Sound Partner API** (licensed library, 55,000+ tracks) | Free tier is for prototyping only; production by sales | By quote | The only option read whose terms explicitly cover ads and sub-licensing to end users, with safelisting against YouTube Content ID claims |
| **Soundstripe API** | Trial key; production by sales | Not published | "Pre-cleared and royalty free"; ad cover not stated |
| **ElevenLabs Music** (`music_v2_5`) | Self-serve on paid plans | $0.15 a minute | Commercial use allowed **except film, TV and radio** below the Enterprise tier; making the model available to third parties needs written authorisation; no indemnity |
| **ElevenLabs Sound Effects** | Self-serve | $0.12 a minute | "Royalty-free" per pricing page |
| **Google Lyria 3** (`lyria-3-clip-preview` 30 s; `lyria-3.5` full song) | Self-serve | $0.04 a clip, $0.08 a song | Google claims no ownership; SynthID on all audio; no indemnity |
| **Stable Audio 3.0** | Self-serve | $0.08 a generation | API output licence not addressed on the licence page (UNVERIFIED) |
| **Suno**, **Udio** | No public API; label lawsuits partly unresolved (3P) | | Avoid |

**Recommendation.** For paid ads, default to a **licensed library (Epidemic Sound)** once a partner deal is signed. Until then, and for organic posts, generate **instrumental beds with Lyria 3 or ElevenLabs Music** and tell the user plainly that generated music carries no indemnity. On TikTok, also offer "no music: add a track from TikTok's Commercial Music Library when you upload", because TikTok tells businesses to use that library (Section 3.4).

Sources: [Epidemic Sound developers](https://developers.epidemicsound.com/), [Soundstripe API](https://www.soundstripe.com/api), [ElevenLabs music](https://elevenlabs.io/docs/overview/capabilities/music), [ElevenLabs music terms](https://elevenlabs.io/music-terms), [Gemini music docs](https://aistudio.google.com/docs/music-generation), [Stability pricing](https://docs.stability.ai/pricing), [Stability licence](https://stability.ai/license).

### 1.8 Captioning and transcription

Word-level timestamps are needed for burned-in captions and for cutting long video into shorts.

| Model | Price | Word timestamps | Speakers | Limits |
|---|---|---|---|---|
| **Deepgram Nova-3** | $0.0043 a minute ($0.26 an hour) | Yes | Included | 2 GB file; 100 requests at once |
| **ElevenLabs Scribe v2** | $0.22 an hour | Yes | Up to 32 | 3 GB, 10 hours; 90+ languages |
| **AssemblyAI Universal** | $0.15–$0.21 an hour | UNVERIFIED | +$0.02 an hour | |
| **Groq Whisper large v3 turbo** | $0.04 an hour | Yes | No | 25–100 MB files |
| **OpenAI** | $0.0045–$0.006 a minute | Only `whisper-1`, which **shuts down 2027-02-26**; its replacement has none | | Do not build on it |

**Recommendation.** Default **Deepgram Nova-3**; fallback **ElevenLabs Scribe v2** (already a vendor for voice). Data-retention terms were not read for any of them.

Sources: [Deepgram pricing](https://deepgram.com/pricing), [Deepgram pre-recorded](https://developers.deepgram.com/docs/pre-recorded-audio), [ElevenLabs speech to text](https://elevenlabs.io/docs/overview/capabilities/speech-to-text), [AssemblyAI pricing](https://www.assemblyai.com/pricing), [Groq speech to text](https://console.groq.com/docs/speech-to-text), [OpenAI speech to text](https://developers.openai.com/api/docs/guides/speech-to-text).

### 1.9 Video understanding (breaking down a reference ad)

Cost is estimated for one 30-second ad.

| Model | How it takes video | Price | Per 30 s ad | Notes |
|---|---|---|---|---|
| **Gemini 3.8 Flash** | Picture and sound together; frame rate adjustable; **accepts a public YouTube link directly** | $0.75 in / $3.75 out per million tokens, doubling 2027-01-01 | about $0.01 (about $0.02 after the rise) | Up to 3 hours of video |
| **Gemini 4 Argon** | Same | $2 / $10, doubling 2026-12-01 | about $0.02–$0.05 | For difficult ads |
| **Claude Sonnet 5.5** | Images only: we sample frames and add a transcript | $2 / $10 | about $0.04–$0.11 | No sound; independent of Google |
| **OpenAI gpt-5.6** | Images only | $2 / $12 | about $0.08 | |
| **Twelve Labs Pegasus** | Native video | $1.75 per video hour plus tokens | about $0.02 | Only worth it for searching a large ad library |
| **Amazon Nova 2 Lite** | Native video, **no sound** | about $0.33 / $2.75 (3P) | about $0.01 | Weak on small on-screen text |

**Recommendation.** Default **Gemini 3.8 Flash**: sound and picture in one call, adjustable frame rate for fast-cut hooks, about one cent an ad. Fallback **Claude Sonnet 5.5 on sampled frames plus the Deepgram transcript**, which also removes the dependency on the YouTube-link feature (still in preview). Claude then writes the brief and script from the structured breakdown either way.

Sources: [Gemini pricing](https://aistudio.google.com/docs/pricing), [Gemini video understanding](https://aistudio.google.com/docs/video-understanding), [Claude vision](https://platform.claude.com/docs/en/build-with-claude/vision), [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), [OpenAI vision](https://developers.openai.com/api/docs/guides/images-vision), [Twelve Labs pricing](https://www.twelvelabs.io/pricing), [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/).

---

## 2. Cost model in Vistrial credits

Usage is charged at real cost × 3 (`BILLING_MARKUP`, `convex/lib/billing.ts`). The Growth plan is $179 a month with $150 of credits, which is **$50 of real cost**.

These are estimates from list prices, not measured runs. Each assumes the recommended default model and one extra attempt for a share of the output ("retakes"), because people rarely accept the first result. Claude's part (brief, script, checks) is taken at $0.10–$0.60 a job.

| Job | What is in it | Real cost | Customer price (×3) |
|---|---|---|---|
| **Static ad, 4 variations** | Reference breakdown $0.01; brief, copy and checks $0.15; 4 images at 2K plus 4 retakes $0.40 | about **$0.55** | about **$1.65** |
| The same, in three placement sizes | 12 images plus retakes | about $1.00 | about $3.00 |
| The same, on Nano Banana Pro | Text-heavy layouts | about $1.25 | about $3.75 |
| **15 s vertical video** | 15 s at 1080p $1.56, generated twice $3.12; voice $0.02; music $0.04; captions under $0.01; Claude $0.20; assembly about $0.05 | **$1.90** first take, about **$3.45** typical | **$5.70 to $10.35** |
| The same, on the Kling 4 fallback | $0.235 a second | $3.85 to $7.40 | $11.55 to $22.20 |
| **30 s avatar video** | HeyGen Avatar IV 30 s $1.50 (UNVERIFIED rate); voice $0.04; captions; Claude $0.20 | about **$1.80** | about **$5.40** |
| The same, range across HeyGen engines | Avatar III $0.50 to the $7.20-a-minute figure $3.60 | $0.75 to $3.85 | $2.25 to $11.55 |
| **10-variation test pack, static** | 10 images plus 5 retakes $0.75; Claude $0.30 | about **$1.05** | about **$3.15** |
| **10-variation test pack, video, hook swaps** | One shared 12 s body $1.25; ten 3 s hooks $3.12; extras $0.50 | about **$4.90** | about **$14.70** |
| 10 full 15 s videos (not recommended) | 150 s of video plus extras | about $18 | about $54 |
| **Month's organic pack, with video** | 30 posts: 12 single images and 8 five-slide carousels (52 images, $3.40 with retakes); 6 ten-second videos ($9.40 with retakes); 4 twenty-second avatar clips ($4.00); voice $0.20; music $0.25; Claude $0.60 | about **$17.85** | about **$53.55** |
| Month's organic pack, images and copy only | 30 posts, no video | about $4.00 | about $12.00 |

### What fits inside $150 of monthly credits

| A month of work | Customer price |
|---|---|
| One organic pack with video | $53.55 |
| Six static ad sets (4 variations, three sizes) | $18.00 |
| Five 15-second videos, typical | about $40 |
| Five 30-second avatar videos | $27.00 |
| **Total** | **about $139** |

A customer who makes only static ads, carousels and copy could make more than 80 four-variation sets and not run out. A customer who makes video for several clients will use the $150 in a week or two and will need top-ups. Today's packs are $10, $25 and $50; a single video test pack costs more than the smallest pack, so the owner may want a larger pack (Section 6.4).

### Where a quote and caps are needed

Today's billing charges **after** the work and only blocks new work when the balance is at or below zero (`assertCanSpend`). That is fine for a $0.30 research step. It is not fine for video.

1. **Quote before every run that makes media.** Show the number of images and seconds of video and a price range ("about $6, at most $11"), and ask the person to confirm. Scripts and copy alone can skip it.
2. **Hold the maximum.** When the person confirms, check the balance covers the quoted maximum and hold that amount, so two videos started together cannot both spend the same credits. Release what is not used.
3. **Per-job caps in the skill's own row.** `SKILL_CAPS` in `convex/lib/caps.ts` already gives each skill its own run and day caps. Suggested starting caps for Creative Production, in real cost: $3 a run for static and copy jobs; $8 a run for a video job; $40 a day.
4. **The platform ceiling is $10 of real cost a run** (`PLATFORM_CEILING`). A month's organic pack with video costs about $18, so it must run as a parent with one child job per post, each inside the ceiling. That is also better for the user, who can approve posts one at a time.
5. **Limit retakes.** Each "try again" on a video is a new charge. Show its price on the button and cap automatic retries at one.
6. **Charge only for delivered output.** Vendors differ on whether a failed or filtered generation is billed. Record the vendor's actual charge per job and pass that on, so a blocked video is not billed at full price.
7. **Preview cheaply.** Generate the first frame or a 720p draft, let the person approve the look, then render at 1080p.

---

## 3. Legal and safety rules to build in

**Not legal advice.** Roughly half of this section is confirmed from primary sources; the rest is marked UNVERIFIED because official sites blocked automated reading (congress.gov, California and Illinois legislature sites, several Meta help pages). Counsel should review the whole section, the consent record and the upload terms before launch.

### 3.1 Copyright: structure versus expression

US copyright does not extend to "any idea, procedure, process, system, method of operation, concept, principle, or discovery" ([17 U.S.C. §102(b)](https://www.law.cornell.edu/uscode/text/17/102)). Applied to an ad:

| Structure Vistrial may model | Expression Vistrial must never copy |
|---|---|
| Hook type (question, bold claim, problem then fix) | Exact script wording, taglines, distinctive phrases |
| Pacing, number of shots, length, aspect ratio | The footage, frames, stills and graphics |
| Format (testimonial, unboxing, list) | Specific compositions and distinctive shot sequences |
| Offer structure (discount, guarantee, bonus stack) | Music, the recording, the voice performance |
| Where the call to action sits and what kind it is | Characters, mascots, a distinctive on-screen persona |

One caveat: an original selection and arrangement of unprotected elements can itself be protected, so matching every structural element one for one, in the same look, carries risk. (The case-law doctrines here were not checked against primary sources.)

**Customers may not own pure AI output.** The US Copyright Office's January 2025 report says copyright "does not extend to purely AI-generated material" and that prompts alone are not enough, but human-written text, creative edits, and creative selection and arrangement remain protected ([Copyright Office AI page](https://www.copyright.gov/ai/), [Part 2 report](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf)). Product consequences: say so plainly in the product, and keep a log of what the person wrote, edited and chose, which the version history already does.

Cases to watch (all from law-firm summaries, UNVERIFIED): Thaler v. Perlmutter (human authorship required; Supreme Court declined review in March 2026); Disney and Universal v. Midjourney (pending); Getty v. Stability AI in the UK (largely for Stability, appeal allowed on one point).

### 3.2 The similarity dial

**Recommendation: the top of the dial is "same structure, entirely new expression".**

- The reference ad is reduced to an abstract breakdown: hook type, beat sequence and timings, format, offer type, call-to-action position.
- **Generators only ever see that breakdown and the brand kit.** The reference's pixels, audio and transcript are never passed to an image, video, voice or music model, at any dial position. No image-to-image, no style transfer, no voice or music reference from the original.
- The dial changes **how many structural elements are matched**: "inspired by" keeps the hook type and format; "close match" also keeps the beat sequence, timings and call-to-action position.
- The look always comes from the customer's brand kit, never from the reference. This is what keeps a "close match" away from trade-dress trouble.

Automated checks before a draft reaches the approver (thresholds are engineering starting points, not legal standards):

| Check | Gate |
|---|---|
| Script overlap with the reference transcript | Block any shared run of 6 or more words; block above about 5% shared four-word phrases; flag close paraphrase |
| Taglines and on-screen text | Block exact or near matches |
| Frame reuse | Compare output frames with reference frames; none may match |
| Visual similarity | Flag scenes that are too close; separate check on palette and layout |
| Logos | Block any third-party logo found in the output |
| Audio | No match to the reference track |
| Voice | Block a voice close to the reference ad's speaker |
| Faces | Every face must be a consented avatar or a stock synthetic face |
| Claims | Flag health, income, before-and-after and testimonial wording for the approver |

Start with the text checks in Phase 1 (they are plain code). The image, audio and face checks arrive with video in Phase 2.

### 3.3 Likeness and voice consent

Laws at a high level (most rows UNVERIFIED against the statute text):

| Law | Point |
|---|---|
| California Civil Code §3344; AB 2602 and AB 1836 (2025) | Commercial use of a person's name, voice or likeness needs consent; digital-replica contract terms must describe the use specifically |
| New York Civil Rights Law §50–51; synthetic performer law (in force June 2026) | Consent for advertising use; ads using a synthetic performer must conspicuously disclose it |
| Tennessee ELVIS Act (2024) | Protects voice, including AI imitation |
| Illinois BIPA; Texas CUBI | Written release and a retention schedule for voiceprints and face geometry; BIPA allows private lawsuits |
| Federal NO FAKES Act | **Not law.** Reintroduced May 2026, out of Senate committee June 2026 |
| FTC rule on fake reviews and testimonials, [16 CFR 465.2](https://www.law.cornell.edu/cfr/text/16/465.2) | Unlawful to create or sell fake consumer or celebrity testimonials; the FTC names AI-generated ones ([FTC release](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials)) |
| FTC Endorsement Guides, [16 CFR 255.0](https://www.law.cornell.edu/cfr/text/16/255.0) | An endorser "could be or appear to be an individual", which covers an avatar |
| GDPR Article 9 | Biometric data used to identify a person needs explicit consent ([text](https://gdpr-info.eu/art-9-gdpr/)) |
| **EU AI Act Article 50** | In force from **2 August 2026**. Providers must mark output as machine-readable AI content; deployers must disclose deepfakes ([Article 50](https://artificialintelligenceact.eu/article/50/), [Commission page](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)). Our reading: the model vendors and Vistrial are providers; the customer who publishes is the deployer |
| Denmark (likeness bill, not passed); UK (no image right; reform under review) | Watch |

**What a stored consent record must contain.** No avatar or voice clone of a client may be created until this record exists and is complete:

| Field | Why |
|---|---|
| Full legal name, verified identity, confirmation the person is 18 or over | Publicity laws; vendors verify identity |
| A recorded consent statement, on camera or by voice, made in the same session as the training footage | Vendor practice (HeyGen, D-ID, ElevenLabs professional clones) |
| A specific description of permitted uses: which brand, which channels, paid ads or organic, territories, how long | California AB 2602 standard |
| Separate consent for face and for voice, and explicit consent to biometric processing | GDPR Article 9; BIPA |
| How long the data is kept, when it is deleted, how to revoke and what revoking does | BIPA; HeyGen gives a removal right at any time |
| A signed agreement between the agency and the person, separate from the vendor's consent | The vendor's consent only covers the vendor |
| Time, IP address, document hash, who collected it, which vendors hold the model | Audit trail |
| Recommended: the person approves each finished ad | Testimonial truthfulness |

**Revocation must work.** Revoking deletes the avatar and voice at the vendor, blocks new generation, and marks existing creatives. This follows the existing "revoked wins" rule in `convex/lib/consent.ts`.

### 3.4 Platform rules on AI-generated content

| Platform | Rule | Source |
|---|---|---|
| Meta, organic | Labels content when it detects industry AI signals or the user discloses | [Meta newsroom](https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/) |
| Meta, political and social-issue ads | Advertiser must disclose photorealistic AI images, video or realistic audio | [Meta policy post](https://www.facebook.com/government-nonprofits/blog/political-ads-ai-disclosure-policy) |
| Meta, all ads | "AI info" label on ads made with Meta's tools or detected third-party tools: **UNVERIFIED** (trade press) | |
| YouTube | "We require creators to disclose AI-generated or altered content that seems realistic" | [YouTube help](https://support.google.com/youtube/answer/14328491) |
| Google Ads | No manipulated media meant to deceive; election ads must disclose synthetic content | [Google Ads policy](https://support.google.com/adspolicy/answer/6020955) |
| TikTok, organic | Label AI content showing realistic scenes or people; reads C2PA credentials to auto-label | [TikTok guidelines](https://www.tiktok.com/community-guidelines/en/integrity-authenticity), [TikTok newsroom](https://newsroom.tiktok.com/en-us/partnering-with-our-industry-to-advance-ai-transparency-and-literacy) |
| TikTok Ads | Undisclosed AI content means the ad "will be rejected or restricted"; no public figure's likeness without permission | [TikTok disclaimers](https://ads.tiktok.com/help/article/add-disclaimers-to-ads), [TikTok ads policy](https://ads.tiktok.com/help/article/tiktok-ads-policy-misleading-and-false-content) |

**What to build:** keep the vendors' provenance marks (SynthID, C2PA) on every file and never strip them; add C2PA credentials where a vendor does not; and put a **publishing checklist** on every approved creative that tells the person which disclosure to tick on each platform. Vistrial never publishes, so the customer makes the disclosure, but Vistrial should make it hard to forget.

### 3.5 Music licensing

- An ad needs a licence for the song and a licence for the recording. A trending sound gives neither.
- Meta: "Use of music for commercial or non-personal purposes in particular is prohibited" without a licence ([Meta music guidelines](https://www.facebook.com/legal/music_guidelines)).
- TikTok: "Businesses should instead use the Commercial Music Library for all commercial TikTok activities" ([TikTok help](https://ads.tiktok.com/help/article/commercial-music-library)).
- YouTube: Content ID scans every upload and lets a rights owner block or claim it ([YouTube help](https://support.google.com/youtube/answer/2797370)).
- AI music may not be protectable and may resemble a real recording or artist.

**Rules:** never reuse or imitate the reference ad's track; never accept an artist or song name in a music prompt; licensed library for paid ads where available; say which licence each track carries on the creative's page.

### 3.6 Trademarks and logos

- The Lanham Act creates liability for uses likely to confuse people about affiliation or sponsorship, and for advertising that misrepresents goods ([15 U.S.C. §1125](https://www.law.cornell.edu/uscode/text/15/1125)).
- Naming a competitor truthfully in a comparison is permitted; using their logo or look beyond what is needed is not.
- A distinctive overall look (colours, packaging, layout) can be protected as trade dress.

**Rules:** never generate any logo; remove competitor marks and names from generation prompts; composite the customer's own logo file from the brand kit; ask the customer to confirm they own the marks they upload.

### 3.7 What to refuse

| Refuse | Why |
|---|---|
| A real person's face or voice with no complete consent record | Section 3.3; TikTok Ads policy |
| Celebrities and public figures, including sound-alikes and look-alikes | FTC rule; platform policies |
| Minors as avatars or cloned voices | Cannot consent; vendor policies |
| Political, election or social-issue ads | Special disclosure regimes; HeyGen and ElevenLabs restrict them |
| Sexual or intimate depictions of real people | TAKE IT DOWN Act ([FTC](https://www.ftc.gov/news-events/news/press-releases/2026/05/ftc-begins-enforcing-take-it-down-act)) |
| Invented testimonials, reviews or "customers" presented as real | 16 CFR 465 and 255 |
| Medical or income claims without a verified business fact behind them; before-and-after health results | Lanham Act; TikTok Ads policy. The existing evidence rules can enforce this: a claim in an ad must cite a verified business fact |
| Competitor logos, product shots or look | Lanham Act |
| Copying the reference script word for word or nearly | Copyright |
| Reusing the reference's footage, frames, faces, voice, music or logos | The owner's standing rule; copyright |
| Impersonating a business or a government body | [FTC impersonation rule](https://www.ftc.gov/legal-library/browse/rules/impersonation-government-businesses-rule) |
| Removing AI watermarks or provenance data | Vendor terms; EU AI Act |

---

## 4. How to get the reference video

Not legal advice. The short version: **only two official routes reach the actual video.** Everything else is "embed it for display, and ask the user to upload the file".

| Source | Show it (official) | Analyse the video (official) | Breaks the platform's terms |
|---|---|---|---|
| YouTube Short | YouTube's own player (already used on the research board) | **Gemini's YouTube-link input**: public videos only, in preview, no charge for now | Downloading, scraping, tools such as yt-dlp, storing the video |
| Instagram Reel | Meta oEmbed (needs App Review) | Only the user's own account, through Instagram Login | Scraping; using oEmbed data for analysis |
| TikTok video | TikTok oEmbed (already used) | None for other people's videos | Scraping or automated extraction |
| Meta Ad Library ad | Link to the ad's snapshot page | The API gives text and a link, **no video file**; coverage outside the EU and UK is political ads only | Scraping the snapshot page (UNVERIFIED, no clause read) |
| TikTok ad | Link out | EU ad metadata only | Scraping |

The clauses behind this:

- **YouTube Terms**: users may not "access, reproduce, download" content or use "automated means (such as robots, botnets or scrapers)" ([YouTube terms](https://www.youtube.com/static?template=terms)).
- **YouTube Developer Policies**: API clients must not "download, import, backup, cache, or store copies of YouTube audiovisual content" or "separate, isolate, or modify the audio or video components" ([policies](https://developers.google.com/youtube/terms/developer-policies)). Transcripts of other people's videos have no official route ([captions.download](https://developers.google.com/youtube/v3/docs/captions/download)).
- **Meta oEmbed** is "only meant to be used for embedding Instagram content in websites and apps"; deriving analysis from it is prohibited, and since November 2025 it no longer returns the thumbnail or author name ([Instagram oEmbed](https://developers.facebook.com/docs/instagram-platform/oembed), [Meta blog](https://developers.facebook.com/blog/post/2025/04/08/oembed-updates/)).
- **TikTok Terms** §3.4: no "scrape, crawl, export or otherwise extract any data or content in any form, for any purpose" by automated means ([TikTok terms](https://www.tiktok.com/legal/page/us/terms-of-service/en)). TikTok's Display API gives no video file even for the user's own videos ([video object](https://developers.tiktok.com/doc/tiktok-api-v2-video-object/)).
- **Third-party downloaders and scrapers** (Apify, "downloader" APIs) do not move the breach: our product would still be causing it. Court outcomes on scraping public data are mixed and narrow (hiQ v. LinkedIn ended in a judgment against the scraper; Meta v. Bright Data went for the scraper on logged-off public data only; both from secondary sources).

**About the Gemini YouTube route.** It is a documented Google feature, and Vistrial never downloads or stores the video. But neither Gemini's docs nor its terms say outright that it satisfies YouTube's terms, and it is in preview ([Gemini video understanding](https://aistudio.google.com/docs/video-understanding)). Treat it as the best available route, put it behind a switch, and ask counsel to confirm.

### Recommended path

1. **A source from the research board, or a pasted link.** Show it with the platform's own embed, as today. If it is a public YouTube video, analyse it through Gemini's YouTube-link input. For Instagram, TikTok and ad-library links, show the embed and ask: "Upload the video file to analyse it."
2. **An uploaded file** is the main route for everything that is not YouTube. At upload, the person confirms they have the right to submit the file for analysis and obtained it lawfully. Vistrial analyses it, keeps only the structured breakdown, short quotes of on-screen text and the original link, and **deletes the file within 24 hours**. It never builds a library of other people's video files. The breakdown is stored as a source so the creative can cite it.
3. **The user's own content** (for repurposing long video into shorts): direct upload, or later Instagram Login for their own Reels.
4. **A saved offer** needs no reference at all.

**Do not build:** any server-side download of video from a platform link; analysis fed from oEmbed responses; scraping of ad-library pages or TikTok's Creative Center; storage of YouTube video.

One more check for counsel: analysing a competitor's ad for an internal, factual breakdown, with nothing redistributed, is a comparatively favourable position under US fair use, but it is not a safe harbour.

---

## 5. Architecture sketch

This fits the existing pattern: a skill module (`convex/skills/types.ts`) that the runtime asks for its next step, tools that do the work, code checks with one revision, then a saved asset with versions and evidence for a person to approve.

### 5.1 The steps

| Step | What happens | Who does it | Existing piece it reuses |
|---|---|---|---|
| 1. Start | From a board source ("Make our version"), a pasted link, an upload or a saved offer. The person picks the brand, the output type and the dial position | Person | `sourceRefs`, `offerCards`, research projects |
| 2. Analyse reference | Break the ad into hook, beats and timings, shots, on-screen text, offer and call to action. Saved as a structured record; the upload is then deleted | Gemini (video) or Claude (image) | New tool `cp.analyse`; run artifacts |
| 3. Brief | Combine the breakdown, brand kit, business profile, verified facts and past outcomes into a creative brief | Claude | `context.read`; asset kind `creativeBrief` already exists |
| 4. Script and copy | Script, hooks, captions and the variation plan, each variation with its hypothesis | Claude | Asset kind `adCopySet` already exists |
| 5. Text checks | Overlap with the reference, banned claims, claims without a verified fact, brand voice, length per placement. One revision from the reserve | Code, then Claude once | Same shape as `marketIntelligence/checks.ts` |
| 6. **Quote and confirm** | Show what will be generated and the price range. The run waits and spends nothing | Person | The existing "ask" step |
| 7. Generate | Images, video clips, voice, music, captions. Slow jobs run in the background (5.2) | Vendors | New step kind, new tools |
| 8. Assemble | Place the logo, burn in captions, join clips, mix audio, export each placement size | Our own compositor | New (see open question on the renderer) |
| 9. Media checks | Logo and face checks, frame and audio comparison with the reference, provenance marks present, sizes and lengths right | Code | New |
| 10. Save | A creative asset, version 1, with evidence rows | Runtime | `assets`, `assetVersions`, `evidence` |
| 11. **Approve** | Owner or Manager approves, rejects or asks for a revision. Only approved files can be downloaded as finals, with the publishing checklist | Person | `assets.approve`, `requestRevision` |

**Human approval sits in three places:** confirming the quote (step 6), approving the creative (step 11), and, for any real person's likeness, the consent record before anything is generated. Vistrial never publishes.

**Evidence.** The existing claim rules carry over well:

- "Structure modelled on this ad": an **observed** claim citing the reference source.
- Any factual claim in the ad (a price, a result, a guarantee): **your data**, citing a verified business fact. An ad claim with no source cannot be approved, which is already the server rule.
- "A question hook will beat a claim hook for this audience": an **untested hypothesis**, which is exactly what a variation is.

### 5.2 Slow video jobs

Today a model step runs inside one action. A video can take minutes and must not hold an action open (Convex's Node actions stop at 10 minutes; [Convex limits](https://docs.convex.dev/production/state/limits)).

- Add a third kind of waiting step, a **job**, beside the existing "ask": the tool submits the job to the vendor, records it and ends. The run waits and spends nothing, exactly like a question waiting for a person.
- A new table, `creativeJobs`: workspace, run, step, vendor, the vendor's job ID, status, quoted cost, actual cost, attempt count, result file.
- The vendor calls a webhook in `convex/http.ts` when it finishes (verified by signature). A scheduled check every minute or so is the backstop for vendors without webhooks or a lost call.
- When the job finishes, the file is copied into our storage, the actual cost is charged, and the run resumes.
- Each job has an idempotency key, so a retry never pays twice. A job that exceeds its time limit is cancelled and not charged.
- Several jobs (ten hook variations) run in parallel; the run resumes when all have finished or failed.

### 5.3 Storing large files

- Files are 1–5 MB for an image and 15–60 MB for a 30-second 1080p video. Today's upload limit is 10 MB (`MAX_FILE_BYTES` in `convex/files.ts`) and only images, PDFs and CSVs are accepted.
- Convex storage costs about $0.03 per GB a month with 100 GB included on the Professional plan, and data leaving costs about $0.12 per GB ([Convex pricing](https://www.convex.dev/pricing)). A customer making 50 videos a month adds about 2 GB.
- **Recommendation:** Convex storage for Phase 1 (images are small). For video in Phase 2, decide between Convex storage and an object store with cheap delivery such as Cloudflare R2, with Convex holding only the record. Either way files move server to server by link, never through function arguments (5 MB limit).
- A version of a creative has many files (each size, each variation), but `assetVersions` holds one file today. Add a `creativeFiles` table: asset version, variation key, placement, type, file, size, length, model used, and provenance.
- Retention: reference uploads deleted within 24 hours; rejected drafts deleted after 30 days; approved creatives kept until the customer deletes them.

### 5.4 Variations and the outcome loop

`decisions` already records "we chose to try this, here is the baseline, check back in 14 to 90 days, here is what happened", and feeds results to the next piece of research.

- Add a third `itemKind`, **`creativeTest`**, beside `offerChange` and `roadmapStep`. It points at the creative asset and stores the variation keys in the test and the hypothesis for each.
- When a test pack is approved, the person clicks "We are running this", picks a check-in date, and the baseline is read from their Meta results as today.
- Each exported file carries a short code in its file name (for example `VT-7Q2-B`). If the person keeps that code in the ad name, results can be matched to the variation. Today's Meta snapshot stores campaign totals only, so matching per ad needs a small extension to the Meta sync (open question).
- At check-in the person records the winner. That writes the outcome, and the next brief reads "question hooks beat claim hooks for this brand" as known context. The de-identified `learningSignals` row works unchanged.

### 5.5 What a brand kit stores

One per workspace for the agency, consultant or coach, and one per client. Every creative belongs to exactly one brand.

| Group | Fields |
|---|---|
| Identity | Brand name, whose it is (own or client), website, industry |
| Logos | Real logo files (light, dark, icon), clear-space rule, a confirmation that the customer owns them |
| Look | Colours as hex values, fonts (names and licensed files), image style notes, reference images of products and people |
| Voice | Tone description, words to use and avoid, example copy that worked |
| Offer links | Which saved offers belong to this brand |
| Rules | Required disclaimers, regulated-industry flag (health, finance), claims that need a verified fact, banned topics |
| People | Approved avatars and voices, each linked to its consent record and expiry |
| Placements | Default sizes and platforms |
| Music | Preferred moods; licensed tracks owned |

The kit is versioned like the business profile, so an approved creative records which kit version it used.

Other new tables: `likenessConsents` (Section 3.3) and `creativeJobs` (5.2). New asset kinds: `adCreative`, `videoCreative`, `landingPagePack`; `contentCalendar` already exists for the organic pack. New work tab: `work/creative` beside Research, Offers and Diagnostics. The catalog line for Creative Production ("Copy and creative briefs, original and sourced") will need new words.

### 5.6 Landing page and VSL pack

> **SLOT: the owner's landing-page framework goes here.** The owner will provide it. Nothing in this document invents one. Until it arrives, the landing page and VSL pack is out of Phases 1 and 2. When it arrives it becomes a template the skill fills in: the section order, what each section must contain and the checks each must pass. The VSL script, hero images and video would reuse the pieces above.

---

## 6. Phased build plan

Effort is in weeks for one engineer working with AI coding agents at the pace of the earlier phases. These are rough and assume the vendor choices above hold.

### 6.1 Phase 1: static ads and copy (about 3–4 weeks)

**Includes:**

- Brand kits (agency and per client), with logo upload and versions.
- All four starting points: board source, pasted link, uploaded file, saved offer.
- Reference breakdown: images through Claude; public YouTube links through Gemini; uploaded video files up to a modest size, deleted after analysis.
- Similarity dial with the text checks.
- Outputs: static image ads and carousels in the main placement sizes, with the real logo composited; scripts, hooks and captions; a 4-variation set.
- Pre-run quote, credit hold and per-job caps.
- Variations linked to `decisions` as `creativeTest`.
- The Creative work tab, the approval screen and the publishing checklist.
- A two-day bake-off first: the same ten briefs through the default and fallback image models, judged on text accuracy, brand fit and speed.

**Why this is the smallest valuable slice.** It delivers the whole promise ("make our version of that ad, on brand, ready to approve") for the cheapest and fastest output type. It needs no background jobs, no large files and no consent records, which are the three riskiest pieces. It exercises everything that later phases depend on: brand kits, the reference breakdown, the dial, the quote, the checks, and the outcome loop. And scripts for video are useful on day one even before Vistrial can render the video.

### 6.2 Phase 2: video without people (about 5–7 weeks)

- Background jobs, webhooks and large-file storage.
- 9:16 video, 6–30 seconds, from text and from an approved still.
- Stock voiceover, music (generated first, licensed library when the deal is signed), captions.
- The compositor: logo, captions, joining clips, audio mix, export sizes.
- Resize and repurpose for every placement.
- Media checks (logo, frame, audio, provenance).
- Hook-swap video test packs.
- Start the HeyGen, ElevenLabs and Epidemic Sound commercial conversations now, so they are done before Phase 3.

### 6.3 Phase 3: people, long video and packs (about 6–8 weeks)

- Consent records and their screens, including revocation.
- Stock AI presenters; the user's own avatar and voice; then a client's avatar and voice.
- Long video cut into shorts with captions (the user's own uploads).
- The month's organic content pack, as a parent job with one child per post.
- The landing page and VSL pack, **once the owner's framework is provided**.
- Per-ad results matching for variations.

### 6.4 Open questions for the owner

1. **Landing-page framework.** When will it be provided? Phase 3 depends on it.
2. **Enterprise and OEM agreements.** HeyGen and ElevenLabs standard terms restrict offering their service to our customers' clients. Are you willing to sign enterprise agreements with minimum spend? If not, the client-avatar mode needs a different vendor (D-ID or Tavus, both needing their terms confirmed).
3. **Music.** Is a licensed library (Epidemic Sound, by quote) worth its cost at launch, or do we ship generated instrumentals with a clear "no indemnity" note and add the library later?
4. **Top-up size.** A video test pack costs about $15 and the smallest pack is $10. Add a $100 pack? Should video have its own monthly allowance?
5. **Markup on video.** 3× on a $3.45 video is $10.35. Is 3× right for media, or should expensive media carry a lower multiple?
6. **Similarity ceiling.** Do you accept "same structure, entirely new expression, look always from the brand kit" as the top of the dial?
7. **YouTube analysis.** Are you comfortable using Gemini's YouTube-link feature (documented, but in preview and not expressly blessed by YouTube's terms), or should Phase 1 be upload-only until counsel confirms?
8. **Invisible watermarks.** Google's models always add SynthID, and platforms may label the content as AI. Is that acceptable to your customers? (It is also what the EU rules expect.)
9. **Regulated industries.** Coaches make income and health claims. Block these outright, or allow them only with a verified business fact?
10. **EU and UK customers.** Some features are restricted there (uploads of people in Google's video model; AI Act duties). Launch US-first?
11. **Who approves a client's creative?** The agency's Owner or Manager only, or should the client get a review link?
12. **The renderer.** Captions, logo placement and clip joining need a video compositor. This was not researched: build on a hosted rendering service or run our own? It needs a short spike at the start of Phase 2.
13. **Legal review.** Who is counsel, and when can they review Sections 3 and 4, the consent record and the upload terms?
14. **Per-ad results.** Should the Meta connection read ad-level results so variation winners are measured, not typed in?

---

## Appendix: what could not be verified

Confirm these directly before relying on them:

- **Prices:** OpenAI gpt-image-2.6 per image; Ideogram; Veo on Vertex; Kling direct; Luma in dollars; Pika; HeyGen's official per-second rates; D-ID; Google and Azure voice; licensed music libraries.
- **Terms:** OpenAI output ownership and indemnity; Google's indemnity for image and video models; Kling, Luma, Pika, D-ID and Synthesia terms; Recraft's developer terms; fal's output rights; whether ElevenLabs needs OEM terms for our use.
- **Latency and rate limits:** nearly all vendors. Measure in the bake-off.
- **Law:** most US state statutes and the NO FAKES status came from law-firm summaries; the EU AI Act grace period to December 2026 for existing systems is from secondary sources.
- **Platform rules:** Meta's "AI info" label on all ads; Meta Sound Collection for ads; whether TikTok advertisers may upload their own licensed music; Meta Ad Library API terms.
- **Not researched:** video rendering services; Artlist; Gemini text-to-speech; TikTok Symphony; Together, Runware and OpenRouter.
