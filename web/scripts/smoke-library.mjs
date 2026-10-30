// Playwright smoke of the library on the running dev server. Walks the paths of the spec's acceptance
// list: Personal -> a topic with a GIF -> a note with a video; + Add team library -> the example repo
// -> its home -> a runbook; the sample's Work section; Ask library on wf-3k9x2 (a question, citations,
// Link cited pages, Save to log); the old /lib/<lib-id> and /glossary addresses; the palette items.
// It writes the sample and a library into the page only (the mock lives in memory) and fails on any
// console error or any step that does not happen.
// usage: SHOT_BASE=http://localhost:5177 node scripts/smoke-library.mjs [--out <dir for screenshots>]
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.SHOT_BASE ?? "http://localhost:5177";
const outAt = process.argv.indexOf("--out");
const OUT = outAt >= 0 ? process.argv[outAt + 1] : undefined;
if (OUT) mkdirSync(OUT, { recursive: true });
const shot = (page, name) => (OUT ? page.screenshot({ path: `${OUT}/${name}.png` }) : undefined);
let failed = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) failed++;
  console.log(`${cond ? "ok  " : "FAIL"} ${label}${cond ? "" : " " + extra}`);
};
const browser = await chromium
  .launch()
  .catch(() =>
    chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }),
  );
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on(
    "console",
    (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 300)),
  );
  const path = () => new URL(page.url()).pathname + new URL(page.url()).hash;
  const T = 8000;

  // 1. /lib -> Personal -> a topic with the GIF -> the note with the video
  await page.goto(`${BASE}/lib`, { waitUntil: "networkidle" });
  ok(
    "/lib shows the library home cards",
    await page.getByText("Personal library").first().isVisible(),
  );
  await page
    .getByRole("link", { name: /^Personal\b/ })
    .first()
    .click();
  await page.waitForURL(/\/lib\/me$/, { timeout: T });
  await page.getByText("Research topics").first().waitFor({ timeout: T });
  ok("Personal home shows Research topics", true);
  await page.getByRole("link", { name: "Agent-readable issue context" }).first().click();
  await page.waitForURL(/topics\/agent-context/, { timeout: T });
  await page.getByRole("link", { name: "Where an agent picks up" }).first().click();
  await page.waitForURL(/resume-points/, { timeout: T });
  await page.waitForSelector('[data-wf="GifPlayer"] img', { timeout: T });
  const gif = await page
    .locator('[data-wf="GifPlayer"] img')
    .first()
    .evaluate((i) => i.complete && i.naturalWidth > 0);
  ok("the note renders its GIF", gif);
  await shot(page, "1-gif");
  await page.getByRole("link", { name: "Bundle sizes" }).first().click();
  await page.waitForURL(/bundle-sizes/, { timeout: T });
  await page.waitForSelector('[data-wf="VideoPlayer"]', { timeout: T });
  const vid = await page
    .locator('[data-wf="VideoPlayer"]')
    .first()
    .evaluate((v) => ({ autoplay: v.autoplay, controls: v.controls, preload: v.preload }));
  ok(
    "the other note renders a video file with controls, no autoplay",
    vid.controls && !vid.autoplay && vid.preload === "metadata",
    JSON.stringify(vid),
  );

  // 2. + Add team library -> paste the fixture link -> Add -> its home -> a runbook
  await page.getByRole("button", { name: "Add team library" }).first().click();
  await page.getByRole("dialog", { name: "Add team library" }).waitFor({ timeout: T });
  const field = page.getByRole("textbox", { name: "GitHub link" });
  await field.fill("https://github.com/acme/platform-handbook");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Add library/ }).waitFor({ timeout: T });
  ok(
    "the preview names the library",
    await page.getByText("Platform handbook").first().isVisible(),
  );
  await page.getByRole("button", { name: /Add library/ }).click();
  await page.waitForURL(/\/lib\/t\/platform-handbook/, { timeout: 15000 });
  await page.waitForTimeout(600);
  ok("the new library opens on its home", /platform-handbook/.test(path()));
  ok(
    "it is in the nav",
    await page
      .getByRole("link", { name: /Platform handbook/ })
      .first()
      .isVisible(),
  );
  await page.getByRole("link", { name: "Runbooks" }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole("link", { name: "Rotate signing keys" }).first().click();
  await page.waitForURL(/rotate-signing-keys/, { timeout: T });
  await page.waitForSelector('[data-wf="VideoPlayer"]', { timeout: T });
  ok("the runbook renders its video", true);
  await shot(page, "2-runbook");

  // 3. load sample -> /lib/me shows Work by group and status
  await page.evaluate(() => window.__wf.loadSample());
  await page.goto(`${BASE}/lib/me`, { waitUntil: "networkidle" }).catch(() => {});
  // a reload drops the in-memory sample: load it again from inside the app
  await page.evaluate(() => window.__wf.loadSample());
  await page
    .getByRole("link", { name: /^Personal\b/ })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(800);
  ok(
    "Work lists the sample by group",
    await page.locator('[data-wf="WorkSection"]').getByText("In progress").first().isVisible(),
  );
  ok(
    "Work shows a Stale mark",
    (await page.locator('[data-wf="WorkSection"]').getByText("Stale").count()) > 0,
  );
  await shot(page, "3-work");

  // 4. wf-3k9x2 -> Ask library -> suggested question -> answer with citations -> Link cited pages -> Save to log
  await page.evaluate(() => {
    history.pushState({}, "", "/w/i/wf-3k9x2");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.getByRole("button", { name: "Ask library" }).first().waitFor({ timeout: T });
  await page.getByRole("button", { name: "Ask library" }).first().click();
  await page.locator('[data-wf="AskPanel"]').waitFor({ timeout: T });
  ok("the panel opens beside the issue", await page.locator('[data-wf="AskPanel"]').isVisible());
  const suggestion = page.locator('[data-wf="AskPanel"] button').filter({ hasText: /\?$/ }).first();
  await suggestion.click();
  await page.waitForSelector('[data-wf="AskPanel"] a[href^="#cite-"]', { timeout: 15000 });
  ok(
    "the answer has numbered citations",
    (await page.locator('[data-wf="AskPanel"] a[href^="#cite-"]').count()) > 0,
  );
  await shot(page, "4-answer");
  // Pages the issue already links stay as they are; ask My library instead, so the cited pages are new.
  await page
    .locator('[data-wf="AskPanel"]')
    .getByRole("button", { name: /Linked to this issue/ })
    .click();
  await page
    .locator('[data-wf="AskPanel"]')
    .getByRole("button", { name: /My library/ })
    .click();
  const box = page.locator('[data-wf="AskPanel"] textarea').first();
  await box.fill("How should a client handle a lagged server-sent events connection?");
  await box.press("Enter");
  await page.waitForSelector('[data-wf="AskPanel"] a[href^="#cite-"]', { timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelector('[data-wf="AskPanel"]')?.innerText.includes("Link cited pages"),
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Link cited pages/ }).click();
  await page.getByText(/Linked \d+ pages? to wf-3k9x2/).waitFor({ timeout: T });
  ok("Link cited pages says what it did", true);
  await page.getByRole("button", { name: /Save to log/ }).click();
  await page.getByText(/Saved to the log/).waitFor({ timeout: T });
  ok("Save to log says what it did", true);
  await shot(page, "4-saved");

  // 5. old addresses redirect
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    history.pushState({}, "", "/lib/lib-4tz7c");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForURL(/\/lib\/t\/wf\/.+/, { timeout: T });
  ok("/lib/lib-4tz7c lands on a page of the workspace library", true, path());
  await page.evaluate(() => {
    history.pushState({}, "", "/glossary");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForURL(/\/lib\/t\/wf\/glossary/, { timeout: T });
  ok("/glossary lands on the Glossary page", true, path());
  await page.evaluate(() => {
    history.pushState({}, "", "/glossary?q=lease");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForTimeout(600);
  ok(
    "/glossary?q=lease opens at the term",
    /glossary/.test(path()) && /lease/i.test(decodeURIComponent(page.url())),
    page.url(),
  );
  await page.evaluate(() => {
    history.pushState({}, "", "/lib?tab=glossary");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForURL(/\/lib\/t\/wf\/glossary/, { timeout: T });
  ok("/lib?tab=glossary lands on the Glossary page", true, path());

  // 6. the palette items
  const palette = async (text) => {
    await page.waitForTimeout(700);
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog").getByRole("combobox").fill(text);
    await page.waitForTimeout(250);
  };
  await palette("open personal library");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/lib\/me$/, { timeout: T });
  ok("palette: Open personal library", true);
  await palette("search the library");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  ok(
    "palette: Search the library focuses the search box",
    await page.evaluate(
      () => document.activeElement?.closest('[data-wf="LibrarySearchBox"]') !== null,
    ),
  );
  await page.evaluate(() => {
    history.pushState({}, "", "/w/i/wf-3k9x2");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForTimeout(800);
  await palette("ask the library");
  await page.getByRole("option", { name: /Ask the library about wf-3k9x2/ }).click();
  await page.locator('[data-wf="AskPanel"]').waitFor({ timeout: T });
  ok("palette: Ask the library about the open issue opens the panel", true);
  await page.keyboard.press("Escape");
  await palette("add team library");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Add team library" }).waitFor({ timeout: T });
  ok("palette: Add team library opens the dialog", true);

  console.log(errors.length ? `CONSOLE ERRORS:\n  ${errors.join("\n  ")}` : "no console errors");
  if (errors.length) failed++;
} catch (e) {
  failed++;
  console.error(`smoke crashed: ${e.message}`);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
