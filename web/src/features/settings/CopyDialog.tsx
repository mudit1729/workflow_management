// Edit a copy (spec 5.4): a built-in skill, or a skill of a team library, is read-only, so a change
// starts with a copy. Two screens of buttons, the Add work way: where the copy lives, and its name.
// The third step is the editor page, where the copy is written when it is saved.
import { ArrowLeft } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button, Dialog, DialogContent, Input, Kbd } from "@/components/ui";
import { ChoiceList, DigitSlot, isTypingTarget, KeyHint } from "@/features/add-work/parts";
import {
  type CopyTarget,
  copyNameProblem,
  type FlowScope,
  type Skill,
  shelfOf,
  suggestCopyName,
  useMe,
  usePersonalConfig,
  useSkills,
  useSnapshot,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { type PanelKey, useEditNav } from "./search";

const SCREENS = ["where", "name"] as const;
type Screen = (typeof SCREENS)[number];

const TITLE: Record<Screen, string> = {
  where: "Where should the copy live?",
  name: "What should the copy be called?",
};

export interface CopyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The skill to copy. */
  skill: Skill;
  /** The panel the editor comes back to, and the step it points at the copy. */
  forPanel: PanelKey;
  /** Apply to in the panel it came from: Just me starts on My library, Everyone on This workspace. */
  scope?: FlowScope;
  /** Called with the choice instead of opening the editor (the Kit frames). */
  onDone?: (choice: { to: CopyTarget; name: string }) => void;
}

export function CopyDialog({
  open,
  onOpenChange,
  skill,
  forPanel,
  scope,
  onDone,
}: CopyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent
          title={`Edit a copy of ${skill.name}`}
          size="md"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <CopyPanel
            skill={skill}
            forPanel={forPanel}
            scope={scope}
            onClose={() => onOpenChange(false)}
            onDone={onDone}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

/** The two screens of Edit a copy: where it lives, then its name. Inside the dialog, or on its own (the Kit). */
export function CopyPanel({
  skill,
  forPanel,
  scope = "team",
  onClose,
  onDone,
  startAt = "where",
}: {
  skill: Skill;
  forPanel: PanelKey;
  scope?: FlowScope;
  onClose: () => void;
  onDone?: CopyDialogProps["onDone"];
  /** The screen it opens on (the Kit shows the second). */
  startAt?: Screen;
}) {
  const edit = useEditNav();
  const catalog = useSkills().data;
  const prefix = useSnapshot().data?.config.id_prefix ?? "wf";
  const me = useMe();
  const hasLibrary = usePersonalConfig().data !== undefined;
  const [screen, setScreen] = useState<Screen>(startAt);
  const [to, setTo] = useState<CopyTarget>(scope === "me" && hasLibrary ? "me" : "ws");
  const [typed, setTyped] = useState<string>();
  const digits = useRef<((n: number) => void) | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);

  const taken = useMemo(
    () => shelfOf(catalog, to === "ws" ? "ws" : "me")?.skills.map((s) => s.name) ?? [],
    [catalog, to],
  );
  // The suggestion follows the place until the name is typed over.
  const suggestion = suggestCopyName(skill.name, to === "ws" ? prefix : me || prefix, taken);
  const name = typed ?? suggestion;
  const problem = copyNameProblem(name, to, catalog);

  // Focus goes to the screen's first control when a screen opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `screen` is the trigger
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLElement>('[data-autofocus], [role="radio"][aria-checked="true"]')
        ?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [screen]);

  const finish = () => {
    if (problem) return;
    if (onDone) onDone({ to, name });
    else edit.open({ skill: skill.ref, to, name, for: forPanel });
    onClose();
  };
  const advance = () => (screen === "where" ? setScreen("name") : finish());
  const back = () => setScreen("where");

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (screen === "where" && /^[1-9]$/.test(e.key) && !isTypingTarget(e.target)) {
      e.preventDefault();
      digits.current?.(Number(e.key));
    }
    if (screen === "name" && e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      advance();
    }
  };

  const places = [
    {
      value: "ws" as const,
      label: "This workspace",
      hint: "The team uses it. Saved in the skills folder of this workspace.",
    },
    ...(hasLibrary
      ? [
          {
            value: "me" as const,
            label: "My library",
            hint: "Only you. Saved in the skills folder of your library.",
          },
        ]
      : []),
  ];

  return (
    <DigitSlot value={digits}>
      {/* The keys go to the screen on show, wherever focus is inside the panel. */}
      <div
        ref={root}
        data-wf="CopyPanel"
        data-screen={screen}
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-col pt-1"
      >
        <p className="text-fg-faint text-xs tabular">
          {SCREENS.indexOf(screen) + 1} of {SCREENS.length}
          <span className="sr-only"> · {screen === "where" ? "Place" : "Name"}</span>
        </p>
        <h2 className="mt-1 font-semibold text-fg text-xl leading-snug tracking-tight">
          {TITLE[screen]}
        </h2>
        <p className="mt-1.5 max-w-[56ch] text-fg-muted text-md">
          {screen === "where"
            ? "A copy is yours to change. The original stays as it is."
            : "It is the name of the skill's folder. Press Enter to take it."}
        </p>
        <div className="mt-5 flex min-w-0 flex-col gap-3">
          {screen === "where" ? (
            <>
              <ChoiceList
                label="Where the copy lives"
                options={places}
                value={to}
                onPick={setTo}
                onGo={(v) => {
                  setTo(v);
                  setScreen("name");
                }}
              />
              <KeyHint>Press 1 or 2 to pick, Enter to go on.</KeyHint>
            </>
          ) : (
            <>
              <Input
                data-autofocus=""
                aria-label="Name of the copy"
                aria-invalid={problem ? true : undefined}
                aria-describedby="copy-name-help"
                value={name}
                onChange={(e) => setTyped(e.target.value.toLowerCase())}
                onFocus={(e) => e.currentTarget.select()}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="h-10 px-3 font-mono text-md"
              />
              <p
                id="copy-name-help"
                role={problem ? "alert" : undefined}
                className={cn("text-sm", problem ? "text-danger" : "text-fg-faint")}
              >
                {problem ?? `${to === "ws" ? "ws" : "me"}:${name} is how the flow will name it.`}
              </p>
            </>
          )}
        </div>
        <div className="mt-5 flex items-center justify-between gap-2 border-border border-t pt-3">
          <Button variant="ghost" onClick={back} disabled={screen === "where"}>
            <ArrowLeft aria-hidden size={14} strokeWidth={1.75} />
            Back
          </Button>
          <Button variant="primary" onClick={advance} disabled={screen === "name" && !!problem}>
            {screen === "where" ? "Continue" : "Open the editor"}
            <Kbd tone="inverted" aria-hidden className="max-md:hidden">
              ↵
            </Kbd>
          </Button>
        </div>
      </div>
    </DigitSlot>
  );
}
