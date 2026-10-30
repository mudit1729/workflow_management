// The screens whose answer is one button: what, size, priority and status.
import { Boxes, CircleDot } from "lucide-react";
import { StatusIcon } from "@/components/common";
import type { Priority, Size } from "@/gen/types";
import {
  PRIORITIES,
  SIZES_GROUP,
  SIZES_ISSUE,
  STATUSES,
  type WorkKind,
  type WorkStatus,
} from "../flow";
import { ChoiceList, KeyHint } from "../parts";
import type { AddWorkFlow } from "../useAddWorkFlow";
import { Screen } from "./shared";

export function KindStep({ flow }: { flow: AddWorkFlow }) {
  const title = "What are you adding?";
  return (
    <Screen flow={flow} title={title} hint="Pick one. You can still go back.">
      <ChoiceList<WorkKind>
        label={title}
        value={flow.draft.kind}
        onPick={(kind) => flow.patch({ kind })}
        onGo={(kind) => flow.advance({ kind })}
        options={[
          {
            value: "group",
            label: "A group of work",
            hint: "Codex splits it into issues",
            lead: <Boxes size={16} strokeWidth={1.75} />,
          },
          {
            value: "issue",
            label: "One issue",
            hint: "A single piece of work in a group you pick",
            lead: <CircleDot size={16} strokeWidth={1.75} />,
          },
        ]}
      />
      <KeyHint>Press 1 or 2 to pick, Enter to continue.</KeyHint>
    </Screen>
  );
}

export function SizeStep({ flow }: { flow: AddWorkFlow }) {
  const group = flow.draft.kind !== "issue";
  const sizes = group ? SIZES_GROUP : SIZES_ISSUE;
  const title = group ? "How big is the whole group?" : "How big is it?";
  return (
    <Screen
      flow={flow}
      title={title}
      hint={group ? "A bigger group gets split into more issues." : "A rough guess is enough."}
    >
      <ChoiceList<Size>
        label={title}
        value={flow.draft.size}
        onPick={(size) => flow.patch({ size })}
        onGo={(size) => flow.advance({ size })}
        options={sizes.map((s) => ({ value: s.value, label: s.label, hint: s.hint }))}
      />
      <KeyHint>Press 1 to {sizes.length} to pick, Enter to continue.</KeyHint>
    </Screen>
  );
}

export function PriorityStep({ flow }: { flow: AddWorkFlow }) {
  const group = flow.draft.kind !== "issue";
  const title = group ? "How urgent is the group?" : "How urgent is it?";
  return (
    <Screen
      flow={flow}
      title={title}
      hint={
        group
          ? "The first issues get this priority and the rest one step less. You can change each one."
          : undefined
      }
    >
      <ChoiceList<Priority>
        label={title}
        value={flow.draft.priority}
        onPick={(priority) => flow.patch({ priority })}
        onGo={(priority) => flow.advance({ priority })}
        options={PRIORITIES.map((p) => ({ value: p.value, label: p.label, hint: p.hint }))}
      />
      <KeyHint>Press 1 to 5 to pick, Enter to continue.</KeyHint>
    </Screen>
  );
}

export function StatusStep({ flow }: { flow: AddWorkFlow }) {
  const title = "Where does it start?";
  return (
    <Screen
      flow={flow}
      title={title}
      hint="Backlog is for ideas. Planned is for work that is ready."
    >
      <ChoiceList<WorkStatus>
        label={title}
        value={flow.draft.status}
        onPick={(status) => flow.patch({ status })}
        onGo={(status) => flow.advance({ status })}
        options={STATUSES.map((s) => ({
          value: s.value,
          label: s.label,
          hint: s.hint,
          lead: <StatusIcon status={s.value} size={16} />,
        }))}
      />
      <KeyHint>Press 1 or 2 to pick, Enter to continue.</KeyHint>
    </Screen>
  );
}
