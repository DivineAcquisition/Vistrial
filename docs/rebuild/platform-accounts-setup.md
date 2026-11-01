# Platform accounts for Growth Architect research

Owner: the business (Vistrial), not a personal account. Decision D4 in `growth-architect-v1-plan.md`.

Menu names change often. If a step does not match what you see, follow the closest option and note it here. Never paste keys into a chat or commit them. Each key goes on the Convex **dev** deployment first (Settings, Environment Variables), and later on production.

---

## 1. YouTube Data API (V1)

Used for: searching YouTube for videos and Shorts, and showing them with the official embed.

1. Go to the Google Cloud console and create a project named **Vistrial**, under the business's Google account.
2. Open **APIs & Services → Library**, search for **YouTube Data API v3**, and click **Enable**.
3. Open **APIs & Services → Credentials → Create credentials → API key**.
4. Edit the key and set **API restrictions → Restrict key → YouTube Data API v3**. The key is used only from our server, so no website restriction is needed.
5. On the Convex dev deployment, add `YOUTUBE_API_KEY` with the key as its value.
6. **Ask for more quota.** The default allows only about 100 searches a day for the whole app, which a handful of research runs will use up. Google's form is the "YouTube API Services Audit and Quota Extension Form". It asks how the app uses YouTube data and checks that we follow the YouTube API Services Terms. Answers to give:
   - We search public videos to show them to the business that asked, through YouTube's embed player, with a link to YouTube.
   - We do not download, store or rehost video files.
   - We store only the video id, title, channel, publish date and a short note.
   - Estimate: about 20 searches per research run.

**Time:** the key works in minutes. The quota review can take weeks.

---

## 2. Meta developer app (V1 embeds, V1.1 Instagram search)

Used for: showing Instagram posts and Reels with the official embed (V1), searching Instagram by hashtag through the customer's own Business account (V1.1), and Meta's Ad Library API where it applies.

### 2a. Business setup (do first)

1. Make sure Vistrial has a **Meta Business portfolio** (business.facebook.com), owned by the business.
2. Start **Business verification** in the portfolio's Security Center. It needs the legal business name, address and a document such as a business registration or utility bill. Several app permissions need a verified business.

### 2b. Create the app

1. Go to developers.facebook.com, **My Apps → Create app**, choose the **Business** type, and connect it to the Vistrial portfolio.
2. In **App settings → Basic**, fill in:
   - **Privacy policy URL**: https://vistrial.io/privacy (the site has one).
   - **Terms URL**: https://vistrial.io/terms.
   - **Data deletion instructions URL**: https://vistrial.io/privacy/requests, if that page explains how to ask for deletion. Check it says so in plain words before submitting.
   - An app icon and a contact email.

### 2c. Request features through App Review

| Feature or permission | For | When |
|---|---|---|
| **oEmbed Read** | Instagram and Facebook post embeds on the Research Board | Apply now, V1 |
| **Instagram Public Content Access** and **instagram_basic** | Hashtag search with the customer's own Instagram Business account | Apply now, used in V1.1 |

App Review asks for a screen recording of the feature and a written explanation of each permission. I'll write the explanations, and record the screencast once the Research Board runs on dev.

**Hashtag search limits:** each Instagram Business account can search 30 different hashtags in a rolling 7 days. The search runs on the customer's account, so this limit is per customer, not shared.

### 2d. Meta Ad Library API

1. The account that calls the API must confirm its identity at facebook.com/ID. This is for a person, not the app.
2. Then the Ad Library API is available to the app.
3. **Coverage:** ads about social issues, elections or politics everywhere, and all ads delivered in the EU and UK. Ordinary commercial ads outside the EU and UK are not in the API, so for those the board shows link-outs and analyzes links people paste in.

### 2e. Keys

On the Convex dev deployment, add `META_APP_ID` and `META_APP_SECRET`. Customer tokens for hashtag search come later, through a connect flow, and are stored per workspace, never in environment variables.

**Time:** creating the app takes minutes. Business verification and App Review often take one to several weeks, and may come back with questions.

---

## 3. Not applying for now

- **TikTok Commercial Content API.** Access is for approved researchers, and the data is mostly European ads. V1 uses TikTok's public embed for links found by web search or pasted in.
- **Google Ads Transparency Center.** There is no official API. Link-outs only.

## Checklist

- [ ] Google Cloud project created, YouTube Data API enabled, key restricted
- [ ] `YOUTUBE_API_KEY` set on Convex dev
- [ ] YouTube quota extension submitted
- [ ] Meta Business portfolio verified
- [ ] Meta app created with privacy, terms and data deletion URLs
- [ ] App Review submitted for oEmbed Read
- [ ] App Review submitted for Instagram Public Content Access and instagram_basic
- [ ] Identity confirmed for the Ad Library API
- [ ] `META_APP_ID` and `META_APP_SECRET` set on Convex dev
