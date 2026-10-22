// "n" — scaffold a new issue: group, title, slug, template, size. Shows the file
// it will create, calls useNewIssue(), then opens the new issue in the drawer.
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
} from "@/components/ui";
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

export function NewIssueDialog() {
  const open = useShell((s) => s.newIssueOpen);
  const setOpen = useShell((s) => s.setNewIssueOpen);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ group?: GroupId } | null>).detail;
      setOpen(true, detail?.group);
    };
    window.addEventListener(NEW_ISSUE_EVENT, onEvent);
    return () => window.removeEventListener(NEW_ISSUE_EVENT, onEvent);
  }, [setOpen]);

  return (
    <Dialog open={open} onOpenChange={(o) => setOpen(o)}>
      <DialogContent
        size="md"
        title="New issue"
        description="Creates goal.md in a new issue folder. It starts in Backlog."
      >
        <NewIssueForm onDone={() => setOpen(false)} />
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

function NewIssueForm({ onDone }: { onDone: () => void }) {
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
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const ids = { title: useId(), slug: useId(), group: useId() };

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
