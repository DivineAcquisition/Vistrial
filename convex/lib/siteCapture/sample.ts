/**
 * A made-up coaching business's website, for tests: a home page with a header logo, brand colours in its
 * styles, a Google font, structured data and links to its pricing, booking, free guide and about pages.
 * Nothing here is a real business.
 */

export const SAMPLE_SITE = "https://northbound-coaching.example.com/";

export const SAMPLE_HOME = `<!doctype html><html lang="en"><head>
<title>Northbound Coaching | Business coaching for agency owners</title>
<meta name="description" content="Coaching for agency owners who want calmer growth.">
<meta name="theme-color" content="#1f6f5c">
<meta property="og:image" content="https://northbound-coaching.example.com/share.jpg">
<link rel="apple-touch-icon" href="/touch.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter:wght@400;600&display=swap">
<link rel="stylesheet" href="/assets/site.css">
<style>
:root { --brand-primary: #1f6f5c; --brand-accent: #e8a33d; --grey-100: #f4f4f4; }
body { font-family: "Inter", sans-serif; color: #222222; background: #ffffff; }
h1, h2 { font-family: "Fraunces", Georgia, serif; }
.btn-primary { background-color: #1f6f5c; color: #ffffff; }
</style>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ProfessionalService","name":"Northbound Coaching","logo":"https://northbound-coaching.example.com/logo.png","sameAs":["https://www.instagram.com/northboundcoaching","https://www.linkedin.com/company/northbound-coaching"],"address":{"@type":"PostalAddress","addressLocality":"Leeds","addressCountry":"UK"}}</script>
</head><body>
<header><a href="/"><img src="/logo.png" alt="Northbound Coaching logo" class="site-logo"></a>
<nav><a href="/pricing">Pricing</a><a href="/book">Book a call</a><a href="/free-guide">Free guide</a><a href="/about">About</a></nav></header>
<main>
<h1>Grow your agency without working weekends</h1>
<p>We help agency owners doing $20k a month build a team that delivers without them.</p>
<a class="btn btn-primary" href="/book">Book a free strategy call</a>
<section><h2>What clients say</h2><blockquote>"We went from 6 to 14 retainers in nine months." Priya Shah, founder of Brightline Media</blockquote></section>
<section><h2>Our promise</h2><p>If you do the work and don't add two retainers in 90 days, we coach you free until you do.</p></section>
</main>
<footer><a href="/privacy">Privacy policy</a><a href="https://www.instagram.com/northboundcoaching">Instagram</a></footer>
</body></html>`;

export const SAMPLE_PRICING = `<!doctype html><html><head><title>Pricing | Northbound Coaching</title></head><body>
<main><h1>Agency Growth Program</h1>
<p>Twelve weeks of coaching for agency owners. $2,500 paid in full, or three payments of $900.</p>
<ul><li>Weekly group coaching calls</li><li>Hiring and delivery playbooks</li><li>Private community</li></ul>
<a class="btn" href="/book">Apply now</a></main></body></html>`;

export const SAMPLE_BOOK = `<!doctype html><html><head><title>Book a call | Northbound Coaching</title></head><body>
<main><h1>Book your free strategy call</h1><p>Pick a time that suits you. The call takes thirty minutes.</p>
<iframe src="https://calendly.com/northbound/strategy"></iframe></main></body></html>`;

export const SAMPLE_GUIDE = `<!doctype html><html><head><title>Free guide | Northbound Coaching</title></head><body>
<main><h1>The Retainer Roadmap</h1><p>A free guide to turning one-off projects into monthly retainers.</p>
<form action="/subscribe" method="post"><label for="e">Your email</label><input id="e" type="email" name="email" required><button type="submit">Send me the guide</button></form></main></body></html>`;

export const SAMPLE_ABOUT = `<!doctype html><html><head><title>About | Northbound Coaching</title></head><body>
<main><h1>About Northbound</h1><p>Founded by a former agency owner who sold her agency in 2023. We are based in Leeds and work with agencies across the UK.</p></main></body></html>`;

export const SAMPLE_CSS = `.site-header{background:#fff}.btn,.button{background:#1f6f5c;border-color:#1f6f5c}a{color:#1f6f5c}.highlight{color:#e8a33d}.muted{color:#777}`;

/** A 1x1 PNG, as the logo file. */
export const SAMPLE_LOGO = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

/** What a well-behaved model would answer about the sample site, plus one invented item of each kind for the checks to drop. */
export const SAMPLE_WORDS = {
  name: { text: "Northbound Coaching", pageId: "p1", quote: "Northbound Coaching" },
  tone: {
    text: "Direct and calm, speaking to agency owners as peers. Short, plain sentences.",
    quotes: [
      { pageId: "p1", quote: "Grow your agency without working weekends" },
      { pageId: "p1", quote: "We help agency owners doing $20k a month build a team that delivers without them." },
      { pageId: "p1", quote: "We are the number one coaching firm in Europe." },
    ],
  },
  audience: { text: "agency owners doing $20k a month", pageId: "p1", quote: "We help agency owners doing $20k a month build a team that delivers without them." },
  location: { text: "Leeds", pageId: "p5", quote: "We are based in Leeds and work with agencies across the UK." },
  offers: [
    {
      name: "Agency Growth Program",
      price: "$2,500",
      included: ["Weekly group coaching calls", "Hiring and delivery playbooks", "Private community", "Lifetime access"],
      guarantee: "",
      terms: "or three payments of $900",
      pageId: "p3",
      quote: "Twelve weeks of coaching for agency owners. $2,500 paid in full, or three payments of $900.",
    },
    { name: "VIP Day", price: "$5,000", included: [], guarantee: "", terms: "", pageId: "p3", quote: "A VIP day with the founder for $5,000." },
    { name: "The Retainer Roadmap", price: "$49", included: [], guarantee: "", terms: "", pageId: "p4", quote: "A free guide to turning one-off projects into monthly retainers." },
  ],
  proof: [
    { text: "A client grew from 6 to 14 retainers", pageId: "p1", quote: "\"We went from 6 to 14 retainers in nine months.\" Priya Shah, founder of Brightline Media" },
    { text: "Featured in Forbes", pageId: "p1", quote: "As featured in Forbes" },
  ],
  guarantees: [{ text: "Coaching free until two retainers are added", pageId: "p1", quote: "If you do the work and don't add two retainers in 90 days, we coach you free until you do." }],
};
