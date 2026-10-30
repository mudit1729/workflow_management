// "Ask about this page": the wiki viewer calls `openAsk(address)`. The Ask panel (spec section 6,
// `features/ask`) registers itself with `setAskHandler` when the shell mounts `AskHost`: it opens
// on that page, for the issue that is open or for one the person picks. Until a handler is
// registered, the button tells the reader so.
import { toast } from "sonner";

type AskHandler = (address: string) => void;

let handler: AskHandler | undefined;

/** Open the Ask panel on one page (`alias:path`, with a `#heading` for a section). */
export function openAsk(address: string): void {
  if (handler) handler(address);
  else toast("Ask library is not connected yet", { description: address });
}

/** The Ask panel takes over `openAsk`. Returns a function that gives it back. */
export function setAskHandler(fn: AskHandler): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = undefined;
  };
}
