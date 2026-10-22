import { useCallback } from "react";
import type { GroupId } from "@/gen/types";
import { useBoardSearch, useGo, usePathname } from "@/lib/nav";

/**
 * Show a group's subtree on the board. On /w it keeps the open drawer and the
 * other filters; elsewhere it goes to the board. `undefined` shows all issues.
 */
export function useSelectGroup() {
  const path = usePathname();
  const [, setBoard] = useBoardSearch();
  const go = useGo();
  return useCallback(
    (group: GroupId | undefined) => {
      if (path.startsWith("/w")) setBoard({ group });
      else go.board(group ? { group } : {});
    },
    [path, setBoard, go],
  );
}
