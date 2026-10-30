// The answer: markdown with numbered citations, the sources they stand for, and what to do with
// it. A citation `[n]` is a small chip; it and the source row open the cited section in a preview.
// Link cited pages, Save to log and Copy are buttons; each write says what it did in one line of
// the panel (not a toast), and the button is spent so the event is not confirmed twice.
import { BookMarked, Check, Link2, TriangleAlert } from "lucide-react";
import { type MouseEvent, useMemo, useState } from "react";
import { CopyButton, MarkdownProse } from "@/components/common";
import { Button } from "@/components/ui";
import type { IssueDetail } from "@/gen/types";
import { cn } from "@/lib/cn";
import { useOpenIssue } from "@/lib/nav";
import { citedPages, linkedLine, useLinkCited, useSaveToLog } from "./actions";
import { linkCitations, type ParsedAnswer } from "./answer";
import { SourcePreview } from "./SourcePreview";
import { closeAskPanel } from "./store";

/** The citation chips: `[1](#cite-1)` links drawn as small numbered tags. */
const CITE =
  "[&_a[href^='#cite-']]:mx-px [&_a[href^='#cite-']]:inline-flex [&_a[href^='#cite-']]:h-4 [&_a[href^='#cite-']]:min-w-4 [&_a[href^='#cite-']]:items-center [&_a[href^='#cite-']]:justify-center [&_a[href^='#cite-']]:rounded-sm [&_a[href^='#cite-']]:bg-accent-subtle [&_a[href^='#cite-']]:px-1 [&_a[href^='#cite-']]:align-[1px] [&_a[href^='#cite-']]:font-medium [&_a[href^='#cite-']]:text-accent [&_a[href^='#cite-']]:text-xs [&_a[href^='#cite-']]:no-underline [&_a[href^='#cite-']]:hover:bg-accent [&_a[href^='#cite-']]:hover:text-accent-fg";

export interface AnswerViewProps {
  issue: IssueDetail | undefined;
  issueId: string;
  question: string;
  /** The agent's output as printed. */
  text: string;
  parsed: ParsedAnswer;
  /** "Prototype answer from 3 passages", "Answer from @codex". */
  label: string;
  /** Title of a page by address, for the source rows. */
  titleOf: (address: string) => string;
  /** The prototype wrote this answer: offer an agent for a fuller one. */
  onConnect?: () => void;
}

type Spent = { link?: string; save?: string };

