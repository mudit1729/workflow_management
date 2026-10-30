// Ask library (spec section 6): ask a question of a set of library pages from an issue.
// `AskLibraryButton` goes in the issue header, `AskHost` in the shell, `openAskPanel` is what the
// palette calls, and `setAskAgent` is where the agent connection plugs in. The panel itself is a
// lazy chunk behind `AskHost`.

export { AskHost } from "./AskHost";
export { AskLibraryButton } from "./AskLibraryButton";
export { type AskAgent, type AskMode, type AskRequest, setAskAgent } from "./agent";
export { type AskStart, closeAskPanel, openAskPanel } from "./store";
