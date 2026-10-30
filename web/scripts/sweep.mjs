// Screenshot every route at several widths and themes in one browser session, check each page for
// runtime errors and page-level scroll, and optionally build contact sheets for quick review.
// usage: node scripts/sweep.mjs --out <dir> [--routes "/w,/skills"] [--widths 1440,1680,390]
//          [--themes light,dark] [--sheets] [--wait 600] [--sample] [--agent codex|claude]
// The board starts without issues and the default routes name sample issues: pass --sample to load
// the sample world (26 issues) in each page before its route opens. /kit holds the sample itself.
// --agent connects that agent in each page first (window.__wf.connectAgent), for a route whose frame needs a connected
// agent; the default routes do not (the Kit shows the connect flow and the Agent panel on fixed connections).
// A route under /lib/t/platform-handbook first adds the example team library through its dialog
// (see goto.mjs); the old /lib/<lib-id>, /glossary and /lib?tab=glossary only redirect, so they are
// not routes of their own here.
// Base URL: SHOT_BASE (default http://localhost:5177). For the static build use SHOT_BASE=http://host:port/#
// Each page is also checked for text under 11 px; the first few elements are printed as a "note" and kept in report.json (`smallText`).
// Writes <dir>/<route-slug>__<width>__<theme>.png, <dir>/report.json, and with --sheets
// <dir>/sheets/<route-slug>.png (desktop widths) and <dir>/sheets/<route-slug>__mobile.png.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { gotoRoute } from "./goto.mjs";

export const ROUTES = [
  "/w",
  "/w?group=g-web01",
  "/w?show=cancelled",
  "/w?needs=me",
  "/w/i/wf-3k9x2?tab=now",
  "/w/i/wf-3k9x2?tab=goal",
  "/w/i/wf-3k9x2?tab=criteria",
  "/w/i/wf-3k9x2?tab=plan",
  "/w/i/wf-3k9x2?tab=log",
  "/w/i/wf-3k9x2?tab=log&log=decisions",
  "/w/i/wf-3k9x2?tab=log&log=learnings",
  "/w/i/wf-3k9x2?tab=git",
  "/w/i/wf-3k9x2?tab=ci",
  "/w/i/wf-3k9x2?tab=files",
  "/i/wf-3k9x2",
  "/w/i/wf-7yq2m?tab=goal",
  "/i/wf-g5rx8?tab=plan",
  "/w/i/wf-h2tb7?tab=plan",
  "/i/wf-3k9x2?tab=plan",
  "/w/i/wf-k8dv6?tab=files",
  "/lib",
  "/lib/me",
  "/lib/me/topics/agent-context",
  "/lib/me/topics/agent-context/resume-points",
  "/lib/me/topics/agent-context/bundle-sizes",
  "/lib/me/codebases/mudit1729-workflow_management",
  "/lib/me/work/wf/wf/web/wf-3k9x2",
  "/lib/t/wf",
  "/lib/t/wf/playbooks/write-criteria-as-ears",
  "/lib/t/wf/glossary",
  "/lib/t/platform-handbook",
  "/lib/t/platform-handbook/runbooks/rotate-signing-keys",
  "/skills",
  "/skills?skill=adding-work",
  "/kit",
  "/kit?el=HandoffPanel",
  "/w/i/wf-e6kc1?tab=plan",
  "/kit?el=CodexActions",
  "/kit?el=RunNotice",
  "/kit?el=AgentStatus",
  "/kit?el=ConnectAgentPanel",
  "/kit?el=AgentPanel",
  "/kit?el=PersonalHome",
  "/kit?el=MediaFigure",
  "/kit?el=AskPanel",
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
      await gotoRoute(page, base, route, { sample: args.includes("--sample"), agent: opt("agent") }).catch((e) => errors.push(`goto: ${e.message}`));
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
            // Text under the 11 px floor (the smallest step of the type scale). Hidden and screen-reader-only
            // text does not count. A note, not a failure: it names the first few elements so a regression shows.
            smallText: (() => {
              const found = new Map();
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (!n.nodeValue?.trim()) continue;
                const el = n.parentElement;
                // Initials in an avatar tile and the "!" of an urgent mark are glyphs, not text to read.
                if (!el || found.has(el) || el.closest('[data-wf="AuthorAvatar"], [data-wf="PriorityGlyph"]')) continue;
                const cs = getComputedStyle(el);
                const box = el.getBoundingClientRect();
                if (cs.visibility === "hidden" || cs.display === "none" || box.width <= 1 || box.height <= 1) continue;
                const size = Number.parseFloat(cs.fontSize);
                if (size < 10.95) found.set(el, `${el.closest("[data-wf]")?.getAttribute("data-wf") ?? el.tagName.toLowerCase()} ${size.toFixed(1)}px "${n.nodeValue.trim().slice(0, 24)}"`);
              }
              return [...found.values()].slice(0, 5);
            })(),
          };
        })
        .catch(() => ({ pageScrollY: -1, pageScrollX: -1, dataWf: 0, mainText: 0, smallText: [] }));
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
      if (checks.smallText?.length) console.log(`  note: text under 11 px: ${checks.smallText.join(" | ")}`);
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
