// Playwright smoke of Settings · Skills flow on the running dev server. Walks acceptance 2, 3 and 4
// of docs/plan/proposals/skills-flow-spec.md, with Undo after each:
//   2  Plan -> Edit a copy -> This workspace -> name -> edit a line -> Save: the folder exists, the step
//      points at it, workflow.toml changed only by the new [flow] lines, and the hints, the bundle's flow
//      line and the Do next step run's Plan phase name the copy.
//   3  Just me on Do next step -> Finish in review: my library.toml holds it, the card says Your
//      override, Team default shows the team's value, and a Do next step run puts its task in review.
//   4  Add team library (Platform handbook) -> "+" after Do next step -> Security check, must pass -> Add:
//      the card appears, a run shows the phase, the bundle lists it.
// It reads and writes the page's in-memory workspace only, and fails on any console error or any step
// that does not happen. The mock lives in memory, so every step goes by clicks (no reload in between).
// It needs the dev server (it reads the mock server through Vite's module URLs).
// usage: SHOT_BASE=http://localhost:5177 node scripts/smoke-settings.mjs [--out <dir for screenshots>]
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
  console.log(`${cond ? "ok  " : "FAIL"} ${label}${cond ? "" : ` ${extra}`}`);
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
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on(
    "console",
    (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 300)}`),
  );
  const T = 8000;

  // The page's own mock server: the text of a file, of my library.toml, an issue, a bundle.
  const read = (rel) =>
    page.evaluate(async (p) => {
      const { api } = await import("/src/lib/api/index.ts");
      try {
        return (await api.file(p)).text;
      } catch {
        return undefined;
      }
    }, rel);
  const mine = () =>
    page.evaluate(async () => {
      const { api } = await import("/src/lib/api/index.ts");
      return (await api.personalConfig()).text;
    });
  const bundle = (id) =>
    page.evaluate(async (i) => {
      const { api } = await import("/src/lib/api/index.ts");
      return api.context(i);
    }, id);
  const task = (id, t) =>
    page.evaluate(
      async ([i, n]) => {
        const { api } = await import("/src/lib/api/index.ts");
        const d = await api.issue(i);
        return d.plan?.phases.flatMap((ph) => ph.tasks).find((x) => x.id === n)?.status;
      },
      [id, t],
    );
  /** Move inside the app without a reload: the mock's edits live in memory. */
  const go = async (to) => {
    await page.evaluate((p) => {
      history.pushState({}, "", p);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, to);
    await page.waitForTimeout(400);
  };
  const saved = () => page.locator('[data-wf="SavedLine"]');
  const card = (step) => page.locator(`[data-wf="StepCard"][data-step="${step}"]`);

  // 0. The sample on the board, then Settings by the gear (no reload).
  await page.goto(`${BASE}/w`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.__wf.loadSample());
  await page.evaluate(() => window.__wf.setCodexPhaseMs(150));
  await page.getByRole("link", { name: "Settings" }).first().click();
  await page.waitForURL(/\/settings\/flow$/, { timeout: T });
  await page.locator('[data-wf="FlowTab"]').waitFor({ timeout: T });
  ok(
    "the gear opens Settings · Skills flow",
    await page.getByRole("heading", { name: "Skills flow" }).isVisible(),
  );
  ok(
    "four steps, Log under Do next step, and the Anywhere row",
    (await page.locator('[data-wf="StepCard"]').count()) === 7,
  );
  for (const step of ["add", "plan", "do", "handoff"])
    ok(`${step} is built in`, (await card(step).innerText()).includes("Built-in"));
  const base = await read("workflow.toml");
  ok("the shipped workflow.toml has no [flow]", !base.includes("[flow"));
  await shot(page, "0-flow");

  // 2. Plan -> Edit a copy -> This workspace -> name -> edit one line -> Save; then Undo, then again.
  const copyPlan = async (first) => {
    await go("/settings/flow");
    await card("plan").click();
    await page.locator('[data-wf="StepPanel"]').waitFor({ timeout: T });
    await page.getByRole("button", { name: "Edit a copy" }).click();
    await page.getByText("Where should the copy live?").waitFor({ timeout: T });
    if (first) await shot(page, "2a-where");
    await page.getByRole("radio", { name: /This workspace/ }).click();
    const name = page.getByRole("textbox", { name: "Name of the copy" });
    await name.waitFor({ timeout: T });
    if (first) {
      ok(
        "the name is prefilled with the workspace prefix",
        (await name.inputValue()) === "wf-planning-issues",
        await name.inputValue(),
      );
      await shot(page, "2b-name");
    }
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/settings\/flow\/edit/, { timeout: T });
    const editor = page.locator("textarea").first();
    await editor.waitFor({ timeout: T });
    const text = await editor.inputValue();
    if (first)
      ok("the editor opens the copy with its own name", /^name: wf-planning-issues$/m.test(text));
    if (first) {
      // The checks beside the text follow what is typed.
      const checks = page.getByRole("complementary", { name: "Checks" });
      await editor.fill(text.replace(/^description:.*$/m, ""));
      await page.waitForTimeout(300);
      ok(
        "the checks name the problem as it is typed",
        /description/i.test(await checks.innerText()),
        await checks.innerText(),
      );
      await shot(page, "2d-problem");
    }
    await editor.fill(text.replace("# Planning issues", "# Planning issues (our way)"));
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/settings\/flow(\?|$)/, { timeout: T });
    await saved().waitFor({ timeout: T });
  };
  await copyPlan(true);
  const copy = await read("skills/wf-planning-issues/SKILL.md");
  ok("skills/wf-planning-issues/SKILL.md exists with the edit", copy?.includes("(our way)"));
  const after = await read("workflow.toml");
  ok(
    "[flow.plan] points at the copy",
    /\[flow\.plan\]\nskill = "ws:wf-planning-issues"/.test(after),
    after,
  );
  const baseLines = base.split("\n");
  const added = after
    .split("\n")
    .filter(
      (l, i) =>
        baseLines[i - (after.split("\n").length - baseLines.length)] !== l &&
        !baseLines.includes(l),
    );
  ok(
    "workflow.toml changed only by the new [flow] lines",
    after.startsWith(base.trimEnd()) &&
      added.every((l) => /^(#.*|\[flow\.plan\]|skill = .*)$/.test(l)),
    JSON.stringify(added),
  );
  ok("the card says This workspace", (await card("plan").innerText()).includes("This workspace"));
  await shot(page, "2c-saved");
  // Undo takes the folder and the pointer back, exactly.
  await saved().getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(600);
  ok(
    "Undo: workflow.toml is as it was",
    (await read("workflow.toml")) === base,
    await read("workflow.toml"),
  );
  ok("Undo: the copy is gone", (await read("skills/wf-planning-issues/SKILL.md")) === undefined);
  ok("Undo: the card is built in again", (await card("plan").innerText()).includes("Built-in"));
  // Again, and the hints, the bundle's flow line and the run's Plan phase name the copy.
  await copyPlan(false);
  ok(
    "the bundle names the copy",
    (await bundle("wf-3k9x2")).includes("skills flow: Plan: ws:wf-planning-issues (team)"),
  );
  await go("/i/wf-f6qa2?tab=plan");
  const hint = page.locator('[data-wf="SkillHint"]').filter({ hasText: "Plan wf-f6qa2" }).first();
  await hint.waitFor({ timeout: T });
  ok(
    "the Plan hint names the copy",
    (await hint.innerText()).includes("ws:wf-planning-issues"),
    await hint.innerText(),
  );
  await page
    .getByRole("button", { name: /Do next step/ })
    .first()
    .click();
  await page.waitForFunction(
    async () => {
      const { api } = await import("/src/lib/api/index.ts");
      return (await api.codexRuns("wf-f6qa2")).length > 0;
    },
    undefined,
    { timeout: 15000 },
  );
  const planPhase = await page.evaluate(async () => {
    const { api } = await import("/src/lib/api/index.ts");
    const run = (await api.codexRuns("wf-f6qa2"))[0];
    return run.phases[0];
  });
  ok(
    "the run's Plan phase names the copy",
    planPhase.skill === "ws:wf-planning-issues" &&
      planPhase.label.includes("ws:wf-planning-issues"),
    JSON.stringify(planPhase),
  );
  await page.waitForFunction(
    async () => {
      const { api } = await import("/src/lib/api/index.ts");
      return (await api.codexRuns("wf-f6qa2"))[0].status !== "running";
    },
    undefined,
    { timeout: 30000 },
  );
  await go("/settings/flow");
  await card("plan").click();
  await page.locator('[data-wf="StepPanel"]').waitFor({ timeout: T });
  await page.getByRole("button", { name: "Reset to built-in" }).click();
  await page.waitForTimeout(500);
  ok(
    "Reset to built-in takes the pointer out (the copy stays a skill of the workspace)",
    !(await read("workflow.toml")).includes("[flow.plan]"),
    await read("workflow.toml"),
  );
  await page.evaluate(() => window.__wf.resetFlow());

  // 3. Just me on Do next step -> Finish in review.
  await card("do").click();
  await page.locator('[data-wf="StepPanel"]').waitFor({ timeout: T });
  const meBefore = await mine();
  await page.getByRole("radio", { name: "Just me", exact: true }).click();
  await page.getByRole("radio", { name: "In review", exact: true }).click();
  await saved().waitFor({ timeout: T });
  ok(
    "Saved to your library.toml",
    (await saved().innerText()).includes("library.toml"),
    await saved().innerText(),
  );
  const me = await mine();
  ok(
    "my library.toml has [flow.do] finish = review",
    /\[flow\.do\]\nfinish = "review"/.test(me),
    me,
  );
  ok("workflow.toml is untouched", !(await read("workflow.toml")).includes("[flow.do]"));
  ok("the card shows Your override", (await card("do").innerText()).includes("Your override"));
  await shot(page, "3a-override");
  await page.getByRole("radio", { name: "Team default", exact: true }).click();
  ok(
    "Team default shows the team's value",
    (await card("do").innerText()).includes("Tasks finish when verified"),
    await card("do").innerText(),
  );
  await page.getByRole("radio", { name: "In effect for me", exact: true }).click();
  // Undo restores my library.toml exactly; then the same change again for the run.
  await saved().getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(500);
  const undone = await mine();
  ok("Undo restores library.toml exactly", undone === meBefore, undone);
  ok("and the card is the team's again", !(await card("do").innerText()).includes("Your override"));
  await card("do").click();
  await page.getByRole("radio", { name: "In review", exact: true }).click();
  await saved().waitFor({ timeout: T });
  // A Do next step run puts its task in review.
  await go("/i/wf-3k9x2");
  const before = await task("wf-3k9x2", "T-4");
  await page
    .getByRole("button", { name: /Do next step/ })
    .first()
    .click();
  await page.waitForFunction(
    async () => {
      const { api } = await import("/src/lib/api/index.ts");
      const runs = await api.codexRuns("wf-3k9x2");
      return runs.length > 0 && runs[0].status !== "running";
    },
    undefined,
    { timeout: 30000 },
  );
  await page.waitForTimeout(300);
  const status = await task("wf-3k9x2", "T-4");
  const run = await page.evaluate(async () => {
    const { api } = await import("/src/lib/api/index.ts");
    const r = (await api.codexRuns("wf-3k9x2"))[0];
    return {
      status: r.status,
      review: r.review,
      phases: r.phases.map((p) => `${p.id}:${p.state}`),
    };
  });
  ok(
    `the run ends with the task in review (was ${before})`,
    status === "review" && run.review === true,
    `${status} ${JSON.stringify(run)}`,
  );

  // 4. Platform handbook, then "+" after Do next step -> Security check, must pass -> Add.
  await go("/settings/flow");
  await page.getByRole("button", { name: "Add team library" }).first().click();
  await page.getByRole("dialog", { name: "Add team library" }).waitFor({ timeout: T });
  await page
    .getByRole("textbox", { name: "GitHub link" })
    .fill("https://github.com/acme/platform-handbook");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Add library/ }).click();
  await page.waitForURL(/\/lib\/t\/platform-handbook/, { timeout: 15000 });
  await go("/settings/flow");
  await page.locator('[data-wf="FlowTab"]').waitFor({ timeout: T });
  const addStep = async (first) => {
    await page.getByRole("button", { name: "Add a step after Do next step" }).click();
    await page.locator('[data-wf="NewStepPanel"]').waitFor({ timeout: T });
    const choice = page.locator('[data-wf="SkillChoice"][data-skill$="checking-security"]');
    await choice.waitFor({ timeout: T });
    if (first)
      ok(
        "the Platform handbook's skill is offered",
        (await page.locator('[data-wf="SkillGroup"]').allInnerTexts()).some((t) =>
          t.includes("Platform handbook"),
        ),
      );
    await choice.click();
    await page.getByRole("textbox", { name: "Label" }).fill("Security check");
    await page.getByRole("radio", { name: "Yes", exact: true }).click();
    if (first) await shot(page, "4a-add");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.locator('[data-wf="CustomCard"]').first().waitFor({ timeout: T });
  };
  const beforeAdd = await read("workflow.toml");
  await addStep(true);
  const flowText = await read("workflow.toml");
  ok(
    "workflow.toml has the custom step, required",
    /\[flow\.custom\.security-check\]\nafter = "do"\nskill = "[a-z-]+:checking-security"\nlabel = "Security check"\nrequired = true/.test(
      flowText,
    ),
    flowText,
  );
  ok(
    "its card reads Security check, Must pass",
    /Security check[\s\S]*Must pass/.test(
      await page.locator('[data-wf="CustomCard"]').first().innerText(),
    ),
  );
  await shot(page, "4b-added");
  await saved().getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(600);
  ok(
    "Undo: workflow.toml is as it was",
    (await read("workflow.toml")) === beforeAdd,
    await read("workflow.toml"),
  );
  ok("Undo: the card is gone", (await page.locator('[data-wf="CustomCard"]').count()) === 0);
  await go("/settings/flow");
  await addStep(false);
  ok(
    "the bundle lists it",
    (await bundle("wf-3k9x2")).includes(
      "After Do next step: Security check (platform-handbook:checking-security, must pass",
    ),
  );
  // A run shows the phase.
  await page.evaluate(() => window.__wf.setCodexPhaseMs(700));
  await go("/i/wf-y4bz7");
  const strip = page.locator('[data-wf="CodexRunStatus"]');
  await page
    .getByRole("button", { name: /Do next step/ })
    .first()
    .click();
  await strip.first().waitFor({ timeout: T });
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const t = (await strip.count()) > 0 ? await strip.first().innerText() : "";
    if (t) seen.add(t.split("\n")[0]);
    if (/Security check/.test(t)) break;
    await page.waitForTimeout(200);
  }
  ok(
    "a run shows the custom step's phase",
    [...seen].some((t) => /Security check/.test(t)),
    JSON.stringify([...seen]),
  );
  const segments = await page.locator('[data-wf="CodexRunProgress"] > span').count();
  ok("the progress bar has a segment for it", segments === 5, String(segments));
  const phase = await page.evaluate(async () => {
    const { api } = await import("/src/lib/api/index.ts");
    return (await api.codexRuns("wf-y4bz7"))[0].phases.find((p) => p.id.startsWith("custom:"));
  });
  ok(
    "the phase carries the skill that ran it",
    phase?.skill?.endsWith(":checking-security"),
    JSON.stringify(phase),
  );
  await shot(page, "4c-run");
  await page.evaluate(() => window.__wf.setCodexPhaseMs(100));
  await page.waitForFunction(
    async () => {
      const { api } = await import("/src/lib/api/index.ts");
      return (await api.codexRuns("wf-y4bz7"))[0].status !== "running";
    },
    undefined,
    { timeout: 30000 },
  );
  // Undo takes the step out again, exactly.
  await go("/settings/flow");
  await page.locator('[data-wf="CustomCard"]').first().click();
  await page.getByRole("button", { name: "Remove step" }).click();
  await saved().waitFor({ timeout: T });
  ok(
    "Remove step takes the table out",
    !(await read("workflow.toml")).includes("[flow.custom"),
    await read("workflow.toml"),
  );
  await saved().getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(600);
  ok("Undo brings the step back", (await read("workflow.toml")).includes("[flow.custom"));

  ok("no console errors", errors.length === 0, errors.join("\n"));
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : "smoke ok");
process.exit(failed ? 1 : 0);