export function AnswerView({
  issue,
  issueId,
  question,
  text,
  parsed,
  label,
  titleOf,
  onConnect,
}: AnswerViewProps) {
  const [open, setOpen] = useState<number | undefined>();
  const [spent, setSpent] = useState<Spent>({});
  const [busy, setBusy] = useState<"link" | "save" | undefined>();
  const linkCited = useLinkCited(issueId);
  const saveToLog = useSaveToLog(issueId);
  const openIssue = useOpenIssue();
  // Beside the issue the panel stays; on a phone it covers the issue, so it gives way.
  const seeIssue = (opts: Parameters<typeof openIssue>[1]) => {
    void openIssue(issueId, opts);
    if (matchMedia("(max-width: 639px)").matches) closeAskPanel();
  };

  // A citation's tooltip says which section it opens.
  const md = useMemo(
    () =>
      linkCitations(
        parsed.answer,
        parsed,
        (s) => `${titleOf(s.address)}${s.heading ? ` › ${s.heading}` : ""}`,
      ),
    [parsed, titleOf],
  );
  const opened = parsed.sources.find((s) => s.n === open);
  const cited = parsed.notFound ? 0 : citedPages(parsed).length;

  const onCite = (e: MouseEvent) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>("a[href^='#cite-']");
    if (!a) return;
    e.preventDefault();
    const n = Number(a.getAttribute("href")?.slice("#cite-".length));
    setOpen((cur) => (cur === n ? undefined : n));
  };

  const link = async () => {
    setBusy("link");
    try {
      const outcome = await linkCited(parsed, question, issue);
      if (!outcome) return;
      setSpent((s) => ({ ...s, link: linkedLine(issueId, outcome, cited) }));
    } finally {
      setBusy(undefined);
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      const id = await saveToLog(question, parsed);
      if (id) setSpent((s) => ({ ...s, save: id }));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section data-wf="AskAnswer" aria-label="Answer" className="flex min-w-0 flex-col gap-3">
      <p data-wf="AskAnswerLabel" className="m-0 text-fg-faint text-xs">
        {label}
        {onConnect && (
          <>
            {" · "}
            <button
              type="button"
              onClick={onConnect}
              className="cursor-default underline decoration-border-strong underline-offset-[3px] hover:text-fg hover:decoration-fg-muted"
            >
              Connect an agent for a full answer
            </button>
          </>
        )}
      </p>
      <div data-wf="AskAnswerText" onClick={onCite} className={cn("min-w-0 text-md", CITE)}>
        <MarkdownProse md={md} document="pane" />
      </div>

      {parsed.missing && (
        <p
          data-wf="AskMissing"
          className="m-0 rounded-md bg-muted px-2.5 py-1.5 text-fg-muted text-sm"
        >
          <span className="font-medium text-fg">Not in these pages:</span> {parsed.missing}
        </p>
      )}
      {parsed.note && (
        <p
          data-wf="AskNote"
          className="m-0 flex items-start gap-1.5 rounded-md bg-stale/10 px-2.5 py-1.5 text-sm"
        >
          <TriangleAlert
            aria-hidden
            size={14}
            strokeWidth={1.75}
            className="mt-px shrink-0 text-stale"
          />
          <span>{parsed.note}</span>
        </p>
      )}
      {parsed.couldNotRead.length > 0 && (
        <p data-wf="AskUnread" className="m-0 text-fg-faint text-sm">
          Could not read {parsed.couldNotRead.join(", ")}.
        </p>
      )}
      {parsed.problems.length > 0 && (
        <p className="m-0 text-fg-faint text-xs" title={parsed.problems.join("\n")}>
          Some citations did not match their sources.
        </p>
      )}

      {parsed.sources.length > 0 && (
        <div data-wf="AskSources" className="flex flex-col gap-1">
          <h3 className="m-0 font-medium text-fg-muted text-sm">Sources</h3>
          <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
            {parsed.sources.map((s) => (
              <li key={s.n} className="flex min-w-0 flex-col gap-1.5">
                <button
                  type="button"
                  aria-expanded={open === s.n}
                  onClick={() => setOpen((cur) => (cur === s.n ? undefined : s.n))}
                  className={cn(
                    "flex min-h-7 w-full min-w-0 cursor-default items-baseline gap-2 rounded-md px-1.5 py-1 text-left text-sm",
                    "hover:bg-subtle",
                    open === s.n && "bg-subtle",
                  )}
                >
                  <span className="tabular w-4 shrink-0 text-right text-accent">{s.n}</span>
                  <span className="min-w-0 truncate text-fg">{titleOf(s.address)}</span>
                  {s.heading && (
                    <>
                      <span aria-hidden className="text-fg-faint">
                        ›
                      </span>
                      <span className="min-w-0 truncate text-fg-muted">{s.heading}</span>
                    </>
                  )}
                </button>
                {open === s.n && opened && (
                  <SourcePreview
                    address={opened.address}
                    heading={opened.heading}
                    onClose={() => setOpen(undefined)}
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Pinned to the bottom of the panel while the answer is long, so the buttons and the line that
          says what they did stay in view. */}
      <div
        data-wf="AskFooter"
        className="sticky bottom-0 z-raised -mx-4 -mb-4 flex flex-col gap-1.5 border-border border-t bg-bg px-4 py-2.5"
      >
        <div data-wf="AskActions" className="flex flex-wrap items-center gap-1.5">
          {cited > 0 && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== undefined || spent.link !== undefined}
              onClick={() => void link()}
            >
              {spent.link ? (
                <Check aria-hidden size={14} strokeWidth={1.75} className="text-status-done" />
              ) : (
                <Link2 aria-hidden size={14} strokeWidth={1.75} />
              )}
              Link cited pages
            </Button>
          )}
          {!parsed.notFound && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== undefined || spent.save !== undefined}
              onClick={() => void save()}
            >
              {spent.save ? (
                <Check aria-hidden size={14} strokeWidth={1.75} className="text-status-done" />
              ) : (
                <BookMarked aria-hidden size={14} strokeWidth={1.75} />
              )}
              Save to log
            </Button>
          )}
          <CopyButton text={text} label="Copy" variant="button" size="sm" />
        </div>

        {/* One line for what was done: the writes are in the issue's markdown, and this says where. */}
        <div aria-live="polite" className="flex flex-col gap-1 empty:hidden">
          {spent.link && (
            <p data-wf="AskLinked" className="m-0 text-fg-muted text-sm">
              {spent.link}{" "}
              <button
                type="button"
                onClick={() => seeIssue({ tab: "goal" })}
                className="cursor-default text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent"
              >
                See Links
              </button>
            </p>
          )}
          {spent.save && (
            <p data-wf="AskSaved" className="m-0 text-fg-muted text-sm">
              Saved to the log of {issueId} as{" "}
              <span className="font-mono text-xs">{spent.save}</span>.{" "}
              <button
                type="button"
                onClick={() => seeIssue({ tab: "log", log: "learnings" })}
                className="cursor-default text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent"
              >
                See Log
              </button>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
