// The glossary: one term, one meaning. Each term lists the words to avoid (struck through, with an
// arrow to the term) and links to related terms. The terms are written in glossary.md; each one
// names its line there and opens it in Workspace files.
import { ArrowRight, ArrowUpRight, BookText, Info, SearchX, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/common";
import { Button, Chip, SearchInput, Skeleton } from "@/components/ui";
import { FilesLink } from "@/features/files/useFilesNav";
import type { GlossaryTerm } from "@/gen/types";
import { useGlossary, useWorkspaceFile } from "@/lib/api";
import { cn } from "@/lib/cn";
import { glossaryLines } from "./markdown";
import { InlineCode } from "./meta";

/** Where the terms are written. */
export const GLOSSARY_PATH = "glossary.md";

export interface GlossaryViewProps {
  /**
   * Filters terms by their name, meaning, avoided words and related terms. The Library page owns the
   * search box and passes the text in. Without it the glossary shows its own search box.
   */
  query?: string;
  /** Called when a "See" link points at a term that the search hides. */
  onClearQuery?: () => void;
}

const KIND_NAME: Record<GlossaryTerm["kind"], string> = {
  noun: "noun",
  verb: "verb",
  adj: "adjective",
};

/** The line of each term's heading in glossary.md; undefined until the file has loaded. */
function useTermLines(): Map<string, number> | undefined {
  const text = useWorkspaceFile(GLOSSARY_PATH).data?.text;
  return useMemo(() => (text ? glossaryLines(text) : undefined), [text]);
}

function termDomId(term: string): string {
  return `term-${term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function GlossaryView({ query, onClearQuery }: GlossaryViewProps) {
  const glossary = useGlossary();
  const lines = useTermLines();
  const [own, setOwn] = useState("");
  const controlled = query !== undefined;
  const text = controlled ? query : own;
  const clearQuery = controlled ? onClearQuery : () => setOwn("");
  const [flash, setFlash] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const needle = text.trim().toLowerCase();
  const terms = glossary.data;
  const sorted = useMemo(
    () => [...(terms ?? [])].sort((a, b) => a.term.localeCompare(b.term)),
    [terms],
  );
  const known = useMemo(() => new Map(sorted.map((t) => [t.term.toLowerCase(), t.term])), [sorted]);
  const shown = useMemo(
    () =>
      needle
        ? sorted.filter((t) =>
            [t.term, t.means, ...t.avoid, ...t.see].some((s) => s.toLowerCase().includes(needle)),
          )
        : sorted,
    [sorted, needle],
  );
  const shownSet = useMemo(() => new Set(shown.map((t) => t.term)), [shown]);

  const jump = (term: string) => {
    const go = () => {
      const el = document.getElementById(termDomId(term));
      const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
      el?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
      setFlash(undefined);
      requestAnimationFrame(() => setFlash(term));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlash(undefined), 1400);
    };
    if (!shownSet.has(term) && clearQuery) {
      clearQuery();
      // Wait for the list to show every term again.
      requestAnimationFrame(() => requestAnimationFrame(go));
    } else {
      go();
    }
  };

  return (
    <div
      data-wf="GlossaryView"
      className="mx-auto flex w-full max-w-[880px] flex-col gap-4 px-6 py-5"
    >
      <p
        data-wf="GlossaryNote"
        className="flex items-center gap-2 rounded-md border border-border bg-subtle px-3 py-2 text-fg-muted text-sm"
      >
        <Info aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-faint" />
        <span className="min-w-0 flex-1">
          One term, one meaning. Lint{" "}
          <code className="rounded-sm bg-muted px-1 py-px font-mono text-fg text-xs">S09</code>{" "}
          flags the avoided words.
        </span>
        <FilesLink
          path={GLOSSARY_PATH}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 font-medium text-fg-muted text-sm transition-colors duration-100 hover:bg-muted hover:text-fg"
        >
          View in glossary.md
          <ArrowUpRight aria-hidden size={14} strokeWidth={1.75} />
        </FilesLink>
      </p>

      {!controlled && (
        <SearchInput
          value={own}
          onChange={setOwn}
          placeholder="Search terms"
          className="max-w-xs"
        />
      )}

      {glossary.isPending ? (
        <GlossarySkeleton />
      ) : glossary.isError && !terms ? (
        <EmptyState
          icon={<TriangleAlert />}
          title="Could not load the glossary"
          hint="The server did not answer. Your files are safe."
          action={
            <Button size="sm" onClick={() => void glossary.refetch()}>
              Try again
            </Button>
          }
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<BookText />}
          title="No glossary yet"
          hint="Define each term once, in glossary.md. Agents and the linter use it to keep wording consistent."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={`No term matches “${text.trim()}”`}
          hint="Search by term, meaning or an avoided word."
        />
      ) : (
        <>
          <p className="text-fg-faint text-sm tabular" aria-live="polite">
            {needle ? `${shown.length} of ${sorted.length} terms` : `${sorted.length} terms`}
          </p>
          <dl className="m-0 flex flex-col divide-y divide-border border-border border-y">
            {shown.map((t) => (
              <TermRow
                key={t.term}
                term={t}
                line={lines?.get(t.term.toLowerCase())}
                flash={flash === t.term}
                known={known}
                onJump={jump}
              />
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- one term

function TermRow({
  term: t,
  line,
  flash,
  known,
  onJump,
}: {
  term: GlossaryTerm;
  /** The line of the term's heading in glossary.md. */
  line?: number;
  flash: boolean;
  known: Map<string, string>;
  onJump: (term: string) => void;
}) {
  return (
    <div
      id={termDomId(t.term)}
      data-wf="GlossaryTerm"
      className={cn(
        "group relative grid scroll-mt-4 grid-cols-1 gap-x-6 gap-y-1.5 px-2 py-3.5 sm:grid-cols-[200px_minmax(0,1fr)]",
        flash && "wf-flash",
      )}
      data-src-line={line}
    >
      {line !== undefined && (
        <FilesLink
          path={GLOSSARY_PATH}
          line={line}
          aria-label={`View ${t.term} in glossary.md, line ${line}`}
          title="View in glossary.md"
          className={cn(
            "absolute top-3.5 right-2 inline-flex h-5 items-center gap-0.5 rounded-sm px-1 font-mono text-fg-faint text-xs",
            "transition-opacity duration-100 ease-wf hover:bg-muted hover:text-fg-muted",
            "opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          {GLOSSARY_PATH}:{line}
          <ArrowUpRight aria-hidden size={10} strokeWidth={2} />
        </FilesLink>
      )}
      <dt className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate font-semibold text-fg text-md">{t.term}</span>
        <Chip title={`A ${KIND_NAME[t.kind]}`}>{t.kind}</Chip>
      </dt>
      <dd className="m-0 flex min-w-0 flex-col gap-1.5">
        <p className="text-base text-fg leading-[1.55]">
          <InlineCode text={t.means} />
        </p>

        {t.avoid.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="text-fg-faint">Avoid:</span>
            {t.avoid.map((word) => (
              <span
                key={word}
                className="text-fg-faint line-through decoration-fg-faint/70"
                title={`Do not write “${word}”`}
              >
                {word}
              </span>
            ))}
            <ArrowRight aria-label="use" size={12} strokeWidth={1.75} className="text-fg-faint" />
            <span className="font-medium text-fg-muted">{t.term}</span>
          </p>
        )}

        {t.see.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
            <span className="text-fg-faint">See:</span>
            {t.see.map((name, i) => {
              const target = known.get(name.toLowerCase());
              const comma = i < t.see.length - 1 ? "," : "";
              return (
                <span key={name} className="inline-flex items-baseline">
                  {target ? (
                    <button
                      type="button"
                      onClick={() => onJump(target)}
                      className="cursor-default rounded-sm font-medium text-fg-muted underline decoration-border-strong underline-offset-[3px] transition-colors duration-100 hover:bg-muted hover:text-fg hover:decoration-fg-muted"
                    >
                      {name}
                    </button>
                  ) : (
                    <span className="text-fg-faint">{name}</span>
                  )}
                  <span aria-hidden className="text-fg-faint">
                    {comma}
                  </span>
                </span>
              );
            })}
          </p>
        )}
      </dd>
    </div>
  );
}

function GlossarySkeleton() {
  return (
    <div role="status" aria-label="Loading glossary" className="divide-y divide-border">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="grid grid-cols-1 gap-2 px-2 py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
          <Skeleton className="h-4 w-24" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
