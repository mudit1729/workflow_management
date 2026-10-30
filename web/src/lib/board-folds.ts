// The board folds Backlog and Done to a rail by default (a saved pref). Whoever creates an issue
// unfolds Backlog first, so the new card is on screen instead of a count on a rail.
import { usePrefs } from "./prefs";

export function revealBacklog() {
  const { foldedColumns, toggleColumnFold } = usePrefs.getState();
  if (foldedColumns.includes("backlog")) toggleColumnFold("backlog");
}
