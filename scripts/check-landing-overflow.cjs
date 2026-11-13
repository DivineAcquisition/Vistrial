/**
 * Fails if anything in the landing page's "Inside Vistrial" section runs past its window or past the
 * screen. The section draws the app in the page's own parts, so its content must reflow, never be cut.
 *
 * Run `npm run dev`, then `node scripts/check-landing-overflow.cjs` (checks 390 and 1280 wide).
 * Other widths: `node scripts/check-landing-overflow.cjs 320 768 1920`. Another address: set LANDING_ORIGIN.
 * Playwright is not a project dependency: use a machine that has it (for example `npx -p playwright node ...`).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a plain Node script; Playwright is not a project dependency.
const { chromium } = require("playwright");

const ORIGIN = process.env.LANDING_ORIGIN ?? "http://localhost:3000";
const SECTION = "#app";
const widths = process.argv.slice(2).map(Number).filter(Boolean);

(async () => {
  const browser = await chromium.launch();
  let failed = false;
  for (const width of widths.length > 0 ? widths : [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    // The cookie notice sits over the page and is not part of the section.
    const close = page.getByText("Close without choosing");
    if (await close.count()) await close.first().click();
    await page.locator(SECTION).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    // Every screen in the tabbed window is measured, not only the one in view.
    const tabs = page.locator(`${SECTION} [data-window] button[aria-pressed]`);
    const screens = Math.max(1, await tabs.count());
    const problems = [];
    for (let index = 0; index < screens; index++) {
      if (await tabs.count()) await tabs.nth(index).click();
      await page.waitForTimeout(150);
      const found = await page.evaluate((selector) => {
        const section = document.querySelector(selector);
        if (!section) return ["The section is missing from the page."];
        const out = [];
        const screen = document.documentElement.clientWidth;
        const name = (el) => `<${el.tagName.toLowerCase()}> "${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50)}"`;
        if (document.documentElement.scrollWidth > screen) out.push(`The page scrolls sideways: ${document.documentElement.scrollWidth}px wide on a ${screen}px screen.`);
        if (section.querySelector("img[src*='/marketing/product/']")) out.push("A screenshot of the app is back in the section.");
        for (const el of section.querySelectorAll("*")) {
          // Decoration (the travelling light, the tab's progress line) and screen-reader-only text take no room.
          if (el.closest("[data-decor]") || el.closest(".sr-only")) continue;
          const box = el.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          if (box.right > screen + 0.5 || box.left < -0.5) out.push(`Past the screen by ${Math.round(Math.max(box.right - screen, -box.left))}px: ${name(el)}`);
          const frame = el.closest("[data-window]");
          if (frame && frame !== el) {
            const edge = frame.getBoundingClientRect();
            if (box.right > edge.right + 0.5 || box.left < edge.left - 0.5) out.push(`Past its window by ${Math.round(Math.max(box.right - edge.right, edge.left - box.left))}px: ${name(el)}`);
          }
          // Content wider than the box that holds it is cut off or scrolls, whatever the box's edge says.
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible") out.push(`Holds content ${el.scrollWidth - el.clientWidth}px wider than itself: ${name(el)}`);
        }
        return out;
      }, SECTION);
      for (const problem of found) problems.push(screens > 1 ? `[tab ${index + 1}] ${problem}` : problem);
    }
    const unique = [...new Set(problems)];
    console.log(`${width}px: ${unique.length === 0 ? "nothing runs past its window or the screen" : `${unique.length} problem(s)`}`);
    for (const problem of unique.slice(0, 20)) console.log(`  ${problem}`);
    if (unique.length > 0) failed = true;
    await context.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
