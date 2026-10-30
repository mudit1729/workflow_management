// The screen for a step id.
import type { AddWorkFlow } from "../useAddWorkFlow";
import { KindStep, PriorityStep, SizeStep, StatusStep } from "./ChoiceSteps";
import { ContextStep } from "./ContextStep";
import { ReviewStep } from "./ReviewStep";
import { SplitStep } from "./SplitStep";
import { NameStep, OutcomeStep, TitleStep } from "./TextSteps";
import { WhereStep } from "./WhereStep";

export function StepScreen({ flow }: { flow: AddWorkFlow }) {
  switch (flow.step) {
    case "kind":
      return <KindStep flow={flow} />;
    case "where":
      return <WhereStep flow={flow} />;
    case "outcome":
      return <OutcomeStep flow={flow} />;
    case "title":
      return <TitleStep flow={flow} />;
    case "name":
      return <NameStep flow={flow} />;
    case "size":
      return <SizeStep flow={flow} />;
    case "priority":
      return <PriorityStep flow={flow} />;
    case "status":
      return <StatusStep flow={flow} />;
    case "context":
      return <ContextStep flow={flow} />;
    case "split":
      return <SplitStep flow={flow} />;
    case "review":
      return <ReviewStep flow={flow} />;
  }
}
