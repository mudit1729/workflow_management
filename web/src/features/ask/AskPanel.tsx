// Ask library (spec section 6): a side panel beside the issue. Choose where to look with chips,
// ask a suggested or a typed question, read the answer with its numbered sources, and link the
// cited pages to the issue or save the answer to its log. The answer comes from a connected agent
// running `querying-library`; without one the prototype answers from the best passages, and with
// the prototype off the passages are the answer and a button offers to connect an agent.
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusIcon } from "@/components/common";
import { openConnectAgent } from "@/features/library/team/connect-hook";
import { useIssue } from "@/lib/api";
import { useOpenIssueId } from "@/lib/nav";
import { AnswerView } from "./AnswerView";
import { AskSheet } from "./AskSheet";
import { useResponder } from "./agent";
import { IssuePicker } from "./IssuePicker";
import { PassageList } from "./PassageList";
import { QuestionBox } from "./QuestionBox";
import { suggestQuestions } from "./questions";
import { ScopeChips } from "./ScopeChips";
import {
  EMPTY_SELECTION,
  MAX_SCOPE_PAGES,
  pageOf,
  type Selection,
  scopeAddresses,
  scopeSize,
} from "./scope";
import { useAsk } from "./store";
import { type AskRun, useAsker } from "./useAsker";
import { useScopeData } from "./useScope";

/** Say what the prototype cannot do: there is no agent connection to open on this branch. */
function connectAgent() {
  if (openConnectAgent()) return;
  toast("No agent is connected", {
    description:
      "Codex or Claude Code connects through the bridge. Until one does, the best passages are the answer.",
  });
}

const words = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function AskPanel() {
  const { open, issue: chosen, pages: start, nonce, close, setIssue } = useAsk();
  const routeIssue = useOpenIssueId();
  const issueId = chosen ?? routeIssue;
  const issue = useIssue(issueId).data;

  return (
    <AskSheet
      open={open}
      onClose={close}
      title="Ask library"
      subtitle={
        issueId ? (
          <div className="flex min-w-0 items-center gap-1.5 text-fg-muted text-sm">
            {issue && <StatusIcon status={issue.summary.status} size={12} />}
            <span className="shrink-0 font-mono text-xs">{issueId}</span>
            <span className="min-w-0 truncate">{issue?.summary.title}</span>
          </div>
        ) : (
          <span className="text-fg-faint text-sm">Pick an issue first</span>
        )
      }
    >
      {issueId ? (
        <AskBody key={`${nonce}:${issueId}`} issueId={issueId} start={start} />
      ) : (
        <IssuePicker onPick={setIssue} />
      )}
      {chosen && routeIssue && routeIssue !== chosen && (
        <div className="mt-auto shrink-0 border-border border-t px-4 py-2 text-sm">
          <button
            type="button"
            onClick={() => setIssue(routeIssue)}
            className="cursor-default text-accent underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent"
          >
            Ask for {routeIssue} instead
          </button>
        </div>
      )}
    </AskSheet>
  );
}

/**
 * The inside of the panel for one issue. `question` is asked as soon as there are pages to read
 * (the component kit and the screenshots use it; a person asks by pressing a button).
 */
