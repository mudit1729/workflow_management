// The question: three suggestions drawn from the issue as buttons (one click asks), and a text box
// for anything else. Suggestions go once something was asked: the box keeps the last question, so
// asking again is an edit and a key.
import { CornerDownRight } from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";
import { Button, Textarea } from "@/components/ui";

export interface QuestionBoxProps {
  suggestions: string[];
  /** Nothing to ask of: no pages are chosen, or the issue is not known. */
  disabled: boolean;
  /** A question is being answered. */
  running: boolean;
  /** The question asked last, to edit. */
  last?: string;
  onAsk: (question: string) => void;
  onStop: () => void;
}

export function QuestionBox({
  suggestions,
  disabled,
  running,
  last,
  onAsk,
  onStop,
}: QuestionBoxProps) {
  // Until the person types, the box shows the question asked last.
  const [text, setText] = useState<string | undefined>();
  const id = useId();
  const value = text ?? last ?? "";

  const submit = (question: string) => {
    const q = question.trim();
    if (!q || disabled) return;
    setText(q);
    onAsk(q);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit(value);
  };

  return (
    <section data-wf="AskQuestion" aria-label="Question" className="flex flex-col gap-2">
      <h3 className="m-0 font-medium text-fg-muted text-sm">Question</h3>
      {last === undefined && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Suggested questions">
          {suggestions.map((q) => (
            <li key={q} className="min-w-0">
              <button
                type="button"
                data-wf="SuggestedQuestion"
                disabled={disabled}
                onClick={() => submit(q)}
                className="group/q flex min-h-7 w-full min-w-0 cursor-default items-start gap-2 rounded-md border border-border bg-bg px-2.5 py-1.5 text-left text-base text-fg transition-colors duration-100 ease-wf hover:border-border-strong hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CornerDownRight
                  aria-hidden
                  size={14}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-fg-faint group-hover/q:text-accent"
                />
                <span className="min-w-0 break-words">{q}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={id} className="sr-only">
        Your question
      </label>
      <Textarea
        id={id}
        rows={2}
        value={value}
        placeholder="Or ask your own question"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        // 16 px fields on a phone are big enough; a keyboard that pops up on its own is not.
        autoFocus={typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches}
      />
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-fg-faint text-xs">
          Enter to ask · Shift+Enter for a new line
        </span>
        {running ? (
          <Button variant="secondary" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={disabled || !value.trim()}
            onClick={() => submit(value)}
          >
            {last === undefined ? "Ask" : "Ask again"}
          </Button>
        )}
      </div>
    </section>
  );
}
