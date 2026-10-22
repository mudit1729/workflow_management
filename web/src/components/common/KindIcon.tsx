// One lucide glyph per entry kind (changes, learnings, library items).
import {
  BadgeCheck,
  CircleDot,
  Eye,
  FileText,
  FlaskConical,
  Lightbulb,
  ListChecks,
  type LucideIcon,
  MessageSquareReply,
  OctagonX,
  Scale,
  Search,
  Shapes,
  Shuffle,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import type { ChangeKind, LearningKind, LibraryKind } from "@/gen/types";

export type Kind = ChangeKind | LearningKind | LibraryKind;

export const KIND_ICON: Record<Kind, LucideIcon> = {
  // changes
  progress: CircleDot,
  fix: Wrench,
  refactor: Shuffle,
  docs: FileText,
  test: FlaskConical,
  research: Search,
  review: Eye,
  verify: BadgeCheck,
  failure: OctagonX,
  answer: MessageSquareReply,
  // learnings
  tip: Lightbulb,
  gotcha: TriangleAlert,
  pattern: Shapes,
  // library
  playbook: ListChecks,
  decision: Scale,
};

export const KIND_LABEL: Record<Kind, string> = {
  progress: "Progress",
  fix: "Fix",
  refactor: "Refactor",
  docs: "Docs",
  test: "Test",
  research: "Research",
  review: "Review",
  verify: "Verify",
  failure: "Failure",
  answer: "Answer",
  tip: "Tip",
  gotcha: "Gotcha",
  pattern: "Pattern",
  playbook: "Playbook",
  decision: "Decision",
};

export interface KindIconProps {
  kind: Kind;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Accessible name; omit when a text label sits next to the icon. */
  label?: string;
}

export function KindIcon({ kind, size = 14, strokeWidth = 1.75, className, label }: KindIconProps) {
  const Icon = KIND_ICON[kind] ?? CircleDot;
  return (
    <Icon
      data-wf="KindIcon"
      data-kind={kind}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
