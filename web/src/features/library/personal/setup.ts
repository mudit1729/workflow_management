// Has the person set up their personal library? (spec 3). The first visit asks, with buttons: create
// `github.com/<you>/wf-library` (private), or use a repo that is already theirs. In the product the
// bridge answers: it finds `library.toml` with `kind = "personal"` in a clone. The prototype keeps
// a flag. The fixture user is set up; `window.__wf.resetPersonal()` shows the screen again and
// `window.__wf.setUpPersonal()` hides it.
import { create } from "zustand";
import { getMockControls } from "@/app/mock-controls";
import { loadMock } from "@/lib/api/mock-bridge";

interface SetupState {
  ready: boolean;
  /** The repo the library lives in, as `owner/repo`, once the person chose one. */
  repo?: string;
  setUp: (repo?: string) => void;
  reset: () => void;
}

export const usePersonalSetup = create<SetupState>((set) => ({
  ready: true,
  setUp: (repo) => set({ ready: true, repo }),
  reset: () => set({ ready: false, repo: undefined }),
}));

/** `https://github.com/o/r`, `…/o/r.git`, `git@github.com:o/r.git` or `o/r`, as `o/r`. */
export function parseRepo(raw: string): string | undefined {
  const s = raw.trim();
  const m =
    /^(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(
      s,
    ) ?? /^([\w.-]+)\/([\w.-]+)$/.exec(s);
  return m ? `${m[1]}/${m[2]}` : undefined;
}

interface PersonalControls {
  resetPersonal: () => void;
  setUpPersonal: () => void;
}

// The prototype controls live on `window.__wf`; the mock server installs them when it loads.
if (import.meta.env.VITE_API !== "real") {
  void loadMock()
    .then(() => {
      const controls = getMockControls() as (PersonalControls & object) | undefined;
      if (!controls) return;
      controls.resetPersonal = () => usePersonalSetup.getState().reset();
      controls.setUpPersonal = () => usePersonalSetup.getState().setUp();
    })
    .catch(() => {});
}
