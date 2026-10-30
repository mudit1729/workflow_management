// Shared components built on the ui primitives. Import from "@/components/common".
export { AuthorAvatar, AuthorChip, type AuthorChipProps, authorHue } from "./AuthorChip";
export { AuthorStack, type AuthorStackProps } from "./AuthorStack";
export { CodeBlock, type CodeBlockProps } from "./CodeBlock";
export { CopyButton, type CopyButtonProps, copyText } from "./CopyButton";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { GroupPath, type GroupPathProps } from "./GroupPath";
export { KIND_ICON, KIND_LABEL, type Kind, KindIcon, type KindIconProps } from "./KindIcon";
export { LintBadge, type LintBadgeProps, lintSummary } from "./LintBadge";
export {
  EmbedCard,
  type EmbedCardProps,
  GifPlayer,
  type GifPlayerProps,
  MediaFigure,
  type MediaFigureProps,
  parseEmbed,
  VideoPlayer,
  type VideoPlayerProps,
} from "./MarkdownMedia";
export {
  MarkdownProse,
  type MarkdownProseProps,
  type MarkdownSource,
  type ProseDocument,
  type ProseWiki,
} from "./MarkdownProse";
export { MoveGateDialog } from "./MoveGateDialog";
export { ProgressRing, type ProgressRingProps, progressText } from "./ProgressRing";
export { RefLink, type RefLinkProps } from "./RefLink";
export { RelativeTime, type RelativeTimeProps, useNow } from "./RelativeTime";
export {
  AUTHOR_PROTOCOL,
  CALLOUTS,
  type CalloutKind,
  type ParsedRef,
  parseRef,
  REF_PROTOCOL,
  remarkCallouts,
  remarkWfRefs,
} from "./remark-wf";
export {
  markerText,
  SourceLineMarker,
  type SourceLineMarkerProps,
  useOpenInFiles,
} from "./SourceLineMarker";
export { StatusIcon, type StatusIconProps } from "./StatusIcon";
export { StatusSelect, type StatusSelectProps } from "./StatusSelect";
export { Toaster } from "./Toaster";
export {
  SUBVIEWS,
  type SubViewDef,
  subViewForPath,
  useActiveSubView,
  useViewCounts,
  VIEWS,
  type ViewCounts,
  type ViewDef,
  ViewTabs,
  type ViewTabsProps,
  type WfSubView,
  type WfView,
} from "./ViewTabs";
