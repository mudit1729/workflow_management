// Screenshot a route of the running dev server (default http://localhost:5177).
// usage: node scripts/shot.mjs <route> <out.png> [--w 1440] [--h 900] [--theme light|dark]
//          [--density comfy|compact] [--click "<css or text=…>"]… [--hover "<sel>"] [--wait 400] [--full] [--sample]
// --sample loads the sample world (26 issues) in the page first; the board itself starts empty.
// Prints console errors from the page so builders catch runtime crashes.
import { chromium } from "@playwright/test";
import { gotoRoute } from "./goto.mjs";

const args = process.argv.slice(2);
const route = args[0];
const out = args[1];
if (!route || !out) {
  console.error("usage: node scripts/shot.mjs <route> <out.png> [options]");
  process.exit(2);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const all = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const base = process.env.SHOT_BASE ?? "http://localhost:5177";
const w = Number(opt("w", 1440));
const h = Number(opt("h", 900));
const theme = opt("theme", "light");
const density = opt("density", "comfy");
const wait = Number(opt("wait", 600));

// Fall back to a system Chromium when Playwright's own build is not installed (e.g. cloud containers).
const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }));
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.addInitScript(
  ([t, d]) => {
    try {
      localStorage.setItem("wf-prefs", JSON.stringify({ state: { theme: t, density: d }, version: 0 }));
    } catch {}
  },
  [theme, density],
);
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
await gotoRoute(page, base, route, { sample: args.includes("--sample") });
await page.waitForTimeout(wait);
for (const sel of all("click")) {
  await page.locator(sel).first().click({ timeout: 4000 }).catch((e) => errors.push(`click ${sel}: ${e.message.split("\n")[0]}`));
  await page.waitForTimeout(350);
}
const hover = opt("hover");
if (hover) await page.locator(hover).first().hover().catch(() => {});
await page.waitForTimeout(200);
await page.screenshot({ path: out, fullPage: args.includes("--full") });
await browser.close();
console.log(`saved ${out} (${w}x${h}, ${theme})`);
if (errors.length) console.log(errors.slice(0, 20).join("\n"));
