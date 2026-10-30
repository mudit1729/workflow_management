// Library · Skills: the plugins of this repository and the skills each one ships, how a team
// installs them (Claude Code, Codex), and the SKILL.md of the one you open. Goal: distribute skills
// and plugins across the team. One 44 px top bar that starts with the Library tabs, then
// by page width (the rail counts as page):
//   900 px and up   the install panel and the list beside the open skill
//   under 900 px    an open skill is a screen of its own, and so it is on a phone
import { BookOpen, Package, SearchX } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { EmptyState, ViewTabs } from "@/components/common";
import { Button, Chip, Skeleton } from "@/components/ui";
import { useElementWidth } from "@/features/library/useElementWidth";
import { allSkills, type SkillPlugin, type SkillsCatalog, useSkills } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useHotkey, useMediaQuery } from "@/lib/hooks";
import { InstallPanel } from "./InstallPanel";
import { SkillItemView } from "./SkillItemView";
import { SkillRow } from "./SkillRow";
import { useSkillsNav } from "./search";

/** Page width at which the open skill docks beside the list. */
const DOCK_AT = 900;
/** The pane reads a document: it grows with the page, 520 to 680 px. */
const paneWidthFor = (page: number) => Math.round(Math.min(680, Math.max(520, page * 0.45)));

export function SkillsView() {
  const nav = useSkillsNav();
  const query = useSkills();
  const catalog = query.data;
  const skills = useMemo(() => allSkills(catalog), [catalog]);
  const selected = skills.find((s) => s.name === nav.selected);
  const plugin = catalog?.plugins.find((p) => p.skills.some((s) => s.path === selected?.path));

  const narrow = useMediaQuery("(max-width: 767px)");
  // Measured on the root, which every layout renders, so a resize is seen from the skill screen too.
  const [measure, width] = useElementWidth();
  const docked = !narrow && width >= DOCK_AT;
  const itemScreen = Boolean(selected) && !docked && width > 0;

  useHotkey("Escape", () => nav.close(), { enabled: Boolean(nav.selected) });

  // On the screen layout a skill replaces the list, so the row that was clicked is gone while the
  // skill shows: focus goes to the skill's Back button on the way in, and back to the row on the
  // way out (the docked pane keeps focus where it was and needs none of this).
  const shown = itemScreen && selected ? selected.name : undefined;
  const before = useRef<string>(undefined);
  useEffect(() => {
    const from = before.current;
    before.current = shown;
    const frame = requestAnimationFrame(() => {
      if (shown) {
        document.querySelector<HTMLElement>('[data-wf="SkillsView"] [data-skill-back]')?.focus();
      } else if (from) {
        const row = document.getElementById(`skill-row-${from}`);
        row?.focus({ preventScroll: true });
        row?.scrollIntoView({ block: "nearest" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [shown]);

  if (itemScreen && selected) {
    return (
      <div
        ref={measure}
        data-wf="SkillsView"
        data-screen="skill"
        className="h-full min-h-0 min-w-0 bg-bg"
      >
        <h1 className="sr-only">Library · Skills</h1>
        <SkillItemView skill={selected} plugin={plugin} onClose={nav.close} variant="screen" />
      </div>
    );
  }

  return (
    <div ref={measure} data-wf="SkillsView" className="flex h-full min-h-0 min-w-0 flex-col bg-bg">
      <header className="flex h-(--wf-topbar-h) shrink-0 items-center gap-3 border-border border-b bg-bg px-4 sm:gap-4">
        <h1 className="sr-only">Library · Skills</h1>
        <ViewTabs view="workdatabase" />
        <span className="ml-auto hidden min-w-0 truncate text-fg-faint text-sm min-[1360px]:block">
          Read from plugins/ in this repository
        </span>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        <section
          aria-label="Plugins and skills"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
        >
          <div className="flex flex-col gap-6 py-4">
            <div className="px-4">
              <InstallPanel catalog={catalog} loading={query.isPending} />
            </div>
            <Plugins
              catalog={catalog}
              loading={query.isPending}
              error={query.isError}
              onRetry={() => void query.refetch()}
              selectedName={selected?.name}
              onSelect={nav.select}
            />
          </div>
        </section>

        {docked && (
          <aside
            aria-label="Skill"
            style={{ width: paneWidthFor(width) }}
            className="min-h-0 shrink-0 border-border border-l bg-bg"
          >
            {selected ? (
              <SkillItemView skill={selected} plugin={plugin} onClose={nav.close} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <PaneEmpty missing={nav.selected} loaded={Boolean(catalog)} onClose={nav.close} />
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function PaneEmpty({
  missing,
  loaded,
  onClose,
}: {
  missing?: string;
  loaded: boolean;
  onClose: () => void;
}) {
  if (missing && loaded) {
    return (
      <EmptyState
        icon={<SearchX strokeWidth={1.75} />}
        title="Skill not found"
        hint={`No skill is named ${missing}. It may have been renamed or removed.`}
        action={
          <Button size="sm" onClick={onClose}>
            Back to the skills
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={<BookOpen strokeWidth={1.75} />}
      title="Select a skill"
      hint="Pick a skill to read its SKILL.md here, as a page or as source."
    />
  );
}

function Plugins({
  catalog,
  loading,
  error,
  onRetry,
  selectedName,
  onSelect,
}: {
  catalog: SkillsCatalog | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  selectedName?: string;
  onSelect: (name: string) => void;
}) {
  if (loading) return <ListSkeleton />;
  if (error || !catalog) {
    return (
      <EmptyState
        title="Could not load the skills"
        hint="The server did not answer. Your files are safe."
        action={
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }
  if (catalog.plugins.length === 0) {
    return (
      <EmptyState
        icon={<Package strokeWidth={1.75} />}
        title="No plugins yet"
        hint="Add a plugin under plugins/ and list it in .claude-plugin/marketplace.json."
      />
    );
  }
  return (
    <>
      {catalog.plugins.map((plugin) => (
        <PluginSection
          key={plugin.path}
          plugin={plugin}
          selectedName={selectedName}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function PluginSection({
  plugin,
  selectedName,
  onSelect,
}: {
  plugin: SkillPlugin;
  selectedName?: string;
  onSelect: (name: string) => void;
}) {
  const id = `plugin-${plugin.name}`;
  return (
    <section data-wf="PluginSection" aria-labelledby={id} className="flex flex-col gap-1">
      <header className="flex flex-col gap-1 px-4 pb-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Package aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
          <h2 id={id} className="min-w-0 truncate font-semibold text-base text-fg">
            {plugin.name}
          </h2>
          {plugin.version && (
            <Chip tone="outline" className="shrink-0">
              v{plugin.version}
            </Chip>
          )}
          <span className="tabular shrink-0 text-fg-faint text-sm">
            {plugin.skills.length} {plugin.skills.length === 1 ? "skill" : "skills"}
          </span>
        </div>
        {plugin.description && <p className="text-fg-muted text-sm">{plugin.description}</p>}
      </header>
      <ul className={cn("m-0 list-none divide-y divide-border border-border border-y p-0")}>
        {plugin.skills.map((skill) => (
          <SkillRow
            key={skill.path}
            skill={skill}
            selected={skill.name === selectedName}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the skills" className="flex flex-col">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-1.5 border-border border-b px-4 py-3">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-3.5 w-5/6" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
