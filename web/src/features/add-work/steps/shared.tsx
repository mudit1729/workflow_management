import { Layers } from "lucide-react";
import type { ReactNode } from "react";
import type { GroupNode } from "@/gen/types";
import { StepFrame } from "../parts";
import type { AddWorkFlow } from "../useAddWorkFlow";

/** The frame of the screen on show, with its place in the progress. */
export function Screen({
  flow,
  title,
  hint,
  children,
}: {
  flow: AddWorkFlow;
  title: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <StepFrame
      step={flow.step}
      index={flow.index}
      total={flow.steps.length}
      title={title}
      hint={hint}
    >
      {children}
    </StepFrame>
  );
}

/** A group's color dot; the top level has no identity color and shows a stack instead. */
export function GroupMark({ node, root = false }: { node: GroupNode; root?: boolean }) {
  if (root) return <Layers aria-hidden size={14} strokeWidth={1.75} className="text-fg-faint" />;
  return (
    <span
      aria-hidden
      className="size-2.5 shrink-0 rounded-full"
      style={{ background: `var(--wf-hue-${node.color})` }}
    />
  );
}
