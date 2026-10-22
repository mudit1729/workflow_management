// The mock server is loaded on demand, so a `VITE_API=real` build never ships it and
// never installs `window.__wf`. The load starts when this module is first imported.
type MockModule = typeof import("@mock/server");

export const isRealApi = import.meta.env.VITE_API === "real";

let loading: Promise<MockModule> | undefined;

/** The mock server module. Rejects when the build talks to `wf serve`. */
export function loadMock(): Promise<MockModule> {
  if (isRealApi) return Promise.reject(new Error("The mock server is off: VITE_API=real."));
  loading ??= import("@mock/server");
  return loading;
}

if (!isRealApi) void loadMock();
