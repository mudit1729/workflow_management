// Code-based route tree (UI_BUILD.md "Routes"). Path helpers live in `@/lib/nav`;
// features never call the router directly.
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { Suspense } from "react";
import { WorkspaceView } from "@/features/files";
import { KitPage } from "@/features/kit";
// The search validators live apart from the views, so a view can load when its route opens.
import { validateSettingsEditSearch, validateSettingsFlowSearch } from "@/features/settings/search";
import { validateSkillsSearch } from "@/features/skills/search";
import { AppShell } from "./AppShell";
import { BoardLayout } from "./BoardLayout";
import {
  IssueDrawer,
  IssuePage,
  LibraryHome,
  SettingsView,
  SkillsView,
  WikiView,
} from "./lazy-views";
import {
  redirectGlossary,
  redirectLibraryItem,
  redirectLibraryTab,
  redirectTeams,
} from "./library-redirects";
import { RouteError, RouteNotFound, RoutePending } from "./RouteStates";
import {
  validateBoardSearch,
  validateFilesSearch,
  validateGlossarySearch,
  validateIssueSearch,
  validateLibrarySearch,
} from "./search";

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
    // Nothing shows while the chunk arrives: the board is already there, and the drawer is a
    // moment away (the browser fetched it when it was idle).
    return (
      <Suspense fallback={null}>
        <IssueDrawer id={id} />
      </Suspense>
    );
  },
});

// /i/$id — the full issue page.
const issueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "i/$id",
  validateSearch: validateIssueSearch,
  component: function IssueRoute() {
    const { id } = issueRoute.useParams();
    return (
      <Suspense fallback={<RoutePending />}>
        <IssuePage id={id} />
      </Suspense>
    );
  },
});

// /lib — the Library: its home, the personal library (/lib/me), the team libraries (/lib/t/<alias>,
// the workspace's own first) and the old addresses of a library item and of the glossary, which
// redirect to their pages. The viewer is a lazy chunk (lazy-views.tsx).
const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "lib",
  validateSearch: validateLibrarySearch,
});

function Wiki({ alias, path }: { alias: string; path: string }) {
  return (
    <Suspense fallback={<RoutePending />}>
      <WikiView alias={alias} path={path} />
    </Suspense>
  );
}

const libraryIndexRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "/",
  // `/lib?tab=glossary` was the old address of the glossary.
  beforeLoad: ({ search }) => redirectLibraryTab(search),
  component: function LibraryHomeRoute() {
    return (
      <Suspense fallback={<RoutePending />}>
        <LibraryHome />
      </Suspense>
    );
  },
});

const personalRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "me",
  component: function PersonalRoute() {
    return <Wiki alias="me" path="" />;
  },
});

const personalPageRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "me/$",
  component: function PersonalPageRoute() {
    const { _splat } = personalPageRoute.useParams();
    return <Wiki alias="me" path={_splat ?? ""} />;
  },
});

// /lib/t has no page of its own: the team libraries open on the workspace's.
const teamsRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "t",
  beforeLoad: () => redirectTeams(),
});

const teamRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "t/$alias",
  component: function TeamRoute() {
    const { alias } = teamRoute.useParams();
    return <Wiki alias={alias} path="" />;
  },
});

const teamPageRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "t/$alias/$",
  component: function TeamPageRoute() {
    const { alias, _splat } = teamPageRoute.useParams();
    return <Wiki alias={alias} path={_splat ?? ""} />;
  },
});

// /lib/<lib-id> (old): the item's page in the workspace library.
const libraryItemRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: "$id",
  beforeLoad: ({ params }) => redirectLibraryItem(params.id),
});

// /glossary (old): the Glossary page of the workspace library. `?q=` opens it at that term.
const glossaryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "glossary",
  validateSearch: validateGlossarySearch,
  beforeLoad: ({ search }) => redirectGlossary(search.q),
});

// /skills — the plugins and skills of this repository, and how to install them. `?skill=` opens one.
// Loaded on demand (see lazy-views.tsx), so the main bundle stays small.
const skillsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "skills",
  validateSearch: validateSkillsSearch,
  component: function SkillsRoute() {
    return (
      <Suspense fallback={<RoutePending />}>
        <SkillsView />
      </Suspense>
    );
  },
});

// /settings — where the work's own rules are set. /settings itself opens the Skills flow; its step
// panel is `?step=`, the editor of a skill copy is /settings/flow/edit. One lazy chunk (lazy-views.tsx).
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/settings/flow", replace: true });
  },
});

function SettingsPage({ page }: { page: "flow" | "edit" | "agent" | "workspace" }) {
  return (
    <Suspense fallback={<RoutePending />}>
      <SettingsView page={page} />
    </Suspense>
  );
}

const settingsFlowRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "flow",
  validateSearch: validateSettingsFlowSearch,
  component: function SettingsFlowRoute() {
    return <SettingsPage page="flow" />;
  },
});

const settingsEditRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "flow/edit",
  validateSearch: validateSettingsEditSearch,
  component: function SettingsEditRoute() {
    return <SettingsPage page="edit" />;
  },
});

const settingsAgentRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "agent",
  component: function SettingsAgentRoute() {
    return <SettingsPage page="agent" />;
  },
});

const settingsWorkspaceRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "workspace",
  component: function SettingsWorkspaceRoute() {
    return <SettingsPage page="workspace" />;
  },
});

// /inbox is gone (plan D5): what needs you is a filter of the board. Old links still land there.
const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "inbox",
  beforeLoad: () => {
    throw redirect({ to: "/w", search: { needs: "me" }, replace: true });
  },
});

// /files — the workspace as the markdown files it is. `?path=` selects a file.
const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "files",
  validateSearch: validateFilesSearch,
  component: function FilesRoute() {
    const { path } = filesRoute.useSearch();
    return <WorkspaceView path={path} />;
  },
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
  libraryRoute.addChildren([
    libraryIndexRoute,
    personalRoute,
    personalPageRoute,
    teamsRoute,
    teamRoute,
    teamPageRoute,
    libraryItemRoute,
  ]),
  glossaryRoute,
  skillsRoute,
  settingsRoute.addChildren([
    settingsIndexRoute,
    settingsFlowRoute,
    settingsEditRoute,
    settingsAgentRoute,
    settingsWorkspaceRoute,
  ]),
  inboxRoute,
  filesRoute,
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
