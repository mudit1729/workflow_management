// Whether the left rail is an icon rail, and how ⌘B / `[` / the collapse buttons change it.
// Wide screens: the person's saved choice (`prefs.navCollapsed`). Between 768 and 1099 px the
// rail is an icon rail whatever was saved, so the page keeps its width (tablets in portrait);
// asking for it open there shows the full rail as an overlay (`overlay`), not saved anywhere.
import { useMediaQuery } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { useShell } from "./shell-store";

/** The widths (below the phone layout) where the rail starts out as an icon rail. */
export const NARROW_RAIL_QUERY = "(max-width: 1099px)";

export interface NavRailState {
  /** The rail shows icons only (52 px). */
  collapsed: boolean;
  /** The icon rail is narrow-screen and the person opened it: the full rail floats over the page. */
  overlay: boolean;
  /** Narrow screen: the collapsed state is not the saved preference. */
  narrow: boolean;
  toggle: () => void;
  close: () => void;
}

export function useNavRail(): NavRailState {
  const narrow = useMediaQuery(NARROW_RAIL_QUERY);
  const saved = usePrefs((s) => s.navCollapsed);
  const toggleSaved = usePrefs((s) => s.toggleNav);
  const open = useShell((s) => s.narrowNavOpen);
  const setOpen = useShell((s) => s.setNarrowNavOpen);

  return {
    collapsed: narrow ? !open : saved,
    overlay: narrow && open,
    narrow,
    toggle: narrow ? () => setOpen(!open) : toggleSaved,
    close: () => setOpen(false),
  };
}
