import {
  ArrowUpRight,
  Check,
  Columns3,
  Copy,
  FileText,
  Link2,
  ListTree,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { AuthorChip } from "@/components/common";
import {
  Button,
  Checkbox,
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Input,
  Kbd,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchInput,
  Segmented,
  Separator,
  Sheet,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
} from "@/components/ui";
import type { CriterionState } from "@/gen/types";
import { Caption, entry, type KitEntry, Row, V } from "../kit-ui";

const SRC = "src/components/ui";
const ICON = { size: 14, strokeWidth: 1.75 } as const;

// ---------------------------------------------------------------- Button, IconButton

const VARIANTS = ["primary", "secondary", "ghost", "subtle", "danger"] as const;

function ButtonBody() {
  return (
    <V
      fill
      label="variants × sizes"
      note="md is 28 px, sm is 24 px; icon sizes are 28 and 24 px squares."
    >
      <div className="w-full max-w-[900px] overflow-x-auto rounded-md border border-border">
        <div className="grid min-w-[760px] grid-cols-[88px_repeat(6,minmax(0,1fr))] items-center gap-y-3 px-3 py-3">
          <span />
          {["md", "sm", "md + icon", "icon", "icon-sm", "disabled"].map((h) => (
            <Caption key={h}>{h}</Caption>
          ))}
          {VARIANTS.map((v) => (
            <div key={v} className="contents">
              <code className="font-mono text-fg-muted text-xs">{v}</code>
              <span>
                <Button variant={v}>Button</Button>
              </span>
              <span>
                <Button variant={v} size="sm">
                  Button
                </Button>
              </span>
              <span>
                <Button variant={v}>
                  <Plus {...ICON} />
                  New issue
                </Button>
              </span>
              <span>
                <Button variant={v} size="icon" aria-label="Settings">
                  <Settings {...ICON} />
                </Button>
              </span>
              <span>
                <Button variant={v} size="icon-sm" aria-label="Settings">
                  <Settings {...ICON} />
                </Button>
              </span>
              <span>
                <Button variant={v} disabled>
                  Button
                </Button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </V>
  );
}

function IconButtonBody() {
  return (
    <>
      <V label="ghost · md and sm">
        <Row>
          <IconButton label="Copy link" icon={<Link2 {...ICON} />} />
          <IconButton label="Copy link" icon={<Link2 {...ICON} />} size="sm" />
        </Row>
      </V>
      <V label="subtle">
        <Row>
          <IconButton label="Close" icon={<X {...ICON} />} variant="subtle" />
          <IconButton label="Close" icon={<X {...ICON} />} variant="subtle" size="sm" />
        </Row>
      </V>
      <V label="toggle · active">
        <Row>
          <IconButton label="Columns" icon={<Columns3 {...ICON} />} active />
          <IconButton label="List" icon={<ListTree {...ICON} />} active={false} />
        </Row>
      </V>
      <V label="with a shortcut in the tooltip (hover)">
        <IconButton
          label="Open in new page"
          shortcut="o"
          icon={<ArrowUpRight {...ICON} />}
          tooltipSide="bottom"
        />
      </V>
      <V label="disabled">
        <IconButton label="Delete" icon={<Trash2 {...ICON} />} disabled />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- Chip, Kbd

const TONES = ["neutral", "accent", "danger", "stale", "success", "outline"] as const;

function ChipBody() {
  return (
    <>
      <V label="tones × sizes (xs, sm)">
        <div className="grid grid-cols-[88px_repeat(2,max-content)] items-center gap-x-6 gap-y-2.5">
          {TONES.map((t) => (
            <div key={t} className="contents">
              <code className="font-mono text-fg-muted text-xs">{t}</code>
              <Chip tone={t} size="xs">
                needs you
              </Chip>
              <Chip tone={t} size="sm">
                needs you
              </Chip>
            </div>
          ))}
        </div>
      </V>
      <V label="with an icon">
        <Row>
          <Chip tone="accent" icon={<Check />}>
            verified
          </Chip>
          <Chip tone="danger" icon={<X />}>
            fail
          </Chip>
          <Chip icon={<FileText />}>goal.md</Chip>
        </Row>
      </V>
      <V label="as a toggle (onClick, pressed)">
        <Row>
          <Chip onClick={() => undefined}>All</Chip>
          <Chip tone="accent" onClick={() => undefined} pressed>
            @codex
          </Chip>
        </Row>
      </V>
      <V label="truncates in 120 px" width={120}>
        <Chip>a very long label that cannot fit in the box</Chip>
      </V>
    </>
  );
}

function KbdBody() {
  return (
    <>
      <V label="chords and sequences">
        <Row>
          <Kbd combo="mod+k" />
          <Kbd combo="g w" />
          <Kbd combo="shift+?" />
          <Kbd combo="?" />
          <Kbd combo="[" />
        </Row>
      </V>
      <V label="free text">
        <Row>
          <Kbd>Esc</Kbd>
          <Kbd>↵</Kbd>
          <Kbd>Tab</Kbd>
        </Row>
      </V>
      <V label="inverted (inside tooltips)">
        <div className="inline-flex items-center gap-2 rounded-sm bg-fg px-2 py-1 text-bg text-sm">
          Open in new page
          <Kbd combo="o" tone="inverted" />
        </div>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- Segmented, Tabs

function SegmentedDemo({ size }: { size: "sm" | "md" }) {
  const [v, setV] = useState("changes");
  return (
    <Segmented
      size={size}
      aria-label="Log view"
      value={v}
      onChange={setV}
      options={[
        { value: "changes", label: "Changes", count: 12 },
        { value: "decisions", label: "Decisions", count: 3 },
        { value: "learnings", label: "Learnings", count: 3 },
      ]}
    />
  );
}

function SegmentedBody() {
  const [view, setView] = useState("lanes");
  return (
    <>
      <V label="md · with counts">
        <SegmentedDemo size="md" />
      </V>
      <V label="sm · with counts">
        <SegmentedDemo size="sm" />
      </V>
      <V label="with icons">
        <Segmented
          size="sm"
          aria-label="Plan view"
          value={view}
          onChange={setView}
          options={[
            { value: "lanes", label: "Lanes", icon: <Columns3 {...ICON} /> },
            { value: "list", label: "List", icon: <ListTree {...ICON} /> },
          ]}
        />
      </V>
      <V label="disabled option and disabled group">
        <Row>
          <Segmented
            size="sm"
            aria-label="Swimlanes"
            value="a"
            onChange={() => undefined}
            options={[
              { value: "a", label: "Groups" },
              { value: "b", label: "None", disabled: true },
            ]}
          />
          <Segmented
            size="sm"
            aria-label="Disabled"
            value="a"
            disabled
            onChange={() => undefined}
            options={[
              { value: "a", label: "Groups" },
              { value: "b", label: "None" },
            ]}
          />
        </Row>
      </V>
    </>
  );
}

function TabsBody() {
  return (
    <>
      <V label="with counts" width={480}>
        <Tabs defaultValue="now">
          <TabsList>
            <TabsTrigger value="now" count={1} countTone="accent">
              Now
            </TabsTrigger>
            <TabsTrigger value="goal" count="2/5">
              Goal
            </TabsTrigger>
            <TabsTrigger value="plan" count="1/5">
              Plan
            </TabsTrigger>
            <TabsTrigger value="log" count={12}>
              Log
            </TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>
          <TabsContent value="now" className="pt-3 text-fg-muted">
            One request needs you. Counts in accent ask for attention.
          </TabsContent>
          <TabsContent value="goal" className="pt-3 text-fg-muted">
            Two of five criteria are verified.
          </TabsContent>
          <TabsContent value="plan" className="pt-3 text-fg-muted">
            One of five tasks is done.
          </TabsContent>
          <TabsContent value="log" className="pt-3 text-fg-muted">
            Twelve entries.
          </TabsContent>
          <TabsContent value="files" className="pt-3 text-fg-muted">
            Files and lint findings.
          </TabsContent>
        </Tabs>
      </V>
      <V label="with a disabled tab" width={320}>
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Items</TabsTrigger>
            <TabsTrigger value="b">Glossary</TabsTrigger>
            <TabsTrigger value="c" disabled>
              Archive
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- Checkbox, fields, Switch

function CheckboxBody() {
  const [a, setA] = useState(false);
  const states: CriterionState[] = ["open", "claimed", "verified"];
  return (
    <>
      <V label="default">
        <Row>
          <span className="flex items-center gap-2">
            <Checkbox checked={a} onCheckedChange={setA} aria-label="Unchecked" />
            Unchecked
          </span>
          <span className="flex items-center gap-2">
            <Checkbox checked aria-label="Checked" />
            Checked
          </span>
          <span className="flex items-center gap-2">
            <Checkbox checked="indeterminate" aria-label="Mixed" />
            Mixed
          </span>
        </Row>
      </V>
      <V label="default · disabled">
        <Row>
          <Checkbox disabled aria-label="Disabled" />
          <Checkbox checked disabled aria-label="Disabled checked" />
        </Row>
      </V>
      <V label="criterion · open, claimed (hatched), verified (solid)">
        <Row>
          {states.map((s) => (
            <span key={s} className="flex items-center gap-2">
              <Checkbox variant="criterion" state={s} aria-label={s} />
              {s}
            </span>
          ))}
        </Row>
      </V>
      <V label="criterion · disabled">
        <Row>
          {states.map((s) => (
            <Checkbox key={s} variant="criterion" state={s} disabled aria-label={s} />
          ))}
        </Row>
      </V>
    </>
  );
}

function InputBody() {
  return (
    <>
      <V label="default" width={260}>
        <Input placeholder="Issue title" aria-label="Issue title" />
      </V>
      <V label="with a value" width={260}>
        <Input defaultValue="Live board updates" aria-label="Title" />
      </V>
      <V label="invalid" width={260}>
        <Input defaultValue="Not a slug!" aria-invalid aria-label="Slug" />
      </V>
      <V label="disabled" width={260}>
        <Input defaultValue="wf-3k9x2" disabled aria-label="Id" />
      </V>
    </>
  );
}

function TextareaBody() {
  return (
    <>
      <V label="default · grows with its content" width={320}>
        <Textarea placeholder="Write an answer…" aria-label="Answer" />
      </V>
      <V label="with text" width={320}>
        <Textarea
          defaultValue="Keep SSE. One-way push is enough, and it reconnects on its own."
          aria-label="Answer"
        />
      </V>
      <V label="disabled" width={320}>
        <Textarea disabled defaultValue="Answered by @shruti." aria-label="Answer" />
      </V>
    </>
  );
}

function SearchInputDemo({
  size,
  shortcut,
  start = "",
}: {
  size: "sm" | "md";
  shortcut?: string;
  start?: string;
}) {
  const [v, setV] = useState(start);
  return (
    <SearchInput
      size={size}
      value={v}
      onChange={setV}
      placeholder="Filter issues"
      shortcut={shortcut}
    />
  );
}

function SearchInputBody() {
  return (
    <>
      <V label="md" width={240}>
        <SearchInputDemo size="md" />
      </V>
      <V label="sm" width={200}>
        <SearchInputDemo size="sm" />
      </V>
      <V
        label="with a shortcut key cap"
        width={240}
        note="The cap shows while empty and unfocused; / focuses the newest field on the page."
      >
        <SearchInputDemo size="md" shortcut="/" />
      </V>
      <V label="with a value (clear button)" width={240}>
        <SearchInputDemo size="md" start="lease" />
      </V>
    </>
  );
}

function SwitchBody() {
  const [on, setOn] = useState(true);
  return (
    <>
      <V label="on / off">
        <Row>
          <span className="flex items-center gap-2">
            <Switch checked={on} onCheckedChange={setOn} aria-label="Notifications" />
            Notifications
          </span>
          <Switch aria-label="Off" />
        </Row>
      </V>
      <V label="disabled">
        <Row>
          <Switch disabled aria-label="Disabled off" />
          <Switch disabled defaultChecked aria-label="Disabled on" />
        </Row>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- Separator, Collapsible, Skeleton

function SeparatorBody() {
  return (
    <>
      <V label="horizontal" width={240}>
        <div className="flex flex-col gap-2 text-fg-muted">
          Above
          <Separator />
          Below
        </div>
      </V>
      <V label="vertical">
        <div className="flex h-6 items-center gap-3 text-fg-muted">
          Left
          <Separator orientation="vertical" />
          Right
        </div>
      </V>
    </>
  );
}

function CollapsibleBody() {
  const [open, setOpen] = useState(false);
  return (
    <V label="click to fold" width={320}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            {open ? "Hide" : "Show"} failed attempts (2)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-8 text-fg-muted">
            <li>notify 9.0-rc lost the remove event.</li>
            <li>A 2 s poll missed a rename.</li>
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </V>
  );
}

function SkeletonBody() {
  return (
    <>
      <V label="lines" width={260}>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </V>
      <V label="avatar and row" width={260}>
        <div className="flex items-center gap-2">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      </V>
      <V label="card" width={264}>
        <Skeleton className="h-24 w-full rounded-md" />
      </V>
    </>
  );
}

// ---------------------------------------------------------------- overlays

function TooltipBody() {
  return (
    <V label="hover or focus (300 ms delay)">
      <Row>
        <Tooltip content="Change status">
          <Button variant="secondary" size="sm">
            Plain
          </Button>
        </Tooltip>
        <Tooltip content="New issue" shortcut="n">
          <Button variant="secondary" size="sm">
            With shortcut
          </Button>
        </Tooltip>
        <Tooltip content="Unfold Done" side="right">
          <Button variant="secondary" size="sm">
            Side right
          </Button>
        </Tooltip>
        <Tooltip content="Below the trigger" side="bottom">
          <Button variant="secondary" size="sm">
            Side bottom
          </Button>
        </Tooltip>
      </Row>
    </V>
  );
}

function MenuSample() {
  const [show, setShow] = useState(true);
  const [sort, setSort] = useState("priority");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          Open the menu
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>Card</DropdownMenuLabel>
        <DropdownMenuItem icon={<ArrowUpRight {...ICON} />} shortcut="o">
          Open in new page
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Copy {...ICON} />}>Copy link</DropdownMenuItem>
        <DropdownMenuItem icon={<FileText {...ICON} />} hint="Needs Move anyway" muted>
          Move to Done
        </DropdownMenuItem>
        <DropdownMenuItem disabled>Disabled item</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={<Columns3 {...ICON} />}>Move to…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem>Planned</DropdownMenuItem>
            <DropdownMenuItem selected>In progress</DropdownMenuItem>
            <DropdownMenuItem>Review</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>View</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={show}
          onCheckedChange={setShow}
          onSelect={(e: Event) => e.preventDefault()}
        >
          Show cancelled
        </DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
          <DropdownMenuRadioItem value="priority" onSelect={(e: Event) => e.preventDefault()}>
            Sort by priority
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="activity" onSelect={(e: Event) => e.preventDefault()}>
            Sort by activity
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" icon={<Trash2 {...ICON} />}>
          Cancel issue
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DropdownMenuBody() {
  return (
    <V
      label="click to open"
      note="Label, icons, shortcut, hint, checkbox, radio, disabled and danger items. Hover “Move to…” for the submenu."
    >
      <MenuSample />
    </V>
  );
}

function PopoverBody() {
  return (
    <V label="click to open">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm">
            Open the popover
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <div className="flex flex-col gap-2">
            <p className="font-medium text-base">Task T-3</p>
            <p className="text-fg-muted text-sm">
              A popover holds a small task detail anchored to what you clicked.
            </p>
            <Input placeholder="Add a note" aria-label="Note" />
          </div>
        </PopoverContent>
      </Popover>
    </V>
  );
}

function HoverCardBody() {
  return (
    <V label="hover the handle (400 ms)">
      <HoverCard>
        <HoverCardTrigger asChild>
          <span className="cursor-default font-medium underline decoration-border-strong underline-offset-[3px]">
            @codex
          </span>
        </HoverCardTrigger>
        <HoverCardContent>
          <div className="flex flex-col gap-2">
            <AuthorChip handle="codex" />
            <p className="text-fg-muted text-sm">A hover card previews without leaving the page.</p>
          </div>
        </HoverCardContent>
      </HoverCard>
    </V>
  );
}

function DialogBody() {
  return (
    <V label="sizes · click to open" note="sm 400, md 560, lg 760 px; full leaves a 24 px margin.">
      <Row>
        {(["sm", "md", "lg", "full"] as const).map((size) => (
          <Dialog key={size}>
            <DialogTrigger asChild>
              <Button variant="secondary" size="sm">
                Dialog · {size}
              </Button>
            </DialogTrigger>
            <DialogContent
              size={size}
              title={`A ${size} dialog`}
              description="Title, optional description and a close button; the body scrolls."
            >
              <div className="flex flex-col gap-2 text-fg-muted">
                <p>Dialogs hold one decision. Footer actions sit at the right.</p>
                <Input placeholder="A field" aria-label="Field" />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="primary">Save</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ))}
      </Row>
    </V>
  );
}

function SheetBody() {
  const [open, setOpen] = useState(false);
  return (
    <V label="click to open" note="No dimming; click outside or press Esc to close.">
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Open the sheet
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Files" description="wf-3k9x2" width={420}>
        <div className="px-4 pb-4 text-fg-muted">
          A sheet is a side panel that keeps the page usable behind it.
        </div>
      </Sheet>
    </V>
  );
}

function InlineCommand({ start = "" }: { start?: string }) {
  const [q, setQ] = useState(start);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Command>
        <CommandInput placeholder="Search or jump…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          <CommandGroup heading="Issues">
            <CommandItem hint="wf-3k9x2" icon={<FileText />}>
              Live board updates
            </CommandItem>
            <CommandItem hint="wf-c2pn6" icon={<FileText />}>
              Command palette
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem shortcut="n" icon={<Plus />}>
              New issue
            </CommandItem>
            <CommandItem shortcut="mod+b">Toggle the sidebar</CommandItem>
            <CommandItem disabled>Disabled action</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

function CommandBody() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <V label="inline" width={420}>
        <InlineCommand />
      </V>
      <V label="no match" width={420}>
        <InlineCommand start="zzz" />
      </V>
      <V label="as a dialog (CommandDialog)">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Open the dialog
        </Button>
        <CommandDialog open={open} onOpenChange={setOpen} title="Kit command dialog">
          <CommandInput placeholder="Type a command…" />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup heading="Go to">
              <CommandItem onSelect={() => setOpen(false)} shortcut="g w">
                Board
              </CommandItem>
              <CommandItem onSelect={() => setOpen(false)} shortcut="g i">
                Inbox
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </V>
    </>
  );
}

export const primitiveEntries: KitEntry[] = [
  entry(
    "Primitives",
    "Button",
    `${SRC}/button.tsx`,
    "Five variants and two heights cover every action: one primary per view, quiet secondary and ghost for the rest, danger only where it destroys.",
    ButtonBody,
  ),
  entry(
    "Primitives",
    "IconButton",
    `${SRC}/icon-button.tsx`,
    "Icon-only controls always carry a label, which is both the tooltip and the accessible name.",
    IconButtonBody,
  ),
  entry(
    "Primitives",
    "Chip",
    `${SRC}/chip.tsx`,
    "A chip is a small fact; its tone says whether the fact needs attention (accent, danger, stale) or is just information.",
    ChipBody,
  ),
  entry(
    "Primitives",
    "Kbd",
    `${SRC}/kbd.tsx`,
    "Shortcuts are only learned if they are shown where the action is, in a small key cap that reads the same in every tooltip and menu.",
    KbdBody,
  ),
  entry(
    "Primitives",
    "Segmented",
    `${SRC}/segmented.tsx`,
    "Two to four mutually exclusive views sit in one control that always has a selection and moves with the arrow keys.",
    SegmentedBody,
  ),
  entry(
    "Primitives",
    "Tabs",
    `${SRC}/tabs.tsx`,
    "Underline tabs with counts tell you what is inside each tab, and which one asks for attention, before you open it.",
    TabsBody,
  ),
  entry(
    "Primitives",
    "Checkbox",
    `${SRC}/checkbox.tsx`,
    "The criterion variant gives 'claimed' its own hatched look, so a ticked box without evidence never looks verified.",
    CheckboxBody,
  ),
  entry(
    "Primitives",
    "Input",
    `${SRC}/input.tsx`,
    "A hairline field with an accent border and soft ring on focus keeps forms calm and the focused field obvious.",
    InputBody,
  ),
  entry(
    "Primitives",
    "Textarea",
    `${SRC}/input.tsx`,
    "Answers and notes grow with their content instead of scrolling inside a tiny box.",
    TextareaBody,
  ),
  entry(
    "Primitives",
    "SearchInput",
    `${SRC}/input.tsx`,
    "Every list filters by typing; the field clears with Esc and shows the key that focuses it.",
    SearchInputBody,
  ),
  entry(
    "Primitives",
    "Switch",
    `${SRC}/switch.tsx`,
    "A switch is for a setting that applies immediately, like notifications or the prototype archify toggle.",
    SwitchBody,
  ),
  entry(
    "Primitives",
    "Separator",
    `${SRC}/separator.tsx`,
    "A hairline groups related controls without adding a box.",
    SeparatorBody,
  ),
  entry(
    "Primitives",
    "Collapsible",
    `${SRC}/collapsible.tsx`,
    "Done, handoff notes and failed attempts fold away with a count, so the page leads with what matters now.",
    CollapsibleBody,
  ),
  entry(
    "Primitives",
    "Skeleton",
    `${SRC}/skeleton.tsx`,
    "Loading keeps the layout's shape, so nothing jumps when the data arrives.",
    SkeletonBody,
  ),
  entry(
    "Primitives",
    "Tooltip",
    `${SRC}/tooltip.tsx`,
    "An inverted tooltip names an icon, shows an absolute time or a shortcut, and never holds anything you must read.",
    TooltipBody,
  ),
  entry(
    "Primitives",
    "DropdownMenu",
    `${SRC}/dropdown-menu.tsx`,
    "Menus carry commands with icons, shortcuts and hints, including the illegal-but-possible ones, so the rules are visible at the moment of choice.",
    DropdownMenuBody,
  ),
  entry(
    "Primitives",
    "Popover",
    `${SRC}/popover.tsx`,
    "A popover holds a small, anchored detail (a task, the prototype controls) without taking the whole screen.",
    PopoverBody,
  ),
  entry(
    "Primitives",
    "HoverCard",
    `${SRC}/hover-card.tsx`,
    "Hovering an author previews who they are without a click.",
    HoverCardBody,
  ),
  entry(
    "Primitives",
    "Dialog",
    `${SRC}/dialog.tsx`,
    "A dialog is for one decision that needs your full attention; four sizes fit a confirmation or a full diagram.",
    DialogBody,
  ),
  entry(
    "Primitives",
    "Sheet",
    `${SRC}/sheet.tsx`,
    "A non-modal side panel keeps the page usable while you read secondary content such as files.",
    SheetBody,
  ),
  entry(
    "Primitives",
    "Command",
    `${SRC}/command.tsx`,
    "The same grouped, filterable list powers the palette and any picker, with key caps for the actions that have one.",
    CommandBody,
  ),
];
