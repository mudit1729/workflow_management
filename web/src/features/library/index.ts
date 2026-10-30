// The Library feature. The wiki viewer (`WikiView`, `LibraryHome`) and the Add team library dialog
// are lazy chunks: the router and the shell load them through `app/lazy-views.tsx`, so this
// barrel stays small for the issue views that import `PromoteDialog` from it.
export { openAsk, setAskHandler } from "./ask-hook";
export { GlossaryView } from "./GlossaryView";
export { MarkdownDocument, type MarkdownDocumentProps } from "./MarkdownDocument";
export { PromoteDialog } from "./PromoteDialog";
