// "New group…" (command palette) — scaffold a group folder with a _group.md: parent,
// title, slug and a hue. Shows the file it will create, calls useNewGroup(), then
// shows the new group on the board.
import { Check } from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { type FormEvent, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Dialog, DialogContent, DialogFooter, Input, Kbd } from "@/components/ui";
import type { GroupId } from "@/gen/types";
import { useGroupTree, useNewGroup, useSnapshot } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useBoardSearch } from "@/lib/nav";
import {
  Field,
  flattenGroupOptions,
  GroupPicker,
  pickGroup,
  SLUG_MAX,
  SLUG_RE,
  slugify,
} from "./dialog-parts";
import { useShell } from "./shell-store";
import { useSelectGroup } from "./useSelectGroup";

const HUES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export function NewGroupDialog() {
  const open = useShell((s) => s.newGroupOpen);
  const setOpen = useShell((s) => s.setNewGroupOpen);

  return (
    <Dialog open={open} onOpenChange={(o) => setOpen(o)}>
      <DialogContent
        size="sm"
        title="New group"
        description="Creates a folder with a _group.md. Issues inside it roll up to the group."
      >
        <NewGroupForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NewGroupForm({ onDone }: { onDone: () => void }) {
  const root = useGroupTree();
  const snapshot = useSnapshot().data;
  const newGroup = useNewGroup();
  const selectGroup = useSelectGroup();
  const preset = useShell((s) => s.newGroupParent);
  const [board] = useBoardSearch();
  const options = useMemo(() => (root ? flattenGroupOptions(root) : []), [root]);
  const defaultParent = pickGroup(options, [preset, board.group, options[0]?.node.id]);

  const [parentId, setParentId] = useState<GroupId | undefined>(defaultParent);
  const [title, setTitle] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [hue, setHue] = useState<number | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const ids = { title: useId(), slug: useId(), parent: useId() };

  const parent = options.find((o) => o.node.id === (parentId ?? defaultParent));
  const slug = slugTouched ? slugInput : slugify(title);
  const folder = parent ? `${parent.node.path}/${slug || "<slug>"}` : "";

  // Suggest a hue the siblings do not use yet, so neighbours stay easy to tell apart.
  const suggestedHue = useMemo(() => {
    const used = new Set(parent?.node.children.map((c) => c.color));
    return HUES.find((h) => !used.has(h)) ?? HUES[(parent?.node.children.length ?? 0) % 8];
  }, [parent]);
  const color = hue ?? suggestedHue;

  const slugError = (() => {
    if (!slug) return title.trim() ? "Add a slug for the folder name." : undefined;
    if (!SLUG_RE.test(slug)) return "Use lowercase letters, digits and single hyphens.";
    if (slug.length > SLUG_MAX) return `Keep it under ${SLUG_MAX} characters.`;
    if (!parent) return undefined;
    if (parent.node.children.some((c) => c.slug === slug))
      return "A group already uses this folder. Pick another slug.";
    if (snapshot?.issues.some((i) => i.path === folder))
      return "An issue already uses this folder. Pick another slug.";
    return undefined;
  })();
  const titleError = title.trim() ? undefined : "Give the group a title.";
  const valid = !!parent && !titleError && !slugError;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || !parent) {
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    try {
      const result = await newGroup({
        parent: parent.node.id,
        slug,
        title: title.trim(),
        color,
      });
      if (!result) return; // the data layer already explained the failure
      onDone();
      toast.success(`Created group ${title.trim()}`, { description: `${folder}/_group.md` });
      if (result.created) selectGroup(result.created);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form data-wf="NewGroupDialog" onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Parent group" htmlFor={ids.parent}>
        <GroupPicker
          id={ids.parent}
          options={options}
          value={parent}
          onChange={setParentId}
          loading={!root}
        />
      </Field>

      <Field label="Title" htmlFor={ids.title} error={showErrors ? titleError : undefined}>
        <Input
          id={ids.title}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Billing"
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
          placeholder="billing"
          className="font-mono"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={(showErrors || slugTouched) && !!slugError}
        />
      </Field>

      <Field label="Color" hint="Identifies the group on cards and in the nav.">
        <ToggleGroup.Root
          type="single"
          value={String(color)}
          onValueChange={(v) => v && setHue(Number(v))}
          aria-label="Group color"
          className="flex items-center gap-1.5"
        >
          {HUES.map((h) => (
            <ToggleGroup.Item
              key={h}
              value={String(h)}
              aria-label={`Color ${h}`}
              className={cn(
                "flex size-5 cursor-default items-center justify-center rounded-full text-white",
                "outline-offset-2 transition-transform duration-100 ease-wf hover:scale-110",
                "data-[state=on]:ring-2 data-[state=on]:ring-border-strong data-[state=on]:ring-offset-2 data-[state=on]:ring-offset-bg",
              )}
              style={{ background: `var(--wf-hue-${h})` }}
            >
              {h === color && <Check aria-hidden size={10} strokeWidth={3.25} />}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </Field>

      <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-subtle px-3 py-2">
        <span className="shrink-0 text-fg-faint text-xs">Creates</span>
        <code
          className="min-w-0 truncate font-mono text-fg-muted text-sm"
          title={parent ? `${folder}/_group.md` : undefined}
        >
          {parent ? `${folder}/_group.md` : "…"}
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
          {submitting ? "Creating…" : "Create group"}
        </Button>
      </DialogFooter>
    </form>
  );
}
