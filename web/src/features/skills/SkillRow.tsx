// One skill in the list: its name, when to use it (the "Use when" sentence of its description)
// and the file it lives in.
import { ScrollText } from "lucide-react";
import type { MouseEvent } from "react";
import type { Skill } from "@/lib/api";
import { cn } from "@/lib/cn";
import { skillHref } from "./search";

export interface SkillRowProps {
  skill: Skill;
  selected: boolean;
  onSelect: (name: string) => void;
}

const LEAD = /^Use when\s+/;

export function SkillRow({ skill, selected, onSelect }: SkillRowProps) {
  const open = (e: MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle new-tab clicks.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onSelect(skill.name);
  };
  const lead = LEAD.exec(skill.use_when)?.[0];
  const rest = lead ? skill.use_when.slice(lead.length) : skill.use_when;

  return (
    <li data-wf="SkillRow" data-skill={skill.name}>
      <a
        id={`skill-row-${skill.name}`}
        data-skill-row=""
        href={skillHref(skill.name)}
        onClick={open}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex items-start gap-2.5 px-4 py-2.5 outline-none transition-colors duration-100 ease-wf",
          "hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
          selected && "bg-muted hover:bg-muted focus-visible:bg-muted",
        )}
      >
        <ScrollText
          aria-hidden
          size={14}
          strokeWidth={1.75}
          className="mt-[3px] shrink-0 text-fg-muted"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium text-base text-fg leading-5">{skill.name}</span>
          {/* "Use when" opens every line, so it steps back and the words that differ lead. */}
          <span className="line-clamp-2 text-fg-muted text-sm">
            {lead && <span className="text-fg-faint">{lead}</span>}
            {rest}
          </span>
          <span className="truncate font-mono text-fg-faint text-xs" title={skill.path}>
            {skill.path}
          </span>
        </span>
      </a>
    </li>
  );
}
