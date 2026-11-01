// The editor page of a skill (spec 5.4, /settings/flow/edit): the SourceEditor of the Files view,
// with the check list beside it. Two cases:
//   a copy      `?skill=<ref>&to=ws&name=<name>&for=plan`: nothing is written until Save; Save writes
//               the folder, points the step at the copy and goes back to the panel;
//   a skill     `?skill=ws:<name>` (or `me:<name>`): the file of the workspace or of my library, edited
//               where it lives, with the same checks.
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/common";
import { Button, Skeleton } from "@/components/ui";
import { SourceEditor } from "@/features/files/SourceEditor";
import {
  allSkills,
  type CopyTarget,
  copySkill,
  type FlowSaved,
  FlowWriteError,
  flowStep,
  isFlowStep,
  renameSkillText,
  type Skill,
  type SkillsCatalog,
  savePage,
  useLibraryPage,
  useSkills,
  useWorkspaceFile,
  useWriteWorkspaceFile,
  validateSkill,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { skillFilePath } from "./labels";
import { checksSummary, SkillChecks } from "./SkillChecks";
import { fileWords, showSaved, showUndoable } from "./saved";
import { type PanelKey, useEditNav } from "./search";

/** The step a copy is for: a step of the flow or a custom step, never the form. */
function stepOf(panel: PanelKey | undefined) {
  return panel && panel !== "new" ? panel : undefined;
}

/**
 * Does a path in a skill's text exist? `scripts/` and `references/` are in the skill's folder;
 * `../using-wf/…` is a sibling, which sits beside the built-ins once the skill is installed.
 */
export function pathExists(catalog: SkillsCatalog | undefined, skill: Skill) {
  const all = allSkills(catalog);
  return (rel: string): boolean => {
    const sibling = /^\.\.\/([^/]+)\/(.+)$/.exec(rel);
    if (!sibling) return skill.files.includes(rel);
    return all.some(
      (s) =>
        s.name === sibling[1] &&
        (s.source === "built-in" || s.source === skill.source) &&
        s.files.includes(sibling[2] as string),
    );
  };
}

export function SkillEditorPage({ width }: { width: number }) {
  const edit = useEditNav();
  const catalog = useSkills().data;
  const skill =
    edit.skill && catalog ? allSkills(catalog).find((s) => s.ref === edit.skill) : undefined;

  if (!edit.skill)
    return (
      <Gone
        title="No skill to edit"
        hint="Open the editor from a step: pick Edit, or Edit a copy."
        onBack={() => edit.back()}
      />
    );
  if (!catalog) return <EditorSkeleton />;
  if (!skill)
    return (
      <Gone
        title="Skill not found"
        hint={`No skill is called ${edit.skill}. It may have been renamed or removed.`}
        onBack={() => edit.back()}
      />
    );
  if (edit.to && edit.name)
    return (
      <CopyEditor
        key={`${skill.ref}>${edit.to}:${edit.name}`}
        skill={skill}
        catalog={catalog}
        to={edit.to}
        name={edit.name}
        width={width}
      />
    );
  if (skill.source === "workspace" || skill.source === "me")
    return <InPlaceEditor key={skill.ref} skill={skill} catalog={catalog} width={width} />;
  return (
    <Gone
      title="This skill is read-only"
      hint="Built-in and team library skills are not edited in place. Edit a copy of it from the step."
      onBack={() => edit.back()}
    />
  );
}

function Gone({ title, hint, onBack }: { title: string; hint: string; onBack: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <EmptyState
        title={title}
        hint={hint}
        action={
          <Button size="sm" onClick={onBack}>
            Back to the flow
          </Button>
        }
      />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading the skill"
      className="flex flex-col gap-3 p-6"
    >
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

// ---------------------------------------------------------------- the page

/** The page width from which the checks sit beside the editor; under it they are a summary above it. */
const CHECKS_BESIDE = 900;

export interface EditorShellProps {
  title: string;
  about: string;
  width: number;
  /** The text the editor starts with: the checks start from it and follow what is typed. */
  startText: string;
  /** The skill's folder name: the rules say `name:` must match it. */
  name: string;
  exists: (rel: string) => boolean;
  /** Why the last Save was refused, in a sentence. */
  refusal?: string;
  onBack: () => void;
  /** The SourceEditor, given what it reports the draft to: `<SourceEditor onDraftChange={onDraft} …/>`. */
  children: (onDraft: (text: string) => void) => ReactNode;
}

/** The header, the editor and the live checks, which follow the draft as it is typed. */
export function EditorShell({
  title,
  about,
  width,
  startText,
  name,
  exists,
  refusal,
  onBack,
  children,
}: EditorShellProps) {
  const [draft, setDraft] = useState(startText);
  const problems = useMemo(() => validateSkill(draft, name, { exists }), [draft, name, exists]);
  const beside = width >= CHECKS_BESIDE;

  return (
    <div data-wf="SkillEditorPage" className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-3 border-border border-b py-2 pr-4 pl-3">
        <Button variant="ghost" size="sm" data-panel-back="" onClick={onBack}>
          <ArrowLeft aria-hidden size={14} strokeWidth={1.75} />
          Skills flow
        </Button>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate font-semibold text-base text-fg">{title}</h1>
          <p className="truncate text-fg-muted text-sm">{about}</p>
        </div>
      </header>
      {!beside && (
        <details
          data-wf="SkillChecksSummary"
          className="shrink-0 border-border border-b px-4 py-2 text-sm"
        >
          <summary
            className={cn(
              "cursor-default select-none font-medium",
              problems.length === 0 ? "text-success-text" : "text-danger",
            )}
          >
            {checksSummary(problems)}
          </summary>
          <SkillChecks problems={problems} className="pt-2" />
        </details>
      )}
      <div className="flex min-h-0 min-w-0 flex-1">
        {/* The editor takes the page; its own toolbar has Save and Cancel. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children(setDraft)}</div>
        {beside && (
          <aside
            aria-label="Checks"
            className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-border border-l px-4 py-4"
          >
            <SkillChecks problems={problems} />
            {refusal && (
              <p role="alert" className="text-danger text-sm">
                {refusal}
              </p>
            )}
          </aside>
        )}
      </div>
      {!beside && refusal && (
        <p role="alert" className="shrink-0 border-border border-t px-4 py-2 text-danger text-sm">
          {refusal}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- a copy

function CopyEditor({
  skill,
  catalog,
  to,
  name,
  width,
}: {
  skill: Skill;
  catalog: SkillsCatalog;
  to: CopyTarget;
  name: string;
  width: number;
}) {
  const edit = useEditNav();
  const forPanel = stepOf(edit.for);
  const startText = useMemo(() => renameSkillText(skill.text, name), [skill.text, name]);
  // The copy lives beside the built-ins, so the paths that point at them hold in the copy too.
  const exists = useMemo(
    () => pathExists(catalog, { ...skill, source: to === "ws" ? "workspace" : "me" }),
    [catalog, skill, to],
  );
  const [refusal, setRefusal] = useState<string>();
  const saved = useRef<FlowSaved>(undefined);
  const where = to === "ws" ? "this workspace" : "your library";
  const forStep = forPanel && isFlowStep(forPanel) ? flowStep(forPanel).name : undefined;

  return (
    <EditorShell
      title={`Edit a copy of ${skill.name}`}
      about={`Saved as ${to === "ws" ? "ws" : "me"}:${name} in ${where}${
        forStep ? `, and the ${forStep} step then uses it` : ""
      }.`}
      width={width}
      startText={startText}
      name={name}
      exists={exists}
      refusal={refusal}
      onBack={() => edit.back()}
    >
      {(onDraft) => (
        <SourceEditor
          onDraftChange={onDraft}
          path={skillFilePath(name)}
          mode="edit"
          // The copy does not exist yet: every text is unsaved, and Save is there from the start.
          initialText=""
          startText={startText}
          variant="pane"
          wrap
          quiet
          save={async ({ text }) => {
            setRefusal(undefined);
            try {
              const result = await copySkill({
                ref: skill.ref,
                to,
                name,
                text,
                ...(forPanel ? { step: forPanel } : {}),
              });
              if (!result) return undefined;
              saved.current = result;
              return { rev: "copy" };
            } catch (err) {
              if (!(err instanceof FlowWriteError)) throw err;
              setRefusal(err.message);
              return undefined;
            }
          }}
          onSaved={() => {
            if (saved.current)
              showSaved(
                saved.current,
                forPanel,
                forStep
                  ? `Saved the copy and set ${forStep} to it in ${fileWords(saved.current.file)}`
                  : `Saved the copy in ${where}`,
              );
            edit.back();
          }}
          onCancel={() => edit.back()}
          onReload={() => edit.back()}
        />
      )}
    </EditorShell>
  );
}

// ---------------------------------------------------------------- a skill of the workspace or mine

function InPlaceEditor({
  skill,
  catalog,
  width,
}: {
  skill: Skill;
  catalog: SkillsCatalog;
  width: number;
}) {
  const edit = useEditNav();
  const mine = skill.source === "me";
  const path = skillFilePath(skill.name);
  const workspaceFile = useWorkspaceFile(mine ? undefined : path);
  const page = useLibraryPage(mine ? "me" : undefined, mine ? path : undefined);
  const live = mine ? page.data : workspaceFile.data;
  const gone = mine ? page.isError : workspaceFile.isError;
  const exists = useMemo(() => pathExists(catalog, skill), [catalog, skill]);

  // What the edit started from: the text and the revision when the file first arrived.
  const start = useRef<{ text: string; rev: string }>(undefined);
  if (!start.current && live && live.text !== null)
    start.current = { text: live.text, rev: live.rev };
  const writeWorkspace = useWriteWorkspaceFile();
  const write = (args: { path: string; text: string; base_rev?: string }) =>
    mine ? savePage({ alias: "me", ...args }) : writeWorkspace(args);

  if (!start.current)
    return gone ? (
      <Gone title="Skill not found" hint={`${path} is gone.`} onBack={() => edit.back()} />
    ) : (
      <EditorSkeleton />
    );

  const began = start.current;
  return (
    <EditorShell
      title={`Edit ${skill.ref}`}
      about={`${path} in ${mine ? "your library" : "this workspace"}.`}
      width={width}
      startText={began.text}
      name={skill.name}
      exists={exists}
      onBack={() => edit.back()}
    >
      {(onDraft) => (
        <SourceEditor
          onDraftChange={onDraft}
          path={path}
          mode="edit"
          initialText={began.text}
          baseRev={began.rev}
          liveRev={live?.rev}
          gone={gone}
          variant="pane"
          wrap
          quiet
          save={mine ? async (args) => write(args) : undefined}
          onSaved={({ rev, before }) => {
            showUndoable(
              `Saved ${path}`,
              stepOf(edit.for),
              async () => !!(await write({ path, text: before, base_rev: rev })),
            );
            edit.back();
          }}
          onCancel={() => edit.back()}
          onReload={() => edit.back()}
        />
      )}
    </EditorShell>
  );
}
