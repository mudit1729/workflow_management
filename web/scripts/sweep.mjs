// Screenshot every route at several widths and themes in one browser session, check each page for
// runtime errors and page-level scroll, and optionally build contact sheets for quick review.
// usage: node scripts/sweep.mjs --out <dir> [--routes "/w,/inbox"] [--widths 1440,1680,390]
//          [--themes light,dark] [--sheets] [--wait 600]
// Base URL: SHOT_BASE (default http://localhost:5177). For the static build use SHOT_BASE=http://host:port/#
// Writes <dir>/<route-slug>__<width>__<theme>.png, <dir>/report.json, and with --sheets
// <dir>/sheets/<route-slug>.png (desktop widths) and <dir>/sheets/<route-slug>__mobile.png.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

export const ROUTES = [
  "/w",
  "/w?swim=none",
  "/w?group=g-web01",
  "/w?show=cancelled",
  "/w/i/wf-3k9x2?tab=now",
  "/w/i/wf-3k9x2?tab=goal",
  "/w/i/wf-3k9x2?tab=plan",
  "/w/i/wf-3k9x2?tab=log",
  "/w/i/wf-3k9x2?tab=log&log=decisions",
  "/w/i/wf-3k9x2?tab=log&log=learnings",
  "/w/i/wf-3k9x2?tab=files",
  "/i/wf-3k9x2",
  "/w/i/wf-7yq2m?tab=goal",
  "/i/wf-g5rx8?tab=plan",
  "/w/i/wf-h2tb7?tab=plan",
  "/inbox",
  "/lib",
  "/lib/lib-4tz7c",
  "/lib?tab=glossary",
  "/kit",
];

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const out = opt("out");
if (!out) {
  console.error("usage: node scripts/sweep.mjs --out <dir> [--routes a,b] [--widths 1440,1680,390] [--themes light,dark] [--sheets]");
  process.exit(2);
}
const routes = opt("routes") ? opt("routes").split(",") : ROUTES;
const widths = opt("widths", "1440,1680,390").split(",").map(Number);
const themes = opt("themes", "light,dark").split(",");
const wait = Number(opt("wait", 600));
const base = process.env.SHOT_BASE ?? "http://localhost:5177";
const slug = (r) => r.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "") || "root";
const heightFor = (w) => (w <= 480 ? 844 : w >= 1600 ? 1000 : 900);

mkdirSync(out, { recursive: true });
const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }));

const results = [];
for (const route of routes) {
  for (const w of widths) {
    for (const theme of themes) {
      const h = heightFor(w);
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("wf-prefs", JSON.stringify({ state: { theme: t, density: "comfy" }, version: 0 }));
        } catch {}
      }, theme);
      const errors = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
      await page.goto(base + route, { waitUntil: "networkidle" }).catch((e) => errors.push(`goto: ${e.message}`));
      await page.waitForTimeout(wait);
      const checks = await page
        .evaluate(() => {
          const d = document.documentElement;
          const main = document.querySelector("main") ?? document.body;
          return {
            pageScrollY: Math.max(0, d.scrollHeight - window.innerHeight),
            pageScrollX: Math.max(0, d.scrollWidth - window.innerWidth),
            dataWf: document.querySelectorAll("[data-wf]").length,
            mainText: (main.textContent ?? "").trim().length,
          };
        })
        .catch(() => ({ pageScrollY: -1, pageScrollX: -1, dataWf: 0, mainText: 0 }));
      const file = join(out, `${slug(route)}__${w}__${theme}.png`);
      await page.screenshot({ path: file });
      await page.close();
      const problems = [
        ...errors,
        ...(checks.pageScrollY > 1 ? [`page scrolls vertically by ${checks.pageScrollY}px`] : []),
        ...(checks.pageScrollX > 1 ? [`page scrolls horizontally by ${checks.pageScrollX}px`] : []),
        ...(checks.mainText < 20 ? ["main region looks blank"] : []),
      ];
      results.push({ route, width: w, theme, file, ...checks, problems });
      console.log(`${problems.length ? "FAIL" : "ok  "} ${route} ${w} ${theme}${problems.length ? `  ${problems.join(" | ")}` : ""}`);
    }
  }
}

if (args.includes("--sheets")) {
  mkdirSync(join(out, "sheets"), { recursive: true });
  const sheet = await browser.newPage({ viewport: { width: 1700, height: 800 }, deviceScaleFactor: 1 });
  const uri = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
  const cell = (r) =>
    `<figure><figcaption>${r.width} · ${r.theme}${r.problems.length ? ` · ${r.problems.length} problem(s)` : ""}</figcaption><img src="${uri(r.file)}"></figure>`;
  for (const route of routes) {
    const rs = results.filter((r) => r.route === route);
    const groups = [
      ["", rs.filter((r) => r.width > 480), 2, 830],
      ["__mobile", rs.filter((r) => r.width <= 480), 4, 390],
    ];
    for (const [suffix, items, cols, cw] of groups) {
      if (!items.length) continue;
      await sheet.setContent(
        `<style>body{margin:0;padding:8px;font:12px system-ui;background:#888}h1{font-size:13px;margin:0 0 6px;color:#fff}
        .g{display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:8px}figure{margin:0}
        figcaption{color:#fff;margin-bottom:2px}img{width:${cw}px;display:block}</style>
        <h1>${route}</h1><div class="g">${items.map(cell).join("")}</div>`,
      );
      await sheet.waitForTimeout(100);
      await sheet.screenshot({ path: join(out, "sheets", `${slug(route)}${suffix}.png`), fullPage: true });
    }
  }
}

await browser.close();
writeFileSync(join(out, "report.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.problems.length);
console.log(`\n${results.length} pages, ${failed.length} with problems. Report: ${join(out, "report.json")}`);
