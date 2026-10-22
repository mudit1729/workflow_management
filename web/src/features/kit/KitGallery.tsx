// The gallery: a left index and a content pane with one section per element. The user reviews
// element by element and answers as "ElementName: change", so every section copies that prefix.
import { useNavigate, useSearch } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchInput, Segmented } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/hooks";
import { resolveTheme, usePrefs } from "@/lib/prefs";
import { KitModeProvider, Sandbox, ScrollerContext, Section } from "./kit-ui";
import { ENTRIES, INDEX } from "./registry";

type Nav = (o: {
  to: string;
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace?: boolean;
}) => Promise<void>;

type Mode = "light" | "dark" | "side";

export default function KitGallery() {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate() as unknown as Nav;
  const el = typeof search.el === "string" ? search.el : undefined;
  const side = search.view === "side";
  const themePref = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const compactIndex = useMediaQuery("(max-width: 767px)");

  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [active, setActive] = useState<string>(ENTRIES[0]?.name ?? "");
  const pinned = useRef<{ name: string; until: number } | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  // A link that opens straight into side by side (?view=side) gets the same light page.
  const openedSide = useRef(side);
  useEffect(() => {
    if (openedSide.current && resolveTheme(usePrefs.getState().theme) === "dark") setTheme("light");
  }, [setTheme]);

  const mode: Mode = side ? "side" : resolveTheme(themePref);

  const pinToRef = useRef<(name: string) => void>(() => undefined);
  const setMode = useCallback(
    (next: Mode) => {
      // The dark: variant matches every descendant of a dark page, so side by side needs a
      // light page for the light boxes to resolve their own tokens and variants.
      setTheme(next === "side" ? "light" : next);
      // Both layouts change every section's height: stay on the section being read.
      pinToRef.current(activeRef.current);
      void navigate({
        to: ".",
        replace: true,
        search: (prev) => {
          const { view: _view, ...rest } = prev;
          return next === "side" ? { ...rest, view: "side" } : rest;
        },
      });
    },
    [navigate, setTheme],
  );

  // ---- scrolling to an element

  const align = useCallback(
    (name: string) => {
      const node = scroller?.querySelector<HTMLElement>(`[data-kit-section="${CSS.escape(name)}"]`);
      if (!scroller || !node) return false;
      const top =
        node.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
      scroller.scrollTop = Math.max(0, top - 8);
      return true;
    },
    [scroller],
  );

  // Sections above the target grow as their data arrives (and the sandbox router mounts them
  // a tick after this page). Keep the target pinned to the top until the person scrolls on
  // their own, or 3 s pass, so a deep link lands where it says.
  const pinTo = useCallback(
    (name: string) => {
      pinned.current = { name, until: performance.now() + 3000 };
      align(name);
      setActive(name);
    },
    [align],
  );

  pinToRef.current = pinTo;

  useEffect(() => {
    if (!scroller) return;
    const inner = scroller.firstElementChild;
    const ro = new ResizeObserver(() => {
      const p = pinned.current;
      if (p && performance.now() < p.until) align(p.name);
    });
    if (inner) ro.observe(inner);
    const release = () => {
      pinned.current = null;
    };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const e of events) scroller.addEventListener(e, release, { passive: true });
    return () => {
      ro.disconnect();
      for (const e of events) scroller.removeEventListener(e, release);
    };
  }, [scroller, align]);

  useEffect(() => {
    if (el && scroller && ENTRIES.some((e) => e.name === el)) pinTo(el);
  }, [el, scroller, pinTo]);

  const select = useCallback(
    (name: string) => {
      if (name === el) {
        pinTo(name);
        return;
      }
      void navigate({ to: ".", replace: true, search: (prev) => ({ ...prev, el: name }) });
    },
    [el, navigate, pinTo],
  );

  // ---- the active entry follows the scroll

  useEffect(() => {
    if (!scroller) return;
    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (records) => {
        for (const r of records) {
          const name = (r.target as HTMLElement).dataset.kitSection;
          if (!name) continue;
          if (r.isIntersecting) visible.add(name);
          else visible.delete(name);
        }
        const p = pinned.current;
        if (p && performance.now() < p.until) return;
        let pick: string | undefined;
        for (const e of ENTRIES) if (visible.has(e.name)) pick = e.name;
        if (pick) setActive(pick);
      },
      { root: scroller, rootMargin: "0px 0px -85% 0px" },
    );
    // The sandbox router mounts the sections a tick after this effect: watch for them.
    const seen = new WeakSet<Element>();
    let count = 0;
    const scan = () => {
      for (const node of scroller.querySelectorAll("[data-kit-section]")) {
        if (seen.has(node)) continue;
        seen.add(node);
        count += 1;
        io.observe(node);
      }
      if (count >= ENTRIES.length) mo.disconnect();
    };
    const mo = new MutationObserver(scan);
    mo.observe(scroller, { childList: true, subtree: true });
    scan();
    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, [scroller]);

  return (
    <div
      data-wf="KitPage"
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-bg md:flex-row"
    >
      {compactIndex ? (
        <MobileIndex active={active} onSelect={select} />
      ) : (
        <KitIndex active={active} onSelect={select} />
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          data-wf="KitToolbar"
          className="flex h-[var(--wf-topbar-h)] shrink-0 items-center gap-3 border-border border-b bg-bg px-4"
        >
          <h1 className="font-semibold text-base text-fg">Kit</h1>
          <span className="hidden min-w-0 truncate text-fg-faint text-sm sm:block">
            {ENTRIES.length} elements · quote one as “Name: change”
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden text-fg-faint text-sm sm:inline">Theme</span>
            <Segmented<Mode>
              size="sm"
              aria-label="Theme"
              value={mode}
              onChange={setMode}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "side", label: "Side by side" },
              ]}
            />
          </div>
        </header>
        <div ref={setScroller} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto min-w-0 max-w-[1320px] px-4 pt-6 pb-40 md:px-6">
            <ScrollerContext value={scroller}>
              <Sandbox>
                <KitModeProvider side={side}>
                  <SectionList />
                </KitModeProvider>
              </Sandbox>
            </ScrollerContext>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Stable across active-entry and ?el= changes, so scrolling never re-renders the sections. */
