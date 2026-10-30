// The library model of the mock: sources, page trees, pages, links, backlinks and search.
// `createLibraries(store)` is the stateful registry the mock server owns; the rest is pure.
export {
  buildCorpus,
  type Corpus,
  type WorkspaceFacts,
} from "./corpus";
export {
  createLibraries,
  type Libraries,
  type LibrariesOptions,
  parseTeamEntries,
  type TeamEntry,
  withoutTeamEntry,
  withTeamEntry,
} from "./libraries";
export { extractImages, extractLinks, resolveLink, resolveMedia } from "./links";
export {
  findLibraryRoot,
  KNOWN_ROOTS,
  type LibraryManifest,
  parseManifest,
  readManifest,
  rootCandidates,
} from "./manifest";
export {
  buildSearchIndex,
  plainText,
  queryTerms,
  type SearchablePage,
  type SearchIndex,
  type SearchOptions,
  searchSections,
  snippetOf,
  stem,
  tokenize,
} from "./search";
export { buildTree, humanize, type Layout, layoutOf, trailOf } from "./tree";
export { workspaceAlias, workspaceFacts, workspaceSource } from "./workspace";
