// "n" — scaffold a new issue: group, title, slug, template, size and, when it helps, context:
// a few lines of prose and items from the Workdatabase (library, glossary, files, decisions).
// Shows the file it will create, calls useNewIssue(), then opens the new issue in the drawer.
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Input,
  Kbd,
  Segmented,
  Textarea,
} from "@/components/ui";
import { ContextPicker, ContextPreview } from "@/features/context";
import { type ContextItem, toLink } from "@/features/context/types";
import type { GroupId, Size } from "@/gen/types";
import { useGroupTree, useIssueMap, useNewIssue, useSnapshot } from "@/lib/api";
import { useBoardSearch, useOpenIssue, useOpenIssueId } from "@/lib/nav";
import {
  Field,
  flattenGroupOptions,
  type GroupOption,
  GroupPicker,
  pickGroup,
  SLUG_MAX,
  SLUG_RE,
  slugify,
} from "./dialog-parts";
import { useShell } from "./shell-store";

export { slugify } from "./dialog-parts";

type Template = "default" | "bug" | "research" | "doc";

const TEMPLATES: { value: Template; label: string; hint: string }[] = [
  { value: "default", label: "Default", hint: "Context and success criteria." },
  { value: "bug", label: "Bug", hint: "Adds steps to reproduce, expected and actual." },
  {
    value: "research",
    label: "Research",
    hint: "Questions to answer and what counts as an answer.",
  },
  { value: "doc", label: "Doc", hint: "A document to write, with review criteria." },
];

const SIZES: { value: Size; label: string }[] = [
  { value: "xs", label: "XS" },
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
];

/** Event the board dispatches from its empty column states: open this dialog for a group. */
export const NEW_ISSUE_EVENT = "wf:new-issue";

/** What the event may carry besides the group: context to start with (the component gallery). */
export interface NewIssueEventDetail {
  group?: GroupId;
  context?: string;
  items?: ContextItem[];
}

/** Open the New issue dialog with context already filled in. */
export function openNewIssueWithContext(detail: NewIssueEventDetail) {
  window.dispatchEvent(new CustomEvent<NewIssueEventDetail>(NEW_ISSUE_EVENT, { detail }));
}

