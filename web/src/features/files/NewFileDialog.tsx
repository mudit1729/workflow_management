// "New file": three ways to start. A new issue writes a valid goal.md (so a card appears in
// Backlog), a change entry opens an issue's changes.md in the editor with a fresh entry at the
// bottom, and an empty file is any .md or .toml path. The path field is always visible and
// always validated; the helper fields above it just fill it in.
import { LoaderCircle } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Dialog, DialogContent, DialogFooter, Input } from "@/components/ui";
import type { GroupNode } from "@/gen/types";
import { useMe, useSnapshot, useWorkspaceFiles, useWriteWorkspaceFile } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useGo } from "@/lib/nav";
import type { EditIntent } from "./intent";
import { NativeSelect } from "./NativeSelect";
import { basename, joinPath, pathHint, slugify, validateNewPath, validateSlug } from "./paths";
import {
  CHANGE_TITLE_PLACEHOLDER,
  changeEntry,
  goalTemplate,
  newId,
  nowTs,
  templateForPath,
} from "./templates";

type Template = "issue" | "change" | "empty";

const TEMPLATES: { value: Template; title: string; hint: string; create: string }[] = [
  {
    value: "issue",
    title: "New issue (goal.md)",
    hint: "A folder with a goal.md becomes a card in Backlog.",
    create: "Create issue",
  },
  {
    value: "change",
    title: "Change entry",
    hint: "Add an entry to an issue's changes.md and edit it.",
    create: "Open editor",
  },
  {
    value: "empty",
    title: "Empty file",
    hint: "Any .md or .toml file in the workspace.",
    create: "Create file",
  },
];

export interface NewFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Group folder to start from (the folder of the file being viewed). */
  defaultGroup?: string;
  /** Issue id to start from for a change entry. */
  defaultIssue?: string;
  /** A file was written: select it. */
  onCreated: (path: string) => void;
  /** Open an existing file's editor with this intent (a change entry). */
  onEdit: (path: string, intent: Omit<EditIntent, "path">) => void;
}

