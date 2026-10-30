// One skill, read from its SKILL.md. The page is the rendered file (its frontmatter as a header,
// then every block tied to its line by the library's markdown viewer); "Source" shows the text
// with line numbers. Same toolbar and path row as a library item.
import { ArrowLeft, ScrollText, X } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/common";
import { Button, Chip, IconButton, Segmented } from "@/components/ui";
import { MarkdownDocument, Properties, Property } from "@/features/library/MarkdownDocument";
import type { Skill, SkillPlugin } from "@/lib/api";
import { SkillSource } from "./SkillSource";

export type SkillMode = "rendered" | "source";

export interface SkillItemViewProps {
  skill: Skill;
  plugin?: SkillPlugin;
  /** Closes the pane (or goes back, on a small screen). Without it no close button shows. */
  onClose?: () => void;
  /** `screen` is the small-screen variant: the skill fills the page and the button reads "Skills". */
  variant?: "pane" | "screen";
  defaultView?: SkillMode;
}

export function SkillItemView({
  skill,
  plugin,
  onClose,
  variant = "pane",
  defaultView = "rendered",
}: SkillItemViewProps) {
  // Keyed by name: opening another skill starts on the page again, at the top.
  return (
    <Body
      key={skill.name}
      skill={skill}
      plugin={plugin}
      onClose={onClose}
      variant={variant}
      defaultView={defaultView}
    />
  );
}

function Body({
  skill,
  plugin,
  onClose,
  variant,
  defaultView,
}: Required<Pick<SkillItemViewProps, "variant" | "defaultView">> &
  Omit<SkillItemViewProps, "variant" | "defaultView">) {
  const [mode, setMode] = useState<SkillMode>(defaultView);
  const [line, setLine] = useState<number>();
  const cut = skill.path.lastIndexOf("/") + 1;

  const changeMode = (next: SkillMode) => {
    setLine(undefined);
    setMode(next);
  };
  const showSource = (at: number) => {
    setLine(at);
    setMode("source");
  };

  return (
    <div data-wf="SkillItemView" data-view={mode} className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-border border-b py-1 pr-3 pl-5">
        {variant === "screen" && onClose && (
          <Button variant="ghost" size="sm" data-skill-back="" onClick={onClose} className="-ml-3">
            <ArrowLeft aria-hidden size={14} strokeWidth={1.75} />
            Skills
          </Button>
        )}
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-fg-muted text-sm">
          <ScrollText aria-hidden size={14} strokeWidth={1.75} />
          Skill
        </span>
        <Chip tone="outline" title={`Ships in the ${plugin?.name ?? skill.plugin} plugin`}>
          {plugin?.name ?? skill.plugin}
        </Chip>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Segmented
            size="sm"
            aria-label="Show the rendered page or the markdown source"
            value={mode}
            onChange={changeMode}
            options={[
              { value: "rendered", label: "Rendered" },
              { value: "source", label: "Source" },
            ]}
          />
          {variant === "pane" && onClose && (
            <IconButton
              size="sm"
              label="Close"
              shortcut="Escape"
              icon={<X size={14} strokeWidth={1.75} />}
              onClick={onClose}
            />
          )}
        </div>
      </div>

      <div
        data-wf="SkillPathRow"
        className="flex h-8 shrink-0 items-center gap-1 border-border border-b pr-3 pl-5 text-fg-faint text-xs"
      >
        <code className="flex min-w-0 font-mono" title={skill.path}>
          {/* The folder gives way first, then the name. */}
          <span className="min-w-0 shrink-[20] truncate">{skill.path.slice(0, cut)}</span>
          <span className="min-w-0 truncate">{skill.path.slice(cut)}</span>
        </code>
        <CopyButton text={skill.path} label="Copy file path" />
      </div>

      {mode === "source" ? (
        <SkillSource path={skill.path} text={skill.text} line={line} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 py-4">
            <MarkdownDocument
              path={skill.path}
              text={skill.text}
              variant="pane"
              margin={24}
              frontmatter={<SkillHeader skill={skill} plugin={plugin} />}
              onJump={showSource}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** The frontmatter as a header: the name, the whole description, and where it comes from. */
function SkillHeader({ skill, plugin }: { skill: Skill; plugin?: SkillPlugin }) {
  // The rest of the description ("Orchestrator. …  Avoid for …") steps back behind the sentence
  // that says when to use the skill.
  const rest =
    skill.use_when && skill.description.startsWith(skill.use_when)
      ? skill.description.slice(skill.use_when.length).trim()
      : "";
  return (
    <header data-wf="SkillHeader" className="flex min-w-0 flex-col gap-2">
      {/* Three steps down: the name leads (16 px, semibold), the sentence that says when to use it
          is quieter (13 px, muted), the rest of the description quieter still. */}
      <h2 className="font-semibold text-fg text-lg leading-snug">{skill.name}</h2>
      <p className="text-base text-fg-muted leading-normal">
        {skill.use_when || skill.description}
      </p>
      {rest && <p className="text-fg-faint text-sm leading-normal">{rest}</p>}
      {/* One key and its value per row: a two-column grid broke the pairs across the columns. */}
      <Properties>
        <Property label="plugin" wide>
          {plugin?.name ?? skill.plugin}
          {plugin?.version && <span className="text-fg-faint"> · v{plugin.version}</span>}
        </Property>
        <Property label="lines" wide>
          <span className="tabular">{skill.lines}</span>
        </Property>
        <Property label="claude" wide>
          <code className="font-mono text-sm">
            /{plugin?.name ?? skill.plugin}:{skill.name}
          </code>
        </Property>
      </Properties>
    </header>
  );
}