export function AskBody({
  issueId,
  start,
  question,
}: {
  issueId: string;
  start: string[];
  question?: string;
}) {
  const detail = useIssue(issueId).data;
  const data = useScopeData(issueId);
  const responder = useResponder();
  const [selection, setSelection] = useState<Selection>({ ...EMPTY_SELECTION, pages: start });
  const [pickerOpen, setPickerOpen] = useState(false);

  // The default is the pages the issue links, once they are known and when the panel was not
  // opened on a page of its own.
  const seeded = useRef(start.length > 0);
  useEffect(() => {
    if (seeded.current || !data.hasLinked) return;
    seeded.current = true;
    setSelection((s) => ({ ...s, linked: true }));
  }, [data.hasLinked]);

  const pages = scopeAddresses(selection, data.facts);
  const size = scopeSize(pages, data.facts);
  const { run, ask, reset } = useAsker(issueId, pages);
  const suggestions = detail ? suggestQuestions(detail) : [];
  const titleOf = useCallback(
    (address: string) =>
      data.facts.pages.get(pageOf(address))?.title ??
      pageOf(address)
        .slice(pageOf(address).lastIndexOf("/") + 1)
        .replace(/\.md$/, ""),
    [data.facts.pages],
  );

  const asked = useRef(false);
  useEffect(() => {
    if (!question || asked.current || pages.length === 0 || !detail) return;
    asked.current = true;
    ask(question);
  }, [question, pages.length, detail, ask]);

  const tooMany = pages.length > MAX_SCOPE_PAGES;
  const last = run.status === "idle" ? undefined : run.question;

  return (
    <div data-wf="AskBody" className="flex min-h-0 flex-col gap-5 px-4 py-4">
      <ScopeChips
        data={data}
        selection={selection}
        onChange={setSelection}
        size={size}
        pickerOpen={pickerOpen}
        onPickerOpen={setPickerOpen}
        titleOf={titleOf}
      />
      <QuestionBox
        suggestions={suggestions}
        disabled={pages.length === 0 || tooMany || !detail}
        running={run.status === "running"}
        last={last}
        onAsk={ask}
        onStop={reset}
      />
      {tooMany && (
        <p className="m-0 -mt-3 text-sm text-stale-text">
          That is more than {MAX_SCOPE_PAGES} pages. Narrow where to look to ask.
        </p>
      )}
      <AskResult
        run={run}
        issueId={issueId}
        detail={detail}
        mode={responder.mode}
        scopePages={pages.length}
        titleOf={titleOf}
        onRetry={() => last && ask(last)}
      />
    </div>
  );
}

/** What the panel shows below the question: reading, the answer, the passages, or the failure. */
export function AskResult({
  run,
  issueId,
  detail,
  mode,
  scopePages,
  titleOf,
  onRetry,
}: {
  run: AskRun;
  issueId: string;
  detail: ReturnType<typeof useIssue>["data"];
  mode: ReturnType<typeof useResponder>["mode"];
  scopePages: number;
  titleOf: (address: string) => string;
  onRetry: () => void;
}) {
  if (run.status === "idle") return null;

  if (run.status === "running")
    return (
      <section
        data-wf="AskRunning"
        aria-label="Answer"
        className="flex flex-col gap-2"
        aria-busy="true"
      >
        <p role="status" className="m-0 flex items-center gap-2 text-fg-muted text-sm">
          <Loader2 aria-hidden size={14} strokeWidth={1.75} className="motion-safe:animate-spin" />
          Reading {words(scopePages, "page", "pages")}…
        </p>
        {run.text && (
          <p className="m-0 line-clamp-6 whitespace-pre-wrap text-fg-muted text-sm">
            {run.text.split("## Sources")[0]}
          </p>
        )}
      </section>
    );

  if (run.status === "failed")
    return (
      <section data-wf="AskFailed" aria-label="Answer" className="flex flex-col items-start gap-2">
        <p className="m-0 text-base text-fg">The answer did not come.</p>
        <p className="m-0 text-fg-muted text-sm">{run.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="cursor-default text-accent text-sm underline decoration-accent/30 underline-offset-[3px] hover:decoration-accent"
        >
          Try again
        </button>
      </section>
    );

  if (run.mode === "none" || !run.parsed || run.text === undefined)
    return <PassageList passages={run.passages} onConnect={connectAgent} />;

  const n = run.parsed.sources.length;
  const label =
    run.mode === "prototype"
      ? run.parsed.notFound
        ? "Prototype answer: no passage matched"
        : `Prototype answer from ${words(n, "passage", "passages")}`
      : `Answer from ${run.by ?? "the agent"}`;
  return (
    <AnswerView
      key={run.question}
      issue={detail}
      issueId={issueId}
      question={run.question}
      text={run.text}
      parsed={run.parsed}
      label={label}
      titleOf={titleOf}
      {...(mode === "prototype" ? { onConnect: connectAgent } : {})}
    />
  );
}