export function NewFileDialog({ open, onOpenChange, ...rest }: NewFileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        title="New file"
        description="Files are the source of truth. The board reads a new file the moment it is saved."
      >
        <NewFileForm {...rest} close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function groupOptions(root: GroupNode): { path: string; label: string }[] {
  const out = [{ path: root.path, label: `${root.title} (top level)` }];
  const walk = (node: GroupNode, titles: string[]) => {
    for (const child of node.children) {
      const next = [...titles, child.title];
      out.push({ path: child.path, label: next.join(" / ") });
      walk(child, next);
    }
  };
  walk(root, []);
  return out;
}

function NewFileForm({
  defaultGroup,
  defaultIssue,
  onCreated,
  onEdit,
  close,
}: Omit<NewFileDialogProps, "open" | "onOpenChange"> & { close: () => void }) {
  const snapshot = useSnapshot().data;
  const files = useWorkspaceFiles();
  const write = useWriteWorkspaceFile();
  const me = useMe() ?? "shruti";
  const go = useGo();

  const [template, setTemplate] = useState<Template>("issue");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [override, setOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => (snapshot ? groupOptions(snapshot.groups) : []), [snapshot]);
  const issues = useMemo(
    () =>
      [...(snapshot?.issues ?? [])].sort((a, b) =>
        `${a.group_path.join("/")}/${a.title}`.localeCompare(
          `${b.group_path.join("/")}/${b.title}`,
        ),
      ),
    [snapshot],
  );
  const existing = useMemo(() => new Set(files.data?.map((f) => f.path)), [files.data]);

  const issuesDir = snapshot?.config.issues_dir ?? "issues";
  const [group, setGroup] = useState(defaultGroup ?? issuesDir);
  const [issueId, setIssueId] = useState(defaultIssue ?? "");
  const issue = issues.find((i) => i.id === issueId) ?? issues[0];

  // The path the helper fields imply. Typing in the path field overrides it until a helper changes.
  const derived =
    template === "issue"
      ? slug
        ? joinPath(group, slug, "goal.md")
        : ""
      : template === "change"
        ? issue
          ? joinPath(issue.path, "changes.md")
          : ""
        : "";
  const path = override ?? derived;

  const pathError = path
    ? validateNewPath(path, existing, { allowExisting: template === "change" })
    : null;
  const slugError = template === "issue" && slug ? validateSlug(slug) : null;
  const hint = !pathError && path ? pathHint(path, issuesDir) : null;
  const current = TEMPLATES.find((t) => t.value === template) ?? TEMPLATES[0];

  const ready =
    path !== "" &&
    !pathError &&
    (template === "issue"
      ? title.trim() !== "" && slug !== "" && !slugError
      : template === "change"
        ? Boolean(issue)
        : true);

  const pick = (next: Template) => {
    setTemplate(next);
    setOverride(null);
  };
  // A helper field changed: the path it implies replaces anything typed in the path field.
  const changeTitle = (v: string) => {
    setTitle(v);
    if (!slugEdited) setSlug(slugify(v));
    setOverride(null);
  };
  const changeSlug = (v: string) => {
    setSlugEdited(true);
    setSlug(v);
    setOverride(null);
  };
  const changeGroup = (v: string) => {
    setGroup(v);
    setOverride(null);
  };
  const changeIssue = (v: string) => {
    setIssueId(v);
    setOverride(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;

    if (template === "change") {
      onEdit(path, {
        append: changeEntry({ author: me }),
        h1: "# Changes",
        select: CHANGE_TITLE_PLACEHOLDER,
      });
      close();
      return;
    }

    setBusy(true);
    try {
      let text: string;
      let id: string | undefined;
      if (template === "issue") {
        const prefix = snapshot?.config.id_prefix ?? "wf";
        id = newId(prefix, new Set(snapshot?.issues.map((i) => i.id)));
        text = goalTemplate({ id, title: title.trim(), created: nowTs() });
      } else {
        text = templateForPath(path, { author: me });
      }
      const res = await write({ path, text });
      if (!res) return; // the hook explained the failure
      toast.success(`Created ${basename(path)} · the board re-read it`, {
        description: id ? `${id} is in Backlog.` : undefined,
        action: { label: "Open board", onClick: () => void go.board() },
      });
      onCreated(path);
      close();
    } catch (err) {
      toast.error("Could not create the file", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form data-wf="NewFileDialog" onSubmit={submit} className="flex flex-col gap-4">
      <RadioGroup.Root
        value={template}
        onValueChange={(v) => pick(v as Template)}
        aria-label="Template"
        className="flex flex-col gap-1.5"
      >
        {TEMPLATES.map((t) => (
          <RadioGroup.Item
            key={t.value}
            value={t.value}
            className={cn(
              "group flex items-start gap-2.5 rounded-md border border-border px-2.5 py-2 text-left outline-none",
              "transition-colors duration-100 ease-wf hover:bg-subtle",
              "focus-visible:ring-2 focus-visible:ring-focus",
              "data-[state=checked]:border-accent/60 data-[state=checked]:bg-accent-subtle",
            )}
          >
            <span
              aria-hidden
              className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-bg group-data-[state=checked]:border-accent"
            >
              <RadioGroup.Indicator className="size-1.5 rounded-full bg-accent" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-medium text-fg">{t.title}</span>
              <span className="text-fg-muted text-sm">{t.hint}</span>
            </span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>

      {template === "issue" && (
        <div className="flex flex-col gap-3">
          <Field label="Title" htmlFor="nf-title">
            <Input
              id="nf-title"
              value={title}
              autoFocus
              placeholder="Fix the tab-title count"
              onChange={(e) => changeTitle(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Group folder" htmlFor="nf-group">
              <NativeSelect
                id="nf-group"
                value={group}
                onChange={(e) => changeGroup(e.target.value)}
              >
                {groups.map((g) => (
                  <option key={g.path} value={g.path}>
                    {g.label}
                  </option>
                ))}
                {!groups.some((g) => g.path === group) && <option value={group}>{group}</option>}
              </NativeSelect>
            </Field>
            <Field label="Folder name" htmlFor="nf-slug" error={slugError}>
              <Input
                id="nf-slug"
                value={slug}
                aria-invalid={Boolean(slugError) || undefined}
                className="font-mono"
                placeholder="fix-tab-title-count"
                onChange={(e) => changeSlug(e.target.value)}
              />
            </Field>
          </div>
        </div>
      )}

      {template === "change" && (
        <Field label="Issue" htmlFor="nf-issue">
          <NativeSelect
            id="nf-issue"
            value={issue?.id ?? ""}
            onChange={(e) => changeIssue(e.target.value)}
          >
            {issues.map((i) => (
              <option key={i.id} value={i.id}>
                {i.id} · {i.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}

      <Field label="Path" htmlFor="nf-path" error={pathError} hint={hint}>
        <Input
          id="nf-path"
          value={path}
          aria-invalid={Boolean(pathError) || undefined}
          autoFocus={template === "empty"}
          spellCheck={false}
          className="font-mono"
          placeholder="issues/wf/web/my-issue/notes/idea.md"
          onChange={(e) => setOverride(e.target.value)}
        />
      </Field>

      <DialogFooter className="mt-0">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!ready || busy}>
          {busy && (
            <LoaderCircle size={14} strokeWidth={1.75} className="animate-spin" aria-hidden />
          )}
          {current.create}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="font-medium text-fg-muted text-sm">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : hint ? (
        <p className="text-fg-faint text-sm">{hint}</p>
      ) : null}
    </div>
  );
}
