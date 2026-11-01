// The options of a step as buttons (spec 5.3): one row per option, two or three buttons, the
// default first. A team-only option (Hand off, Status) is shown but off for Just me.
import { Segmented } from "@/components/ui";
import type { FlowOptionDef, FlowStepDef, ResolvedOption } from "@/lib/api";
import { OverrideMark } from "./parts";

export interface OptionRowsProps {
  step: FlowStepDef;
  /** The value in effect for each option, in the scope the panel shows. */
  values: Record<string, ResolvedOption>;
  /** The panel writes my file: team-only options are off. */
  mine: boolean;
  disabled?: boolean;
  onPick: (option: FlowOptionDef, value: string | number) => void;
}

export function OptionRows({ step, values, mine, disabled = false, onPick }: OptionRowsProps) {
  if (step.options.length === 0)
    return (
      <p data-wf="OptionRows" className="text-fg-faint text-sm">
        This step has no options.
      </p>
    );
  return (
    <div data-wf="OptionRows" className="flex flex-col gap-4">
      {step.options.map((option) => {
        const current = values[option.key];
        const off = mine && option.teamOnly;
        const buttons = option.values.map((v) => ({ value: String(v.value), label: v.label }));
        // A number the file holds that is not one of the buttons still shows, so what is in effect is never hidden.
        if (current && !option.values.some((v) => v.value === current.value))
          buttons.push({ value: String(current.value), label: String(current.value) });
        return (
          <div
            key={option.key}
            data-wf="OptionRow"
            data-option={option.key}
            className="flex flex-col gap-1.5"
          >
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <span className="font-medium text-base text-fg">{option.label}</span>
              {off ? (
                <span className="shrink-0 text-fg-faint text-xs">A team setting</span>
              ) : (
                mine && current?.origin === "me" && <OverrideMark />
              )}
            </div>
            <Segmented
              className="self-start"
              aria-label={option.label}
              value={String(current?.value ?? option.default)}
              disabled={disabled || off}
              options={buttons}
              onChange={(v) => {
                const pick = option.values.find((x) => String(x.value) === v);
                onPick(option, pick ? pick.value : option.numeric ? Number(v) : v);
              }}
            />
            <p className="text-fg-faint text-xs">{option.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
