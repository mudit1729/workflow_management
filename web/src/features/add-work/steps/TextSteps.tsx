// The screens whose answer has to be typed: the group's outcome, the issue's title, and, when
// no suggested name fits, the group's own name. Everything else is a button.
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui";
import { nameProblem, outcomeProblem, startsWithVerb, suggestNames, titleProblem } from "../flow";
import { ChoiceList, KeyHint } from "../parts";
import type { AddWorkFlow } from "../useAddWorkFlow";
import { Screen } from "./shared";

/** Enter in a one-line field goes on when the answer is fine, and says what is missing when not. */
function enterToContinue(onEnter: () => void) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    onEnter();
  };
}

export function OutcomeStep({ flow }: { flow: AddWorkFlow }) {
  const [tried, setTried] = useState(false);
  const { outcome } = flow.draft;
  const problem = outcomeProblem(outcome);
  const words = outcome.trim().split(/\s+/).filter(Boolean).length;
  const label = "What should the group achieve?";
  return (
    <Screen
      flow={flow}
      title={label}
      hint="One line about the result, not the steps. Codex splits it into issues."
    >
      <Input
        data-autofocus=""
        autoFocus
        aria-label={label}
        aria-invalid={tried && !!problem}
        aria-describedby="add-work-outcome-help"
        value={outcome}
        onChange={(e) => flow.patch({ outcome: e.target.value })}
        onKeyDown={enterToContinue(() => (problem ? setTried(true) : flow.advance()))}
        placeholder="Let people sign in with single sign-on"
        maxLength={240}
        autoComplete="off"
        className="h-10 px-3 text-md"
      />
      <p
        id="add-work-outcome-help"
        role={tried && problem ? "alert" : undefined}
        className={tried && problem ? "text-danger text-sm" : "text-fg-faint text-sm"}
      >
        {tried && problem
          ? problem
          : words > 0 && words < 4
            ? "A full sentence gives Codex more to work with."
            : "Press Enter to continue."}
      </p>
    </Screen>
  );
}

export function TitleStep({ flow }: { flow: AddWorkFlow }) {
  const [tried, setTried] = useState(false);
  const { title } = flow.draft;
  const problem = titleProblem(title);
  const words = title.trim().split(/\s+/).filter(Boolean).length;
  const label = "What needs doing?";
  let help = "Start with a verb: “Fix tab-title count”, “Add SSO login”.";
  if (tried && problem) help = problem;
  else if (words >= 2 && !startsWithVerb(title))
    help = "Tip: start with a verb, so the title reads at a glance on the board.";
  else if (words >= 2) help = "Press Enter to continue.";
  return (
    <Screen flow={flow} title={label} hint="One line. It becomes the title on the board.">
      <Input
        data-autofocus=""
        autoFocus
        aria-label={label}
        aria-invalid={tried && !!problem}
        aria-describedby="add-work-title-help"
        value={title}
        onChange={(e) => flow.patch({ title: e.target.value })}
        onKeyDown={enterToContinue(() => (problem ? setTried(true) : flow.advance()))}
        placeholder="Fix tab-title count"
        maxLength={120}
        autoComplete="off"
        className="h-10 px-3 text-md"
      />
      <p
        id="add-work-title-help"
        role={tried && problem ? "alert" : undefined}
        className={tried && problem ? "text-danger text-sm" : "text-fg-faint text-sm"}
      >
        {help}
      </p>
    </Screen>
  );
}

const OWN = "__own__";

export function NameStep({ flow }: { flow: AddWorkFlow }) {
  const { draft, parent } = flow;
  const taken = useMemo(() => parent?.children.map((c) => c.title) ?? [], [parent]);
  const suggestions = useMemo(() => suggestNames(draft.outcome, taken), [draft.outcome, taken]);
  const field = useRef<HTMLInputElement>(null);
  const [tried, setTried] = useState(false);

  // A name from an earlier outcome that is no longer on offer is not an answer any more. No
  // suggestion at all leaves only "Write my own".
  const stale = !draft.ownName && draft.name !== "" && !suggestions.includes(draft.name);
  const alone = suggestions.length === 0;
  useEffect(() => {
    if (stale) flow.patch({ name: "" });
    else if (alone && !draft.ownName) flow.patch({ ownName: true });
  }, [stale, alone, draft.ownName, flow.patch]);

  // Picking "Write my own" hands focus to the field.
  const own = draft.ownName;
  useEffect(() => {
    if (own) field.current?.focus();
  }, [own]);

  const problem = nameProblem(draft.name, parent);
  const value = own ? OWN : suggestions.includes(draft.name) ? draft.name : undefined;
  const label = "What is the group called?";

  const choose = (v: string) =>
    v === OWN ? flow.patch({ ownName: true, name: "" }) : flow.patch({ ownName: false, name: v });

  return (
    <Screen
      flow={flow}
      title={label}
      hint="A noun, like a folder name. Codex made these from your outcome."
    >
      <ChoiceList<string>
        label={label}
        value={value}
        onPick={choose}
        onGo={(v) => (v === OWN ? choose(v) : flow.advance({ ownName: false, name: v }))}
        autoFocus={!own}
        options={[
          ...suggestions.map((s) => ({ value: s, label: s })),
          { value: OWN, label: "Write my own", hint: "Type a name" },
        ]}
      />
      {own && (
        <div className="flex flex-col gap-1.5">
          <Input
            ref={field}
            aria-label="Group name"
            aria-invalid={(tried || draft.name !== "") && !!problem}
            aria-describedby="add-work-name-help"
            value={draft.name}
            onChange={(e) => flow.patch({ name: e.target.value })}
            onKeyDown={enterToContinue(() => (problem ? setTried(true) : flow.advance()))}
            placeholder="Single sign-on"
            maxLength={48}
            autoComplete="off"
            className="h-10 px-3 text-md"
          />
          <p
            id="add-work-name-help"
            role={(tried || draft.name !== "") && problem ? "alert" : undefined}
            className={
              (tried || draft.name !== "") && problem
                ? "text-danger text-sm"
                : "text-fg-faint text-sm"
            }
          >
            {(tried || draft.name !== "") && problem ? problem : "Press Enter to continue."}
          </p>
        </div>
      )}
      {!own && <KeyHint>Press 1 to {suggestions.length + 1} to pick, Enter to continue.</KeyHint>}
    </Screen>
  );
}
