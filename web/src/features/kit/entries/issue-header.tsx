import { IssueDrawer } from "@/features/issue/IssueDrawer";
import { IssueHeader } from "@/features/issue/IssueHeader";
import { IssuePage } from "@/features/issue/IssuePage";
import { IssueSkeleton } from "@/features/issue/IssueSkeleton";
import { IssueView } from "@/features/issue/IssueView";
import { entry, type KitEntry, Sandbox, V, WithDetail } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/features/issue";

// ---------------------------------------------------------------- IssueHeader

function Header({
  id,
  label,
  note,
  variant = "drawer",
  width = 560,
}: {
  id: string;
  label: string;
  note?: string;
  variant?: "drawer" | "page";
  width?: number;
}) {
  return (
    <V label={label} note={note} width={width}>
      <WithDetail id={id}>
        {(d) => (
          <div className="rounded-md border border-border bg-bg">
            <IssueHeader detail={d} variant={variant} onClose={() => undefined} />
          </div>
        )}
      </WithDetail>
    </V>
  );
}

function IssueHeaderBody() {
  return (
    <>
      <Header id={ISSUE.rich} label="wf-3k9x2 · live lease, blocking request, lint" />
      <Header id={ISSUE.leaseExpired} label="wf-q4fs9 · lease expired" />
      <Header id={ISSUE.doneUnmet} label="wf-c2pn6 · done with unmet criteria" />
      <Header id={ISSUE.badYaml} label="wf-7yq2m · bad YAML (F001)" />
      <Header id={ISSUE.blocked} label="wf-w8vz4 · blocked by another issue" />
      <Header id={ISSUE.invalidDiagram} label="wf-g5rx8 · urgent, lint error" />
      <Header id={ISSUE.rich} label="page variant" variant="page" width={900} />
    </>
  );
}

// ---------------------------------------------------------------- IssueSkeleton

function IssueSkeletonBody() {
  return (
    <>
      <V label="drawer" width={560} height={360}>
        <IssueSkeleton variant="drawer" />
      </V>
      <V label="page" width={960} height={360}>
        <IssueSkeleton variant="page" />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- IssueView, IssuePage, IssueDrawer

function IssueViewBody() {
  return (
    <>
      <V
        label="drawer · wf-3k9x2"
        note="Tabs Now · Goal · Plan · Log · Files; keys 1–5 switch."
        width={560}
        height={680}
      >
        <Sandbox quiet>
          <IssueView id={ISSUE.rich} variant="drawer" />
        </Sandbox>
      </V>
      <V label="drawer · no plan, no snapshot of work (wf-h2tb7)" width={560} height={560}>
        <Sandbox quiet>
          <IssueView id={ISSUE.noPlan} variant="drawer" />
        </Sandbox>
      </V>
      <V label="page · three columns" fill height={680}>
        <Sandbox quiet>
          <IssueView id={ISSUE.rich} variant="page" />
        </Sandbox>
      </V>
      <V label="not found" width={560} height={320}>
        <Sandbox quiet>
          <IssueView id="wf-zzzzz" variant="drawer" />
        </Sandbox>
      </V>
    </>
  );
}

function IssuePageBody() {
  return (
    <V label="page · breadcrumb and back to the board" fill height={680}>
      <Sandbox quiet>
        <IssuePage id={ISSUE.rich} />
      </Sandbox>
    </V>
  );
}

function IssueDrawerBody() {
  return (
    <V
      label="follows the viewport"
      note="Docked beside the board at 1600 px and wider; an overlay sheet from 768 to 1599 px; full screen on a phone. Drag its left edge to resize (440–760 px)."
      fill
      height={640}
    >
      <Sandbox quiet>
        <div className="relative flex min-h-0 flex-1 bg-subtle">
          <div className="min-w-0 flex-1 p-4 text-fg-faint text-sm">The board sits here.</div>
          <IssueDrawer id={ISSUE.rich} />
        </div>
      </Sandbox>
    </V>
  );
}

export const issueHeaderEntries: KitEntry[] = [
  entry(
    "Issue · Header",
    "IssueHeader",
    `${SRC}/IssueHeader.tsx`,
    "The header answers 'what is this and is it healthy' before any tab opens: id, title, status, owner, lease, due, blockers and lint in one place, with the actions that leave the view.",
    IssueHeaderBody,
  ),
  entry(
    "Issue · Header",
    "IssueView",
    `${SRC}/IssueView.tsx`,
    "One view serves the drawer and the full page, so what you review in the board is exactly what an agent's link opens.",
    IssueViewBody,
  ),
  entry(
    "Issue · Header",
    "IssuePage",
    `${SRC}/IssuePage.tsx`,
    "Every issue has a shareable full page with a breadcrumb, for the moments the drawer is too small.",
    IssuePageBody,
  ),
  entry(
    "Issue · Header",
    "IssueDrawer",
    `${SRC}/IssueDrawer.tsx`,
    "The drawer keeps the board in view while you read an issue, docking beside it on wide screens and overlaying it on narrow ones.",
    IssueDrawerBody,
  ),
  entry(
    "Issue · Header",
    "IssueSkeleton",
    `${SRC}/IssueSkeleton.tsx`,
    "Loading shows the shape of the issue, so the drawer does not jump when the detail arrives.",
    IssueSkeletonBody,
  ),
];
