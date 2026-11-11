/**
 * Takes the product pictures on the public landing page from the dev stories, so every picture is a
 * real screen with sample data. Run `npm run dev`, then `node scripts/capture-landing-pictures.cjs`.
 * Playwright is not a project dependency: use a machine that has it (for example `npx -p playwright node ...`).
 * Each picture is cut from one text marker to another, in the white theme: the public site is white only.
 * To fill a planned slot (see PICTURES in src/lib/marketing/landing.ts), add its story here.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script; Playwright is not a project dependency.
const { chromium } = require("playwright");

const ORIGIN = process.env.STORY_ORIGIN ?? "http://localhost:3000";
const OUT = "public/marketing/product";
const WIDTH = 1280;

/** from/to: visible text that marks the top and bottom edge. pad: space kept around the cut. */
const SHOTS = [
  { name: "offer-compare", story: "/dev/offers-tab?state=full", from: "You vs competitors", to: "Highlighted: a competitor states this" },
  { name: "test-plan", story: "/dev/offers-tab?state=full", from: "Test plan", to: "Ask retained clients for a referral", toEdge: "top" },
  { name: "research-approve", story: "/dev/research-tab?state=full", from: "Results", to: "Sessions", toEdge: "top" },
  { name: "page-teardown", story: "/dev/pages-tab?state=full", from: "Page by page", to: "Problem agitation", toEdge: "top" },
  { name: "ad-set", story: "/dev/creative-tab?state=full", from: "Four variations to test", to: "Video script", toEdge: "top" },
];

(async () => {
  const browser = await chromium.launch();
  for (const theme of ["light"]) {
    const context = await browser.newContext({ viewport: { width: WIDTH, height: 1000 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const page = await context.newPage();
    for (const shot of SHOTS) {
      await page.goto(`${ORIGIN}${shot.story}&theme=${theme}`, { waitUntil: "networkidle" });
      // The dev tools badge is not part of the product.
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      const top = await page.getByText(shot.from, { exact: false }).first().boundingBox();
      const end = await page.getByText(shot.to, { exact: false }).first().boundingBox();
      if (!top || !end) throw new Error(`${shot.name}: marker not found`);
      // The column the picture sits in: the nearest ancestor of the first marker that is wider than half the page.
      const column = await page.getByText(shot.from, { exact: false }).first().evaluate((node, half) => {
        let el = node.parentElement;
        while (el && el.getBoundingClientRect().width < half) el = el.parentElement;
        const box = (el ?? document.body).getBoundingClientRect();
        return { x: box.x, width: box.width };
      }, WIDTH / 2);
      const y = Math.max(0, top.y - 14);
      const bottom = shot.toEdge === "top" ? end.y - 14 : end.y + end.height + 14;
      await page.screenshot({
        path: `${OUT}/${shot.name}.png`,
        fullPage: true,
        clip: { x: Math.max(0, column.x - 8), y, width: Math.min(WIDTH, column.width + 16), height: bottom - y },
      });
      console.log(shot.name, Math.round(column.width + 16), Math.round(bottom - y));
    }
    await context.close();
  }
  await browser.close();
})();
