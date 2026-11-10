# Page reader

Date: 2026-11-10. How Vistrial opens a public web page and returns what is on it. This is the first of
three pieces: the reader (this document), the landing page teardown skill that uses it, and acting inside a
customer's own accounts with approval (`browser-with-approval.md`, design only).

## What it returns

For each page: the title and description, the text in reading order as blocks (headings with their level,
paragraphs, list items, FAQ questions), every button and button-styled link with where it goes, every form
with its fields and labels, images with their alt text, embeds (a video, a booking widget) by host, and
basic facts: word count, counts of headings, buttons, forms, images, scripts, the number of links in the
header, whether the header looks fixed, and the HTML's size.

With a hosted browser set up it also returns a full-page screenshot at 1280 and 390 wide, and reads the
page after its scripts have run.

"Load weight" is the HTML only (decompressed and as transferred). It is not the weight of the page's
images and scripts: the reader does not download them.

## How the browser is run

Convex actions cannot run Chromium, so there were three choices.

| Option | What it gives | Why or why not |
|---|---|---|
| Plain request and HTML parse, in a Convex Node action | Text, structure, buttons, forms, images. No screenshot, and no content a page builds with scripts | Needs no vendor and no key. It is also where the safety rules have to live anyway (address checks at connect time, robots.txt, rate limit). **Built, and always runs.** |
| Hosted browser called over HTTPS | Screenshots at both widths and script-built content | No browser to host or patch. **Built behind an interface, on when a key is set.** |
| Chromium inside a Vercel function | The same as a hosted browser, with no vendor | A 50 MB+ function with slow cold starts, and it would open customer-named links from inside our own infrastructure, which is the riskiest place to run a browser. Not chosen. |

The reader therefore always makes the plain request first. It decides whether the page may be read at
all (below), and it gives the final address after redirects. Only then, and only if a hosted browser is set
up, the browser is asked to draw that final address.

### Which hosted browser

Cloudflare Browser Run (called Browser Rendering until April 2026), through its REST `snapshot` endpoint.

- Its requests are always signed and flagged as bot traffic and that cannot be turned off; it has no
  stealth mode, no CAPTCHA solving and no rotating addresses. The others (Browserbase, Browserless,
  Firecrawl, Steel) offer those as features, some on by default. The owner's rule is no evasion, so the
  vendor that cannot evade is the one that fits.
- One HTTPS call returns the rendered HTML and a screenshot. No websocket, no SDK.
- About $0.001 for the two renders a page needs ($0.09 per browser hour; 10 hours a month are included on
  the paid plan). The free plan allows one request every 10 seconds and 10 browser minutes a day, which is
  enough to try it.

Not verified against a live account: no Cloudflare key exists yet. The request and response shapes are
from Cloudflare's API reference as read on 2026-11-10. Cloudflare's docs show the path as both
`browser-rendering` and `browser-run` during the rename; the code tries the first and falls back to the
second on a 404.

### What the owner sets up

Two settings on the Convex deployment (never in the repository, never printed):

- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account id.
- `CLOUDFLARE_BROWSER_TOKEN`: an API token with the permission "Browser Run - Edit" (it may still be
  listed as "Browser Rendering - Edit").

With neither set, everything except screenshots works. The quote a person sees before a job says which
mode they are in.

## The rules a read obeys

These apply to the link as typed and again to every redirect.

1. **Public addresses only.** Only `http` and `https`, only the standard ports, no user name or password
   in the link. Loopback, link-local (where cloud metadata lives), private ranges, carrier-grade NAT, and
   their IPv6 forms (including IPv4-mapped, NAT64 and 6to4 addresses that wrap a private IPv4) are refused.
   The check runs inside the connection's own DNS lookup, so the address that was checked is the address
   that is connected to; a name that resolves to any private address is refused outright. Redirects are not
   followed by the HTTP client: each one comes back and is checked as a new link.
2. **robots.txt.** Fetched once per site and kept for a day. The group naming `VistrialBot` wins over
   `*`; the longest matching rule wins. A missing robots.txt means nothing is disallowed. One that cannot be
   read (server error, no answer) means the site is left alone, and asked again after ten minutes.
3. **Rate limit per site.** At least four seconds between requests to one site, across every workspace.
   A longer `Crawl-delay` is honoured up to 20 seconds; a site asking for more is left alone. If a site's
   next slot is more than 25 seconds away the page is reported as "try again in a minute", not queued.
4. **Honest identity.** Every request says `VistrialBot/1.0 (+https://vistrial.io/bot)`, and that page
   explains what it is and how to block it. No cookies are kept between requests.
5. **No way around a "no".** A 401, a login form, a 403, a 429 or a bot check is reported as blocked, in
   words, after one request. Nothing is retried with a different identity, and nothing is solved.
6. **Limits.** 8 pages a job, 80 pages a workspace a day, 2 MB of HTML a page (counted after
   decompression), 20 seconds a request, 60 seconds a page, 5 redirects.

## Page content is untrusted

Text a person cannot see is left out when a page is read: hidden elements, comments, scripts. What remains
is still only data. It is stored as JSON and shown as text. Nothing in this piece hands it to a model. The
teardown skill does, and there it is always wrapped as untrusted content with a system instruction that it
is never an instruction, as every other skill does with outside text.

## Credits

Like the other paid work, a person sees the most a job can cost before it starts and confirms that number.

- A page read by plain request costs us about 0.1 cents; with the hosted browser, 0.5 cents (two renders
  and two stored screenshots, with room). Customers pay that times the markup (3x), rounded up to a cent
  for the job.
- The maximum is held from the balance while the job runs. Only pages that were actually read are
  charged; blocked and failed pages are free.
- When an agent run asks for pages (the teardown skill), the run carries the cost under its own cap, and
  the job charges nothing itself.

## What is not built

- No crawling: the reader opens the pages it is given and follows no links.
- No reuse of a recent read of the same page. Each job reads its pages again.
- No measurement of layout (what is above the fold, what is fixed on scroll). The "fixed header" fact is
  a hint from class names. A screenshot shows the layout to a person; nothing reads it yet.
