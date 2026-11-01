// The keyboard model of the flow (spec 5.2): the cards and the "+" buttons are one tab stop, the
// arrow keys move between them in reading order. The item that last had focus is the tab stop.
import { createContext, useContext } from "react";

export interface FlowNavState {
  /** The key of the item that is the tab stop. Undefined outside a flow map: every item is one. */
  active: string | undefined;
  setActive: (key: string) => void;
}

export const FlowNavContext = createContext<FlowNavState>({
  active: undefined,
  setActive: () => {},
});

/** The props that make an element an item of the flow's arrow-key group. */
export function useFlowItem(key: string) {
  const { active, setActive } = useContext(FlowNavContext);
  return {
    "data-flow-nav": key,
    tabIndex: active === undefined || active === key ? 0 : -1,
    onFocus: () => setActive(key),
  } as const;
}