const SectionList = memo(function SectionList() {
  return (
    <>
      {ENTRIES.map((e) => (
        <Section key={e.name} entry={e} />
      ))}
    </>
  );
});

// ---------------------------------------------------------------- index

interface IndexProps {
  active: string;
  onSelect: (name: string) => void;
}

function KitIndex({ active, onSelect }: IndexProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      INDEX.map((g) => ({
        ...g,
        entries: q ? g.entries.filter((e) => e.name.toLowerCase().includes(q)) : g.entries,
      })).filter((g) => g.entries.length > 0),
    [q],
  );
  const activeRef = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `active` is the trigger; the ref is read when it changes.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <aside
      data-wf="KitIndex"
      aria-label="Elements"
      className="hidden min-h-0 w-[220px] shrink-0 flex-col border-border border-r bg-subtle md:flex"
    >
      <div className="shrink-0 border-border border-b p-2">
        <SearchInput
          size="sm"
          value={query}
          onChange={setQuery}
          placeholder="Filter elements"
          onKeyDown={(e) => {
            if (e.key === "Enter" && groups[0]?.entries[0]) onSelect(groups[0].entries[0].name);
          }}
        />
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto py-2" aria-label="Element index">
        {groups.length === 0 && (
          <p className="px-3 py-2 text-fg-faint text-sm">No element matches.</p>
        )}
        {groups.map((g) => (
          <div key={g.group} className="mb-2">
            <h3 className="px-3 pt-1 pb-1 font-medium text-fg-faint text-xs">{g.group}</h3>
            <ul>
              {g.entries.map((e) => {
                const on = e.name === active;
                return (
                  <li key={e.name}>
                    <button
                      ref={on ? activeRef : undefined}
                      type="button"
                      aria-current={on ? "true" : undefined}
                      onClick={() => onSelect(e.name)}
                      className={cn(
                        "flex h-6 w-full min-w-0 cursor-default items-center px-3 text-left font-mono text-sm",
                        "transition-colors duration-100 ease-wf",
                        on
                          ? "bg-muted font-medium text-fg"
                          : "text-fg-muted hover:bg-muted/60 hover:text-fg",
                      )}
                    >
                      <span className="min-w-0 truncate">{e.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function MobileIndex({ active, onSelect }: IndexProps) {
  return (
    <div data-wf="KitIndex" className="shrink-0 border-border border-b bg-subtle p-2">
      <select
        aria-label="Jump to an element"
        value={active}
        onChange={(e) => onSelect(e.target.value)}
        className="h-7 w-full min-w-0 rounded-md border border-border bg-bg px-2 font-mono text-fg text-sm outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus"
      >
        {INDEX.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.entries.map((e) => (
              <option key={e.name} value={e.name}>
                {e.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
