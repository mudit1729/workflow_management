// Open a route of the running app for the screenshot scripts (shot.mjs, sweep.mjs).
//
// The board starts without issues, so a route that names a sample issue (/w/i/wf-3k9x2) is a "not
// found" page on a fresh load. With `sample: true` the app loads on /w, the sample world is loaded in
// the page (`window.__wf.loadSample()`, the Prototype panel's "Load sample data") and the route is
// then opened from inside the app, so the in-memory sample stays. `/kit` needs no flag: it holds the
// sample itself while it is open.
//
// A run (Do next step) needs a connected agent; without one the button opens the connect flow. With
// `agent: "codex" | "claude"` the page connects that agent first (`window.__wf.connectAgent`), as a
// finished pairing would, so a script can click Do next step and get a run.
// The example team library (`/lib/t/platform-handbook`, the fixture repo acme/platform-handbook) is
// added by the person, and a library added in a page is gone when it reloads. A route under it is
// opened the same way as the sample: the app loads, the library is added through the Add team
// library dialog (the real flow, three clicks), and the route is opened from inside the app.
//
// base: http://localhost:5177 (dev server) or http://host:port/# (static build, hash router).

const EXAMPLE_LIBRARY = "/lib/t/platform-handbook";

/** Add the example team library with the dialog: the palette item, the suggested repo, Add library. */
async function addExampleLibrary(page) {
  // The palette opens from the keyboard at every width (the nav is a sheet on a phone).
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog").getByRole("combobox").fill("add team library");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Add team library" }).waitFor();
  await page.getByRole("button", { name: /Platform handbook/ }).first().click();
  // The button is off until the first page of the library has loaded; click waits for it.
  await page.getByRole("button", { name: /Add library/ }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 15000 });
}

/** @param {import("@playwright/test").Page} page */
export async function gotoRoute(page, base, route, { sample = false, agent, team = route.startsWith(EXAMPLE_LIBRARY) } = {}) {
  if (!sample && !team) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    if (agent) await connectAgent(page, agent);
    return;
  }
  await page.goto(`${base}/w`, { waitUntil: "networkidle" });
  if (sample) {
    await page.waitForFunction(() => typeof window.__wf?.loadSample === "function", null, { timeout: 15000 });
    await page.evaluate(() => window.__wf.loadSample());
  }
  if (team) await addExampleLibrary(page);
  if (agent) await connectAgent(page, agent);
  await page.evaluate((to) => {
    if (location.hash.startsWith("#/")) {
      location.hash = to;
    } else {
      history.pushState({}, "", to);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, route);
  await page.waitForLoadState("networkidle");
}

/** Connect the simulated agent, as the connect flow's Done would. */
async function connectAgent(page, agent) {
  await page.waitForFunction(() => typeof window.__wf?.connectAgent === "function", null, { timeout: 15000 });
  await page.evaluate((kind) => window.__wf.connectAgent(kind), agent);
}
