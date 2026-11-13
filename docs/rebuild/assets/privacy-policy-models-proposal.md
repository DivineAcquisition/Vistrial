# Proposed privacy policy wording for GPT, Gemini and OpenRouter

**A proposal, not a change.** Nothing here is live. The owner decides the wording and the day; a lawyer
should read it first (see "For a lawyer" in `../models-and-openrouter.md`, section 4). When approved, the
edits below go into `src/lib/trust/privacy-policy.ts` and `src/lib/trust/terms-of-service.ts`, the
"Last updated" date changes, the test `src/lib/trust/privacy-policy.test.ts` is updated (it asserts today
that the policy never says "OpenAI"), and OpenRouter, Microsoft and Google are added to the public
sub-processor list by a Platform Admin the same day. Only then is `MODEL_FAMILIES` set.

Rules kept: plain words, no claim the product does not enforce, and no sentence about training outside the
`aiNoTraining` switch.

## 1. Section 6, "Service providers. ... Today they are:"

```diff
- "Anthropic, which provides the AI models our agents use, including their web search and web page reading.",
+ "Anthropic, which provides the Claude AI models our agents use, including their web search and web page reading.",
+ "Google, which provides the AI models that make ad images and read reference videos, and, when your team chooses a Gemini model, the model that does that piece of work.",
+ "OpenRouter, which passes a piece of work to the AI model your team chose when that model is GPT or Gemini.",
+ "Microsoft, whose Azure service runs OpenAI's GPT models for us when your team chooses GPT.",
```

Note: the Google line's first half is already true today (images and reference videos go to Google
directly) and is missing from the current policy. It can go live on its own, before anything else here.

## 2. Section 7, "How our AI features use information", first paragraph

```diff
- "Vistrial uses AI to research, sort, and write inside a customer workspace. When an agent runs, the relevant workspace information and the public sources it found are sent to our AI provider, Anthropic, to do that work. Web searches and web page reading for research also run through Anthropic.",
+ "Vistrial uses AI to research, sort, and write inside a customer workspace. When an agent runs, the relevant workspace information and the public sources it found are sent to the AI model that does the work. Unless your team chooses otherwise, that is a Claude model from Anthropic, and web searches and web page reading for research also run through Anthropic.",
+ "Your team can choose a GPT model or a Gemini model for a piece of work, or as the default for your organization. That work is then sent through OpenRouter to the model's host: Microsoft Azure for GPT, Google Cloud for Gemini. We ask OpenRouter to use only hosts on its zero data retention list and only hosts that do not collect the content. A web search made by one of these models runs on that host's own search service. Each result in Vistrial shows which model made it.",
+ "Ad images are made by Google's image models, and reference videos you add are read by a Google model. The image request holds the description of the picture, and for a designed ad, pictures of your own past ads from your brand kit.",
```

## 3. Section 7, the list under it (always shown)

```diff
+ "OpenRouter keeps a record of each request's size and timing, not its content, and checks all traffic for child sexual abuse material. Google may keep a request its safety systems flag for up to 90 days to investigate abuse.",
```

## 4. The `aiNoTraining` sentence (shown only when a Platform Admin has confirmed the provider settings)

No change to the words: "Customer workspace information is not used to train those providers' models."
Before the switch is left on with GPT and Gemini offered, a Platform Admin confirms the OpenRouter account
settings in `../models-and-openrouter.md`, section 4, and a lawyer answers question 3 there.

## 5. Terms of Service, the AI list

```diff
- "Anthropic provides the AI models our agents use, including their web search and web page reading.",
+ "Anthropic provides the Claude AI models our agents use, including their web search and web page reading. If your team chooses a GPT or Gemini model, that work runs on OpenAI's models hosted by Microsoft or on Google's models, reached through OpenRouter. Google's models make ad images and read reference videos.",
```

## What this wording deliberately does not say

- That GPT or Gemini work is never retained: Google's hosts may keep flagged requests (Safety Retention).
- That processing stays in any region.
- Anything about OpenAI as a company receiving content: with the settings sent, GPT runs on Microsoft
  Azure, and OpenAI's own endpoints are excluded.