export function NewIssueDialog() {
  const open = useShell((s) => s.newIssueOpen);
  const setOpen = useShell((s) => s.setNewIssueOpen);
  // Context the event brought; the form reads it when it mounts, and it is gone after a close.
  const [preset, setPreset] = useState<NewIssueEventDetail>({});
  // Context makes the dialog wider: the picker and the preview need the room.
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<NewIssueEventDetail | null>).detail;
      setPreset({ context: detail?.context, items: detail?.items });
      setWide(!!detail?.context?.trim() || !!detail?.items?.length);
      setOpen(true, detail?.group);
    };
    window.addEventListener(NEW_ISSUE_EVENT, onEvent);
    return () => window.removeEventListener(NEW_ISSUE_EVENT, onEvent);
  }, [setOpen]);

  useEffect(() => {
    if (open) return;
    setPreset({});
    setWide(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => setOpen(o)}>
      <DialogContent
        size={wide ? "lg" : "md"}
        className="transition-[max-width] duration-150 ease-wf"
        title="New issue"
        description="Creates goal.md in a new issue folder. It starts in Backlog."
      >
        <NewIssueForm preset={preset} onWide={setWide} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function useDefaultGroup(options: GroupOption[]): GroupId | undefined {
  const preset = useShell((s) => s.newIssueGroup);
  const [search] = useBoardSearch();
  const openId = useOpenIssueId();
  const issues = useIssueMap();
  return pickGroup(options, [
    preset,
    search.group,
    openId ? issues.get(openId)?.group : undefined,
    options[1]?.node.id, // the first top-level group
    options[0]?.node.id,
  ]);
}

function NewIssueForm({
  preset,
  onWide,
  onDone,
}: {
  preset: NewIssueEventDetail;
  onWide: (wide: boolean) => void;
  onDone: () => void;
}) {
  const root = useGroupTree();
  const snapshot = useSnapshot().data;
  const newIssue = useNewIssue();
  const openIssue = useOpenIssue();
  const options = useMemo(() => (root ? flattenGroupOptions(root) : []), [root]);
  const defaultGroup = useDefaultGroup(options);

  const [groupId, setGroupId] = useState<GroupId | undefined>(defaultGroup);
  const [title, setTitle] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [template, setTemplate] = useState<Template>("default");
  const [size, setSize] = useState<Size>("m");
  const [context, setContext] = useState(preset.context ?? "");
  const [items, setItems] = useState<ContextItem[]>(preset.items ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const ids = { title: useId(), slug: useId(), group: useId(), context: useId() };

  // Adding context is what makes the dialog grow; clearing it all shrinks it back.
  const hasContext = context.trim() !== "" || items.length > 0;
  useEffect(() => onWide(hasContext), [hasContext, onWide]);

  const group = options.find((o) => o.node.id === (groupId ?? defaultGroup));
  const slug = slugTouched ? slugInput : slugify(title);
  const folder = group ? `${group.node.path}/${slug || "<slug>"}` : "";

  const slugError = (() => {
    if (!slug) return title.trim() ? "Add a slug for the folder name." : undefined;
    if (!SLUG_RE.test(slug)) return "Use lowercase letters, digits and single hyphens.";
    if (slug.length > SLUG_MAX) return `Keep it under ${SLUG_MAX} characters.`;
    if (!group) return undefined;
    if (snapshot?.issues.some((i) => i.path === folder))
      return "An issue already uses this folder. Pick another slug.";
    if (group.node.children.some((c) => c.slug === slug))
      return "A group already uses this folder. Pick another slug.";
    return undefined;
  })();
  const titleError = title.trim() ? undefined : "Give the issue a title.";
  const valid = !!group && !titleError && !slugError;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || !group) {
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    try {
      const result = await newIssue({
        group: group.node.id,
        slug,
        title: title.trim(),
        template,
        size,
        context_md: context.trim() || undefined,
        links: items.map(toLink),
      });
      if (!result) return; // the data layer already explained the failure
      onDone();
      if (result.created) {
        toast.success(`Created ${result.created}`, { description: `${folder}/goal.md` });
        void openIssue(result.created);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const templateHint = TEMPLATES.find((t) => t.value === template)?.hint;

  return (
    <form data-wf="NewIssueDialog" onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Group" htmlFor={ids.group}>
        <GroupPicker
          id={ids.group}
          options={options}
          value={group}
          onChange={setGroupId}
          loading={!root}
        />
      </Field>

      <Field label="Title" htmlFor={ids.title} error={showErrors ? titleError : undefined}>
        <Input
          id={ids.title}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Show lease expiry on cards"
          aria-invalid={showErrors && !!titleError}
          autoComplete="off"
        />
      </Field>

      <Field
        label="Slug"
        htmlFor={ids.slug}
        error={showErrors || slugTouched ? slugError : undefined}
        hint={slugTouched ? undefined : "Made from the title. Edit it to choose the folder name."}
      >
        <Input
          id={ids.slug}
          value={slug}
          onChange={(e) => {
            const next = e.target.value.toLowerCase().replace(/\s+/g, "-");
            // Clearing the field hands the slug back to the title.
            setSlugTouched(next !== "");
            setSlugInput(next);
          }}
          placeholder="show-lease-expiry-on-cards"
          className="font-mono"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={(showErrors || slugTouched) && !!slugError}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
        <Field label="Template" hint={templateHint}>
          <Segmented<Template>
            aria-label="Template"
            value={template}
            onChange={setTemplate}
            options={TEMPLATES.map(({ value, label }) => ({ value, label }))}
          />
        </Field>
        <Field label="Size" hint={size === "xs" || size === "s" ? "May skip plan.md." : " "}>
          <Segmented<Size> aria-label="Size" value={size} onChange={setSize} options={SIZES} />
        </Field>
      </div>

      <Field label="Context" htmlFor={ids.context}>
        <Textarea
          id={ids.context}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          onKeyDown={(e) => {
            // Enter writes a new line here; the form submits with ⌘↵ or Ctrl↵.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={2}
          placeholder="Why this matters, in 1–2 short paragraphs."
          className="max-h-[8.25rem] min-h-14"
        />
      </Field>

      <ContextPicker value={items} onChange={setItems} />
      {items.length > 0 && <ContextPreview items={items} issueTitle={title.trim() || undefined} />}

      <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-subtle px-3 py-2">
        <span className="shrink-0 text-fg-faint text-xs">Creates</span>
        <code
          className="min-w-0 truncate font-mono text-fg-muted text-sm"
          title={group ? `${folder}/goal.md` : undefined}
        >
          {group ? `${folder}/goal.md` : "…"}
        </code>
      </div>

      <DialogFooter className="mt-1">
        <span className="mr-auto hidden items-center gap-1 text-fg-faint text-xs sm:flex">
          <Kbd combo="Enter" /> to create
        </span>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={submitting || (showErrors && !valid)}>
          {submitting ? "Creating…" : "Create issue"}
        </Button>
      </DialogFooter>
    </form>
  );
}
