// Helpers for the tests of the hooks. There is no DOM in the test environment, so a hook runs
// once inside a server render: enough to get the functions it returns (the hooks under test
// keep no state that a render must carry between calls).
import { createElement } from "react";
import { renderToString } from "react-dom/server";

function Probe({ hook, keep }: { hook: () => unknown; keep: (value: unknown) => void }) {
  keep(hook());
  return null;
}

/** Run a hook once, the way a component would, and hand back what it returned. */
export function capture<T>(hook: () => T): T {
  let out: T | undefined;
  renderToString(
    createElement(Probe, {
      hook,
      keep: (value) => {
        out = value as T;
      },
    }),
  );
  return out as T;
}
