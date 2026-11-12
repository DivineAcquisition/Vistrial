/**
 * Takes the product pictures on the public landing page from the dev stories, so every picture is a
 * real screen with sample data. Run `npm run dev`, then `node scripts/capture-landing-pictures.cjs`
 * (add picture names to retake only those).
 * Playwright is not a project dependency: use a machine that has it (for example `npx -p playwright node ...`).
 * Each picture is cut from one text marker to another, in the white theme: the public site is white only.
 * To add a picture (see PICTURES in src/lib/marketing/landing.ts), add its story here.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script; Playwright is not a project dependency.
const { chromium } = require("playwright");

const ORIGIN = process.env.STORY_ORIGIN ?? "http://localhost:3000";
const OUT = "public/marketing/product";
const WIDTH = 1280;

/** from/to: visible text that marks the top and bottom edge. width: the screen width, 1280 unless given. column: the text whose row sets the left and right edge, when the first marker is narrower than the screen it sits in. trim: extra cut from the bottom. pad: extra kept at the bottom. maxWidth: the widest the cut may be. lift: extra kept at the top. */
const SHOTS = [
  { name: "offer-compare", story: "/dev/offers-tab?state=full", from: "You vs competitors", to: "Highlighted: a competitor states this" },
  { name: "test-plan", story: "/dev/offers-tab?state=full", from: "Test plan", to: "Ask retained clients for a referral", toEdge: "top" },
  { name: "page-teardown", story: "/dev/pages-tab?state=full", from: "Page by page", to: "Problem agitation", toEdge: "top" },
  { name: "ad-set", story: "/dev/creative-tab?state=full", from: "Four variations to test", to: "Video script", toEdge: "top" },
  // The Tasks board: the first three columns as the screen shows them, then the Result column as a phone shows it.
  { name: "tasks-board", story: "/dev/tasks?state=busy", width: 1340, from: "Waiting for an Owner or Admin", to: "Find why Northlight's own enquiries slowed", toEdge: "top", trim: 30, maxWidth: 962 },
  { name: "tasks-result", story: "/dev/tasks?state=busy&column=result", width: 430, from: "What was measured at the check-in", to: "Skipped", toEdge: "top" },
  // One approval in the Briefing. The cut starts under the filter row (industry trends are off by default, so their tab is left out) and stops before the next post.
  { name: "briefing-approval", story: "/dev/briefing?state=busy&kind=approval", from: "Proposed: Test a two-call close", lift: 34, to: "Approve a change in Practice CRM", toEdge: "top", trim: 34 },
  // Home: the question box is narrower than the lists under it, so the cut takes its sides from the "Needs you" row.
  { name: "home", story: "/dev/home?state=busy", width: 1100, from: "What should Vistrial work on?", column: "Needs you", to: "In motion", toEdge: "top" },
  { name: "organizations-clients", story: "/dev/clients?view=page&state=owner&open=c1", from: "Executive coaching for new directors", to: "Sam Patel", pad: 44 },
];

(async () => {
  const browser = await chromium.launch();
  // Name pictures after the script to retake only those: `node scripts/capture-landing-pictures.cjs home`.
  const only = process.argv.slice(2);
  for (const shot of SHOTS.filter((shot) => only.length === 0 || only.includes(shot.name))) {
    const width = shot.width ?? WIDTH;
    const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${ORIGIN}${shot.story}&theme=light`, { waitUntil: "networkidle" });
    // The dev tools badge is not part of the product.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    const top = await page.getByText(shot.from, { exact: false }).first().boundingBox();
    const end = await page.getByText(shot.to, { exact: false }).first().boundingBox();
    if (!top || !end) throw new Error(`${shot.name}: marker not found`);
    // The column the picture sits in: the nearest ancestor of the first marker that is wider than half the screen.
    const column = await page.getByText(shot.column ?? shot.from, { exact: false }).first().evaluate((node, half) => {
      let el = node.parentElement;
      while (el && el.getBoundingClientRect().width < half) el = el.parentElement;
      const box = (el ?? document.body).getBoundingClientRect();
      return { x: box.x, width: box.width };
    }, width / 2);
    const y = Math.max(0, top.y - 14 - (shot.lift ?? 0));
    const bottom = (shot.toEdge === "top" ? end.y - 14 : end.y + end.height + 14) - (shot.trim ?? 0) + (shot.pad ?? 0);
    const x = Math.max(0, column.x - 8);
    const clip = { x, y, width: Math.min(width - x, column.width + 16, shot.maxWidth ?? Infinity), height: bottom - y };
    await page.screenshot({ path: `${OUT}/${shot.name}.png`, fullPage: true, clip });
    console.log(shot.name, Math.round(clip.width * 2), Math.round(clip.height * 2));
    await context.close();
  }
  await browser.close();
})();
