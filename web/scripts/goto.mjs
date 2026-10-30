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
//
// base: http://localhost:5177 (dev server) or http://host:port/# (static build, hash router).

/** @param {import("@playwright/test").Page} page */
export async function gotoRoute(page, base, route, { sample = false, agent } = {}) {
  if (!sample) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    if (agent) await connectAgent(page, agent);
    return;
  }
  await page.goto(`${base}/w`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.__wf?.loadSample === "function", null, { timeout: 15000 });
  if (agent) await connectAgent(page, agent);
  await page.evaluate((to) => {
    window.__wf.loadSample();
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
