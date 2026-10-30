// Kit entries of Workdatabase · Skills (src/features/skills).
import { InstallPanel, SkillItemView, SkillRow, SkillSource, SkillsView } from "@/features/skills";
import { allSkills, type Skill, type SkillsCatalog, useSkills } from "@/lib/api";
import { entry, type KitEntry, Loading, Sandbox, V } from "../kit-ui";

const SRC = "src/features/skills";

/** The skill the variants open: the entry point of the workflow plugin. */
const ENTRY_SKILL = "using-wf";
const OTHER_SKILL = "adding-work";

function WithSkills({
  children,
}: {
  children: (catalog: SkillsCatalog, skills: Skill[]) => React.ReactNode;
}) {
  const catalog = useSkills().data;
  if (!catalog) return <Loading height={120} />;
  return <>{children(catalog, allSkills(catalog))}</>;
}

// ---------------------------------------------------------------- SkillsView

function SkillsViewBody() {
  return (
    <>
      <V
        label="a skill open · adding-work"
        note="Install panel and plugin list on the left, the SKILL.md on the right. Under 900 px of page width an open skill is a screen of its own."
        fill
        height={720}
      >
        <Sandbox quiet path={`/skills?skill=${OTHER_SKILL}`}>
          <SkillsView />
        </Sandbox>
      </V>
      <V label="nothing open" fill height={640}>
        <Sandbox quiet path="/skills">
          <SkillsView />
        </Sandbox>
      </V>
      <V label="phone · the list" width={390} height={720}>
        <Sandbox quiet path="/skills">
          <SkillsView />
        </Sandbox>
      </V>
      <V label="phone · a skill open" width={390} height={720}>
        <Sandbox quiet path={`/skills?skill=${ENTRY_SKILL}`}>
          <SkillsView />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- SkillRow

function SkillRowBody() {
  return (
    <V
      label="three rows · the second selected"
      note="The words that differ lead: “Use when” steps back because every row starts with it."
      width={640}
    >
      <Sandbox quiet path="/skills">
        <WithSkills>
          {(_catalog, skills) => (
            <ul className="m-0 list-none divide-y divide-border rounded-md border border-border p-0">
              {skills.slice(0, 3).map((skill, i) => (
                <SkillRow key={skill.path} skill={skill} selected={i === 1} onSelect={() => {}} />
              ))}
            </ul>
          )}
        </WithSkills>
      </Sandbox>
    </V>
  );
}

// ---------------------------------------------------------------- InstallPanel

function InstallPanelBody() {
  return (
    <>
      <V
        label="the repository's plugins"
        note="The commands come from marketplace.json and plugin.json: add the marketplace, then install the plugin from it. Codex copies the skills into .agents/skills."
        width={640}
      >
        <WithSkills>{(catalog) => <InstallPanel catalog={catalog} />}</WithSkills>
      </V>
      <V
        label="no marketplace.json"
        note="Without a marketplace only the Codex command is left."
        width={640}
      >
        <InstallPanel catalog={{ plugins: [] }} />
      </V>
      <V label="narrow · 340 px" note="Long commands wrap instead of hiding." width={340}>
        <WithSkills>{(catalog) => <InstallPanel catalog={catalog} />}</WithSkills>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- SkillItemView

function ItemBody({ name, mode }: { name: string; mode: "rendered" | "source" }) {
  return (
    <WithSkills>
      {(catalog, skills) => {
        const skill = skills.find((s) => s.name === name) ?? skills[0];
        if (!skill) return null;
        const plugin = catalog.plugins.find((p) => p.skills.some((s) => s.path === skill.path));
        return (
          <SkillItemView skill={skill} plugin={plugin} defaultView={mode} onClose={() => {}} />
        );
      }}
    </WithSkills>
  );
}

function SkillItemViewBody() {
  return (
    <>
      <V
        label="Rendered · using-wf"
        note="The library's markdown viewer: the frontmatter as a header, every block tied to its line; hover a block and click its tag to see that line in Source."
        width={600}
        height={640}
      >
        <Sandbox quiet path="/skills">
          <ItemBody name={ENTRY_SKILL} mode="rendered" />
        </Sandbox>
      </V>
      <V label="Source · using-wf" width={600} height={640}>
        <Sandbox quiet path="/skills">
          <ItemBody name={ENTRY_SKILL} mode="source" />
        </Sandbox>
      </V>
    </>
  );
}

// ---------------------------------------------------------------- SkillSource

function SkillSourceBody() {
  return (
    <V
      label="line 3 marked"
      note="Line numbers stay one per file line while prose wraps; the frontmatter is dimmed."
      width={560}
      height={360}
    >
      <WithSkills>
        {(_catalog, skills) => {
          const skill = skills.find((s) => s.name === OTHER_SKILL) ?? skills[0];
          return skill ? (
            <div className="flex h-full min-h-0 flex-col rounded-md border border-border">
              <SkillSource path={skill.path} text={skill.text} line={3} />
            </div>
          ) : null;
        }}
      </WithSkills>
    </V>
  );
}

export const skillsEntries: KitEntry[] = [
  entry(
    "Workdatabase",
    "SkillsView",
    `${SRC}/SkillsView.tsx`,
    "A team gets the same skills only if they can find them and install them in one step, so the repository's plugins, their skills and the install commands sit on one page, with the SKILL.md of the one you open beside them.",
    SkillsViewBody,
  ),
  entry(
    "Workdatabase",
    "InstallPanel",
    `${SRC}/InstallPanel.tsx`,
    "Installing is three commands for Claude Code and one for Codex; each has a copy button, and they are built from the plugin's own manifests so they never go stale.",
    InstallPanelBody,
  ),
  entry(
    "Workdatabase",
    "SkillRow",
    `${SRC}/SkillRow.tsx`,
    "A skill is chosen by when it applies, so the row leads with the name, then the “Use when” sentence, then the file it lives in.",
    SkillRowBody,
  ),
  entry(
    "Workdatabase",
    "SkillItemView",
    `${SRC}/SkillItemView.tsx`,
    "A skill is a markdown file, so it is read the way library items are: as a page, or as the source it was written in.",
    SkillItemViewBody,
  ),
  entry(
    "Workdatabase",
    "SkillSource",
    `${SRC}/SkillSource.tsx`,
    "The source of a SKILL.md keeps its line numbers true, so a tag on the rendered page can point at the line that produced it.",
    SkillSourceBody,
  ),
];
