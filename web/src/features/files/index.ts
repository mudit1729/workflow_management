// Workdatabase · Files: the markdown the board is read from, as a tree, a source view and an editor.
export { requestFileEdit } from "./intent";
export { NewFileDialog } from "./NewFileDialog";
export {
  ISSUE_FILE_NAMES,
  ISSUE_FILE_SKILL,
  ISSUE_FILE_STEP,
  ISSUE_FILE_TARGET,
  type IssueFileName,
} from "./paths";
export { SourceEditor } from "./SourceEditor";
export { SourceView, type SourceViewProps } from "./SourceView";
export { issueFileTemplate, templateForPath } from "./templates";
export { FilesLink, type FilesSearch, filesHref, useFilesNav } from "./useFilesNav";
export { WorkspaceTree } from "./WorkspaceTree";
export { WorkspaceView } from "./WorkspaceView";
