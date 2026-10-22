// Code-based route tree (UI_BUILD.md "Routes"). Path helpers live in `@/lib/nav`;
// features never call the router directly.
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useParams,
} from "@tanstack/react-router";
import { InboxView } from "@/features/inbox";
import { IssueDrawer, IssuePage } from "@/features/issue";
import { KitPage } from "@/features/kit";
import { LibraryView } from "@/features/library";
import { AppShell } from "./AppShell";
import { BoardLayout } from "./BoardLayout";
import { RouteError, RouteNotFound, RoutePending } from "./RouteStates";
import { validateBoardSearch, validateIssueSearch, validateLibrarySearch } from "./search";

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/w", replace: true });
  },
});

// /w — the board. The layout keeps BoardPage mounted while the drawer opens and closes.
const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "w",
  component: BoardLayout,
  validateSearch: validateBoardSearch,
});

const boardIndexRoute = createRoute({
  getParentRoute: () => boardRoute,
  path: "/",
});

const drawerRoute = createRoute({
  getParentRoute: () => boardRoute,
  path: "i/$id",
  validateSearch: validateIssueSearch,
  component: function DrawerRoute() {
    const { id } = drawerRoute.useParams();
    return <IssueDrawer id={id} />;
  },
});

// /i/$id — the full issue page.
const issueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "i/$id",
  validateSearch: validateIssueSearch,
  component: function IssueRoute() {
    const { id } = issueRoute.useParams();
    return <IssuePage id={id} />;
  },
});

// /lib and /lib/$id share one LibraryView, so the list keeps its scroll and
// search while the selected item changes.
const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "lib",
  validateSearch: validateLibrarySearch,
  component: function LibraryRoute() {
    const { id } = useParams({ strict: false }) as { id?: string };
    return <LibraryView selectedId={id} />;
  },
});

const libraryIndexRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "/",
});

const libraryItemRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "$id",
});

const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "inbox",
  component: InboxView,
});

const kitRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "kit",
  component: KitPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  boardRoute.addChildren([boardIndexRoute, drawerRoute]),
  issueRoute,
  libraryRoute.addChildren([libraryIndexRoute, libraryItemRoute]),
  inboxRoute,
  kitRoute,
]);

export const router = createRouter({
  routeTree,
  history: import.meta.env.VITE_HASH_ROUTER === "1" ? createHashHistory() : undefined,
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 200,
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: RouteNotFound,
  // Inner regions scroll; the shell itself never does.
  scrollRestoration: false,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
