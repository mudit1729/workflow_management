import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { AuthorChip, StatusIcon } from "@/components/common";
import { Button, Chip } from "@/components/ui";
import { IssueCard } from "@/features/board";
import type { GroupNode, IssueStatus, TaskStatus } from "@/gen/types";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, STATUS_ORDER, TASK_STATUS_LABEL } from "@/lib/status";
import { entry, type KitEntry, V, WithSnapshot, WithSummary } from "../kit-ui";
import { ISSUE } from "./data";

const SRC = "src/styles/tokens.css";

// ---------------------------------------------------------------- token tables

/** A swatch and the token's value, read from the theme wrapper it renders in. */
function TokenCell({
  theme,
  token,
  swatch,
}: {
  theme: "light" | "dark";
  token: string;
  swatch?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  useLayoutEffect(() => {
    if (ref.current) setValue(getComputedStyle(ref.current).getPropertyValue(token).trim());
  }, [token]);
  return (
    <div
      ref={ref}
      data-theme={theme}
      className="flex min-w-0 items-center gap-2 bg-bg px-3 py-1.5 text-fg"
    >
      {swatch ?? (
        <span
          aria-hidden
          className="size-5 shrink-0 rounded-sm ring-1 ring-border-strong ring-inset"
          style={{ background: `var(${token})` }}
        />
      )}
      <span className="min-w-0 truncate font-mono text-fg-muted text-xs" title={value}>
        {value || "…"}
      </span>
    </div>
  );
}

interface TokenRowDef {
  token: string;
  use: string;
  swatch?: (theme: "light" | "dark") => ReactNode;
}

function TokenTable({ title, rows }: { title: string; rows: TokenRowDef[] }) {
  return (
    <div className="w-full overflow-hidden rounded-md border border-border">
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] border-border border-b bg-subtle text-fg-faint text-xs">
        <span className="px-3 py-1.5 font-medium">{title}</span>
        <span className="px-3 py-1.5">Light</span>
        <span className="px-3 py-1.5">Dark</span>
      </div>
      {rows.map((r) => (
        <div
          key={`${r.token}-${r.use}`}
          className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] border-border border-b last:border-b-0"
        >
          <div className="flex min-w-0 flex-col justify-center px-3 py-1.5">
            <code className="min-w-0 truncate font-mono text-fg text-xs">{r.token}</code>
            <span className="min-w-0 text-fg-faint text-xs">{r.use}</span>
          </div>
          <TokenCell theme="light" token={r.token} swatch={r.swatch?.("light")} />
          <TokenCell theme="dark" token={r.token} swatch={r.swatch?.("dark")} />
        </div>
      ))}
    </div>
  );
}

const SURFACES: TokenRowDef[] = [
  { token: "--wf-bg", use: "page and card surface" },
  { token: "--wf-bg-subtle", use: "nav rail, column wells, code blocks" },
  { token: "--wf-bg-muted", use: "hover, chips, skeletons" },
  { token: "--wf-border", use: "hairlines" },
  { token: "--wf-border-strong", use: "control hover, ring track" },
  { token: "--wf-text", use: "primary text" },
  { token: "--wf-text-muted", use: "secondary text, icons" },
  { token: "--wf-text-faint", use: "paths, ids, hints" },
];

const ACCENT: TokenRowDef[] = [
  { token: "--wf-accent", use: "the one accent: primary action, needs-you, selection" },
  { token: "--wf-accent-subtle", use: "selected card, accent chip fill" },
  { token: "--wf-accent-fg", use: "text on the accent" },
  { token: "--wf-focus", use: "focus ring (accent at 40-50%)" },
  { token: "--wf-signal-stale", use: "stale and expired leases (amber)" },
  { token: "--wf-signal-danger", use: "errors, blocked, unmet criteria" },
  { token: "--wf-signal-needs-you", use: "needs-you (same as accent)" },
];

const NO_SWATCH = () => <span aria-hidden className="size-5 shrink-0" />;

const READABLE: TokenRowDef[] = [
  {
    token: "--wf-stale-text",
    use: "amber as text: `text-stale-text`",
    swatch: () => <span className="font-medium text-stale-text text-xs">Aa</span>,
  },
  {
    token: "--wf-success-text",
    use: "green as text: `text-success-text`",
    swatch: () => <span className="font-medium text-success-text text-xs">Aa</span>,
  },
  {
    token: "--wf-on-hue",
    use: "text on a hue tile: `text-on-hue`",
    swatch: () => (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-hue-1 font-medium text-on-hue text-xs">
        A
      </span>
    ),
  },
  { token: "--wf-scrim", use: "behind dialogs and the phone nav: `bg-scrim`" },
  {
    token: "--wf-z-raised",
    use: "sticky heads, overlays inside a panel: `z-raised`",
    swatch: NO_SWATCH,
  },
  {
    token: "--wf-z-overlay",
    use: "sheets, the icon rail opened over the page: `z-overlay`",
    swatch: NO_SWATCH,
  },
  {
    token: "--wf-z-dialog",
    use: "dialogs, the palette and their scrim: `z-dialog`",
    swatch: NO_SWATCH,
  },
  { token: "--wf-z-popover", use: "menus, popovers, hover cards: `z-popover`", swatch: NO_SWATCH },
  { token: "--wf-z-tooltip", use: "tooltips, always on top: `z-tooltip`", swatch: NO_SWATCH },
];

