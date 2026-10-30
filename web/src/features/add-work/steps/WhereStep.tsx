// "Where?": buttons for the top level and every group; a searchable list once there are too many
// for buttons.
import { Check } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Skeleton,
} from "@/components/ui";
import type { GroupId } from "@/gen/types";
import { cn } from "@/lib/cn";
import { MAX_WHERE_BUTTONS } from "../flow";
import { ChoiceList, KeyHint } from "../parts";
import type { AddWorkFlow } from "../useAddWorkFlow";
import { GroupMark, Screen } from "./shared";

export function WhereStep({ flow }: { flow: AddWorkFlow }) {
  const group = flow.draft.kind !== "issue";
  const title = group ? "Where should the group go?" : "Which group is it in?";
  const hint = group
    ? "Pick the group it goes inside, or the top level."
    : "Pick the group the issue belongs to.";
  const { places, draft } = flow;

  if (places.length === 0) {
    return (
      <Screen flow={flow} title={title} hint={hint}>
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </Screen>
    );
  }

  if (places.length > MAX_WHERE_BUTTONS) {
    return (
      <Screen flow={flow} title={title} hint={hint}>
        <Command
          label={title}
          className="h-auto overflow-hidden rounded-md border border-border"
          // The hairline list scrolls inside the screen.
        >
          <CommandInput
            placeholder="Search groups"
            aria-label="Search groups"
            autoFocus
            data-autofocus=""
          />
          <CommandList className="max-h-[min(300px,40dvh)]">
            <CommandEmpty>No group matches.</CommandEmpty>
            {places.map((o) => (
              <CommandItem
                key={o.id}
                value={`${o.label} ${o.titles.join(" ")}`}
                onSelect={() => flow.advance({ where: o.id })}
                icon={<GroupMark node={o.node} root={o.root} />}
                hint={o.sub}
                className="h-9"
              >
                <span
                  className={cn("flex min-w-0 items-center gap-2", o.node.implicit && "italic")}
                  style={{ paddingLeft: Math.max(0, o.depth - 1) * 12 }}
                >
                  <span className="truncate">{o.label}</span>
                  {o.id === draft.where && (
                    <Check
                      aria-hidden
                      size={14}
                      strokeWidth={1.75}
                      className="shrink-0 text-accent"
                    />
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        <KeyHint>Type to narrow the list, Enter to pick.</KeyHint>
      </Screen>
    );
  }

  return (
    <Screen flow={flow} title={title} hint={hint}>
      {/* A long list scrolls inside the screen, so the question stays in view. The padding and
          the matching negative margin keep the focus rings of the buttons inside the clip. */}
      <div
        data-wf="WhereChoices"
        className="-m-1 max-h-[min(22rem,48dvh)] min-h-0 overflow-y-auto overscroll-contain p-1"
      >
        <ChoiceList<GroupId>
          label={title}
          value={draft.where}
          dense
          onPick={(where) => flow.patch({ where })}
          onGo={(where) => flow.advance({ where })}
          options={places.map((o) => ({
            value: o.id,
            label: o.label,
            hint: o.sub,
            lead: <GroupMark node={o.node} root={o.root} />,
          }))}
        />
      </div>
      <KeyHint>
        {places.length > 9
          ? "Press 1 to 9 to pick one of the first nine, or use the arrow keys. Enter continues."
          : `Press 1 to ${places.length} to pick, Enter to continue.`}
      </KeyHint>
    </Screen>
  );
}
