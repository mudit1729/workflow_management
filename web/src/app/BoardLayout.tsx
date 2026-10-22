// /w layout: the board fills the row; the drawer route renders beside it (docked)
// or over it (overlay). BoardPage stays mounted while issues open and close.
import { Outlet } from "@tanstack/react-router";
import { BoardPage } from "@/features/board";

export function BoardLayout() {
  return (
    <div data-wf="BoardLayout" className="relative flex h-full min-h-0 min-w-0">
      <div className="min-w-0 flex-1">
        <BoardPage />
      </div>
      <Outlet />
    </div>
  );
}
