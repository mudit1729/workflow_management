// Add team library from Settings: the flow stays on that page. The store says whether the flow was
// opened from Settings, and what the page says after an add; closing the flow ends the stay.
import { beforeEach, describe, expect, it } from "vitest";
import { useShell } from "@/app/shell-store";
import {
  addedFromSettings,
  closeAddLibraryFromSettings,
  fromSettings,
  openAddLibraryFromSettings,
} from "./from-settings";

beforeEach(() => {
  fromSettings.setState({ stay: false, added: undefined });
  useShell.setState({ addLibraryOpen: false });
});

describe("Add team library from Settings", () => {
  it("opens the flow and keeps the add on the page", () => {
    openAddLibraryFromSettings();
    expect(useShell.getState().addLibraryOpen).toBe(true);
    expect(fromSettings.getState().stay).toBe(true);
  });

  it("says the add on the page, and starts clean the next time", () => {
    openAddLibraryFromSettings();
    addedFromSettings({ name: "Platform handbook", description: "12 pages from handbook" });
    expect(fromSettings.getState().added?.name).toBe("Platform handbook");

    closeAddLibraryFromSettings();
    expect(fromSettings.getState().stay).toBe(false);
    expect(fromSettings.getState().added?.name).toBe("Platform handbook");

    openAddLibraryFromSettings();
    expect(fromSettings.getState().added).toBeUndefined();
  });
});
