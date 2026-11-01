// What can be done with the skill a step runs (spec 5.3, "Actions"): read it, edit it when it is
// the workspace's or mine, edit a copy when it is built in or a team library's (read-only there),
// or open that library on GitHub. The reset buttons of the panel come after, as `children`.
import { ExternalLink } from "lucide-react";
import { type MouseEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui";
import { skillHref, useSkillsNav } from "@/features/skills/search";
import { type FlowScope, type Skill, type SkillsCatalog, shelfOf } from "@/lib/api";
import { CopyDialog } from "./CopyDialog";
import { type PanelKey, useEditNav } from "./search";

/** Where a library's skill is on GitHub, or undefined when the library has no link. */
export function githubHref(skill: Skill, catalog: SkillsCatalog | undefined): string | undefined {
  if (skill.source !== "library" || !skill.library) return undefined;
  const shelf = shelfOf(catalog, skill.library);
  if (!shelf?.url) return undefined;
  return `${shelf.url.replace(/\.git$/, "").replace(/\/$/, "")}/tree/HEAD/${shelf.path}/${skill.name}`;
}

export function SkillActions({
  skill,
  catalog,
  panel,
  scope = "team",
  children,
}: {
  /** The skill in effect. Undefined while the catalog loads, or when the reference does not resolve. */
  skill: Skill | undefined;
  catalog: SkillsCatalog | undefined;
  /** The panel the editor comes back to. */
  panel: PanelKey;
  /** Apply to in the panel: Edit a copy starts on the place that matches it. */
  scope?: FlowScope;
  children?: ReactNode;
}) {
  const skills = useSkillsNav();
  const edit = useEditNav();
  const [copying, setCopying] = useState(false);
  const github = skill && githubHref(skill, catalog);
  const editable = skill?.source === "workspace" || skill?.source === "me";

  const view = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!skill || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    skills.select(skill.ref);
  };

  return (
    <div data-wf="SkillActions" className="flex flex-wrap items-center gap-2">
      {skill ? (
        <Button asChild size="sm">
          <a href={skillHref(skill.ref)} onClick={view}>
            View skill
          </a>
        </Button>
      ) : (
        <Button size="sm" disabled>
          View skill
        </Button>
      )}
      {skill &&
        (editable ? (
          <Button size="sm" onClick={() => edit.open({ skill: skill.ref, for: panel })}>
            Edit
          </Button>
        ) : (
          <Button size="sm" onClick={() => setCopying(true)}>
            Edit a copy
          </Button>
        ))}
      {github && (
        <Button asChild size="sm" variant="ghost">
          <a href={github} target="_blank" rel="noreferrer">
            Open on GitHub
            <ExternalLink aria-hidden size={12} strokeWidth={1.75} />
          </a>
        </Button>
      )}
      {children}
      {skill && !editable && (
        <CopyDialog
          open={copying}
          onOpenChange={setCopying}
          skill={skill}
          forPanel={panel}
          scope={scope}
        />
      )}
    </div>
  );
}