function ColorTokensBody() {
  return (
    <>
      <V both label="surfaces, borders, text" width={720}>
        <TokenTable title="Token" rows={SURFACES} />
      </V>
      <V both label="accent and signals" width={720}>
        <TokenTable title="Token" rows={ACCENT} />
      </V>
      <V
        both
        label="readable signal text, scrim and layers"
        width={720}
        note="Amber and green as text are darkened toward the text color so they stay readable; z-indexes come only from this scale."
      >
        <TokenTable title="Token" rows={READABLE} />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- status colors

const ISSUE_STATUS_ROWS: { status: IssueStatus | TaskStatus; label: string }[] = [
  ...STATUS_ORDER.map((s) => ({ status: s, label: STATUS_LABEL[s] })),
  { status: "todo", label: `${TASK_STATUS_LABEL.todo} (task)` },
];

function StatusColorsBody() {
  const rows: TokenRowDef[] = ISSUE_STATUS_ROWS.map(({ status, label }) => ({
    token: `--wf-status-${status === "todo" ? "planned" : status}`,
    use: label,
    swatch: () => (
      <span className="flex shrink-0 items-center gap-1.5">
        <StatusIcon status={status} size={14} />
        <StatusIcon status={status} size={20} />
      </span>
    ),
  }));
  return (
    <V
      both
      width={720}
      label="each status, glyph at 14 and 20 px, in both themes"
      note="Color never stands alone: every status has its own glyph."
    >
      <TokenTable title="Status" rows={rows} />
    </V>
  );
}

// ---------------------------------------------------------------- hues

function flatten(root: GroupNode): GroupNode[] {
  return [root, ...root.children.flatMap(flatten)];
}

function HueScaleBody() {
  return (
    <V
      both
      width={860}
      label="8 hues, fixed order, never cycled"
      note="Hues mean an author or a group. Three slots sit below 3:1 on white, so a hue never appears without its @handle or group name beside it."
    >
      <WithSnapshot>
        {(snap) => {
          const groups = flatten(snap.groups).filter((g) => g.id !== snap.groups.id);
          return (
            <div className="w-full overflow-hidden rounded-md border border-border">
              <div className="grid grid-cols-[100px_100px_100px_minmax(0,1fr)_minmax(0,1fr)] border-border border-b bg-subtle text-fg-faint text-xs">
                <span className="px-3 py-1.5 font-medium">Hue</span>
                <span className="px-3 py-1.5">Light</span>
                <span className="px-3 py-1.5">Dark</span>
                <span className="px-3 py-1.5">Authors</span>
                <span className="px-3 py-1.5">Groups</span>
              </div>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div
                  key={n}
                  className="grid grid-cols-[100px_100px_100px_minmax(0,1fr)_minmax(0,1fr)] items-stretch border-border border-b last:border-b-0"
                >
                  <code className="flex items-center px-3 py-1.5 font-mono text-fg text-xs">
                    --wf-hue-{n}
                  </code>
                  <TokenCell theme="light" token={`--wf-hue-${n}`} />
                  <TokenCell theme="dark" token={`--wf-hue-${n}`} />
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
                    {snap.authors
                      .filter((a) => a.color === n)
                      .map((a) => (
                        <AuthorChip key={a.handle} handle={a.handle} />
                      ))}
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
                    {groups
                      .filter((g) => g.color === n)
                      .map((g) => (
                        <span
                          key={g.id}
                          className="inline-flex items-center gap-1.5 text-fg-muted text-sm"
                        >
                          <span
                            aria-hidden
                            className="size-2 rounded-full"
                            style={{ background: `var(--wf-hue-${n})` }}
                          />
                          <span className={cn(g.implicit && "italic")}>{g.title}</span>
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          );
        }}
      </WithSnapshot>
    </V>
  );
}

// ---------------------------------------------------------------- type

const TYPE_ROWS = [
  { cls: "text-xs", token: "--wf-text-xs", px: 11, use: "labels, ids, chips, faint paths" },
  { cls: "text-sm", token: "--wf-text-sm", px: 12, use: "secondary rows, counts, hints" },
  { cls: "text-base", token: "--wf-text-base", px: 13, use: "body text, controls (the base)" },
  { cls: "text-md", token: "--wf-text-md", px: 14, use: "state summary, dialog titles" },
  { cls: "text-lg", token: "--wf-text-lg", px: 16, use: "issue title, section headings" },
  { cls: "text-xl", token: "--wf-text-xl", px: 20, use: "page titles (rare)" },
] as const;

function TypeScaleBody() {
  return (
    <>
      <V label="scale, Inter Variable" width={860}>
        <div className="w-full overflow-hidden rounded-md border border-border">
          {TYPE_ROWS.map((r) => (
            <div
              key={r.cls}
              className="grid grid-cols-[92px_44px_minmax(0,1fr)] items-baseline gap-3 border-border border-b px-3 py-2 last:border-b-0"
            >
              <code className="font-mono text-fg-faint text-xs">{r.cls}</code>
              <span className="text-fg-faint text-xs tabular">{r.px} px</span>
              <div className="min-w-0">
                <p className={cn("truncate text-fg", r.cls)}>
                  Live board updates reach every open tab
                </p>
                <p className="text-fg-faint text-xs">{r.use}</p>
              </div>
            </div>
          ))}
        </div>
      </V>
      <V label="weights: only 400, 500, 600">
        <div className="flex flex-col gap-1 text-base">
          <span className="font-normal">400 · Regular for prose and values</span>
          <span className="font-medium">500 · Medium for titles and labels</span>
          <span className="font-semibold">600 · Semibold for headings and the active tab</span>
        </div>
      </V>
      <V label="mono, ui-monospace stack">
        <div className="flex flex-col gap-1">
          <code className="font-mono text-base">wf-3k9x2 · T-4 · SC-2 · D-7f3k2</code>
          <code className="font-mono text-fg-faint text-xs">
            issues/wf/web/live-board-updates/goal.md
          </code>
        </div>
      </V>
      <V label="tabular figures (class tabular)">
        <div className="flex gap-6 text-base">
          <span className="tabular">1,111 · 0,000</span>
          <span>1,111 · 0,000</span>
        </div>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- spacing, radii, elevation

const SPACE_ROWS = [
  ["0_5", "2 px"],
  ["1", "4 px"],
  ["2", "8 px"],
  ["3", "12 px"],
  ["4", "16 px"],
  ["5", "20 px"],
  ["6", "24 px"],
  ["8", "32 px"],
] as const;

function SpacingScaleBody() {
  return (
    <V label="4 px grid, comfy density (utility p-2 = 8 px)" width={520}>
      <div className="flex w-full flex-col gap-1.5">
        {SPACE_ROWS.map(([n, px]) => (
          <div key={n} className="grid grid-cols-[120px_48px_minmax(0,1fr)] items-center gap-3">
            <code className="font-mono text-fg-muted text-xs">--wf-space-{n}</code>
            <span className="text-fg-faint text-xs tabular">{px}</span>
            <span
              aria-hidden
              className="h-3 rounded-[2px] bg-accent/70"
              style={{ width: `var(--wf-space-${n})` }}
            />
          </div>
        ))}
      </div>
    </V>
  );
}

function RadiiBody() {
  return (
    <>
      {(
        [
          ["sm", "rounded-sm", "chips, checkboxes, key caps"],
          ["md", "rounded-md", "buttons, inputs, cards"],
          ["lg", "rounded-lg", "dialogs, columns, diagram cards"],
        ] as const
      ).map(([n, cls, use]) => (
        <V key={n} label={`--wf-radius-${n}`} note={use}>
          <div className={cn("h-14 w-28 border border-border-strong bg-subtle", cls)} />
        </V>
      ))}
      <V label="hairline" note="1 px, --wf-border. Panels are separated by lines, not shadows.">
        <div className="flex h-14 w-28 items-center justify-center rounded-md border border-border text-fg-faint text-xs">
          1 px
        </div>
      </V>
    </>
  );
}

function ElevationBody() {
  return (
    <>
      <V label="flat (everything by default)" note="Hairline border only.">
        <div className="flex h-20 w-48 items-center justify-center rounded-lg border border-border bg-bg text-fg-muted text-sm">
          card, panel, column
        </div>
      </V>
      <V
        label="shadow-pop (overlays only)"
        note="Menus, popovers, dialogs, the overlay drawer and toasts."
      >
        <div className="flex h-20 w-48 items-center justify-center rounded-lg bg-bg text-fg-muted text-sm shadow-pop">
          menu, dialog
        </div>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- motion

function MotionBody() {
  const [on, setOn] = useState(false);
  const rows = [
    ["--wf-dur-1", "100 ms", "hover, press, color changes", "duration-[var(--wf-dur-1)]"],
    ["--wf-dur-2", "150 ms", "fold, fade, small moves", "duration-[var(--wf-dur-2)]"],
    ["--wf-dur-3", "200 ms", "drawer, sheet, collapsibles", "duration-[var(--wf-dur-3)]"],
  ] as const;
  return (
    <V
      width={560}
      label="durations and --wf-ease cubic-bezier(0.2, 0, 0, 1)"
      note="Reduced-motion sets all three to 0 ms."
    >
      <div className="flex w-full flex-col gap-3">
        <div>
          <Button size="sm" variant="secondary" onClick={() => setOn((v) => !v)}>
            Play
          </Button>
        </div>
        {rows.map(([token, ms, use, dur]) => (
          <div key={token} className="grid grid-cols-[104px_44px_minmax(0,1fr)] items-center gap-3">
            <code className="font-mono text-fg-muted text-xs">{token}</code>
            <span className="text-fg-faint text-xs tabular">{ms}</span>
            <div className="relative h-5 rounded-sm bg-muted">
              <span
                aria-hidden
                className={cn(
                  "absolute top-1/2 left-1 size-3 -translate-y-1/2 rounded-full bg-accent transition-[left] ease-wf",
                  dur,
                  on && "left-[calc(100%-1rem)]",
                )}
              />
              <span className="sr-only">{use}</span>
            </div>
          </div>
        ))}
      </div>
    </V>
  );
}

// ---------------------------------------------------------------- density

// :root[data-density="compact"] cannot nest, so the sample overrides the same tokens inline.
const COMPACT = {
  "--wf-space-1": "3px",
  "--wf-space-2": "6px",
  "--wf-space-3": "10px",
  "--wf-space-4": "12px",
  "--wf-space-5": "16px",
  "--wf-space-6": "20px",
  "--wf-space-8": "28px",
  "--wf-col-w": "248px",
  "--wf-card-gap": "4px",
} as CSSProperties;

function DensitySample({ compact }: { compact: boolean }) {
  return (
    <div
      style={compact ? COMPACT : undefined}
      className="flex w-[264px] flex-col gap-[var(--wf-card-gap)]"
    >
      <WithSummary id={ISSUE.rich}>{(s) => <IssueCard issue={s} />}</WithSummary>
      <WithSummary id={ISSUE.stale}>{(s) => <IssueCard issue={s} />}</WithSummary>
      <div className="flex items-center gap-2 pt-2">
        <Button size="sm" variant="secondary">
          Filter
        </Button>
        <Chip>3 ready</Chip>
        <Chip tone="accent">needs you</Chip>
      </div>
    </div>
  );
}

function DensityBody() {
  return (
    <>
      <V label="comfy (default)" note="Spacing steps 4 px, column 264 px, card gap 6 px.">
        <DensitySample compact={false} />
      </V>
      <V
        label="compact"
        note="Spacing steps 3 px, column 248 px, card gap 4 px. Switch the whole app in the nav footer."
      >
        <DensitySample compact />
      </V>
    </>
  );
}

export const foundationEntries: KitEntry[] = [
  entry(
    "Foundations",
    "ColorTokens",
    SRC,
    "Neutral grays and one indigo accent keep the board calm, so color is free to mean status, author or group; this table is the single place to retune it.",
    ColorTokensBody,
  ),
  entry(
    "Foundations",
    "StatusColors",
    SRC,
    "Seven issue statuses and the task 'to do' each get a color and a glyph, so state reads at 14 px even for color-blind reviewers.",
    StatusColorsBody,
  ),
  entry(
    "Foundations",
    "HueScale",
    SRC,
    "Eight fixed hues identify authors and groups at a glance; the table shows who wears which, so no two people collide.",
    HueScaleBody,
  ),
  entry(
    "Foundations",
    "TypeScale",
    SRC,
    "A 13 px base with five steps and three weights is enough for a dense tool, and it keeps every screen on the same rhythm.",
    TypeScaleBody,
  ),
  entry(
    "Foundations",
    "SpacingScale",
    SRC,
    "One 4 px grid drives every gap and padding, so rows, cards and dialogs align without one-off pixel values.",
    SpacingScaleBody,
  ),
  entry(
    "Foundations",
    "Radii",
    SRC,
    "Three radii and a hairline give controls, cards and dialogs a consistent softness without decoration.",
    RadiiBody,
  ),
  entry(
    "Foundations",
    "Elevation",
    SRC,
    "Only overlays float. Everything else is separated by a hairline, which keeps the page flat and makes menus and dialogs unmistakable.",
    ElevationBody,
  ),
  entry(
    "Foundations",
    "Motion",
    SRC,
    "Three short durations and one easing make feedback feel immediate and never decorative; reduced-motion removes them entirely.",
    MotionBody,
  ),
  entry(
    "Foundations",
    "Density",
    SRC,
    "People who live in the board all day can tighten the whole UI by one token swap, without a second layout.",
    DensityBody,
  ),
];
