// The two dialogs of the agent UI, in one lazy chunk: the connect flow and the Agent panel. The
// shell mounts this once (`AppShell`), and `@/app/shell-store` opens them.
import { AgentPanel } from "./AgentPanel";
import { ConnectAgentDialog } from "./ConnectAgentDialog";

export function AgentDialogs() {
  return (
    <>
      <ConnectAgentDialog />
      <AgentPanel />
    </>
  );
}
