// The agent UI (plan D10, D11): the connect flow, the Agent panel and the nav row. The shell opens
// the dialogs through `openAgent` and `openAgentPanel` in `@/app/shell-store`. The shell itself
// imports `AgentStatus` and `agent-copy` by path and the dialogs through `lazy-views`, so this
// index (which holds everything) is for the gallery and the tests.
export { AgentDialogs } from "./AgentDialogs";
export { AgentPanel, AgentPanelBody, type AgentPanelBodyProps } from "./AgentPanel";
export { AgentStatus, AgentStatusRow, type AgentStatusRowProps } from "./AgentStatus";
export {
  connectionAgent,
  installCommands,
  modeLabel,
  otherAgent,
  skillsLine,
  statusHint,
  statusLabel,
} from "./agent-copy";
export { ConnectAgentDialog } from "./ConnectAgentDialog";
export { ConnectAgentPanel } from "./ConnectAgentPanel";
export { AgentTile, StatusDot } from "./parts";
export { type ConnectFlow, type FlowSeed, useConnectFlow } from "./useConnectFlow";
