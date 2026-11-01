// Add team library from Settings (the Add a step form). The flow opens over that page and the add
// stays there: the page keeps its place and says what was added, so nothing jumps away and there
// is no toast. Any other opening is the library's own (`openAddLibrary()`).
import { create } from "zustand";
import { useShell } from "@/app/shell-store";

/** What the page says after an add: the name and the description the toast would have had. */
export interface AddedFromSettings {
  name: string;
  description: string;
}

interface FromSettingsState {
  /** The flow was opened from Settings: an add stays on that page. */
  stay: boolean;
  /** The last add from Settings, until the flow is opened again. */
  added?: AddedFromSettings;
}

export const fromSettings = create<FromSettingsState>()(() => ({ stay: false }));

/** Open the Add team library flow from Settings: the add stays on that page. */
export function openAddLibraryFromSettings() {
  fromSettings.setState({ stay: true, added: undefined });
  useShell.getState().setAddLibraryOpen(true);
}

/** The flow closed: the next opening is the library's own, unless Settings opens it again. */
export function closeAddLibraryFromSettings() {
  fromSettings.setState({ stay: false });
}

/** A library was added from Settings: the page says so, in place of a toast. */
export function addedFromSettings(added: AddedFromSettings) {
  fromSettings.setState({ added });
}

/** Whether the flow on screen was opened from Settings. */
export function useAddStaysInSettings(): boolean {
  return fromSettings((s) => s.stay);
}

/** The add from Settings, for the page's line. */
export function useAddedFromSettings(): AddedFromSettings | undefined {
  return fromSettings((s) => s.added);
}
