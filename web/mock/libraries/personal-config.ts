// The person's `library.toml` as configuration (skills-flow-spec 3.2): besides `name`, `owner` and
// `kind = "personal"` it can hold a `[flow]` override, the same tables as `workflow.toml`. The
// manifest reader ignores the keys it does not know, so the override costs it nothing; this file
// reads the part the flow needs. Reading never throws: a file that is not TOML has no override and
// says why.
import { parse } from "smol-toml";
import type { FlowConfig } from "@/gen/types";
import { emptyFlow, parseFlow } from "../md/parse-flow";

export interface PersonalFlow {
  flow: FlowConfig;
  /** What could not be used, one sentence each: the TOML error, a value the flow does not take. */
  problems: string[];
}

/** The `[flow]` of a `library.toml` text. A missing file (undefined) is an empty flow. */
export function readPersonalFlow(text: string | undefined): PersonalFlow {
  if (text === undefined) return { flow: emptyFlow(), problems: [] };
  let data: Record<string, unknown>;
  try {
    data = parse(text) as Record<string, unknown>;
  } catch (err) {
    return {
      flow: emptyFlow(),
      problems: [
        `library.toml is not valid TOML: ${(err instanceof Error ? err.message : String(err)).split("\n")[0]}`,
      ],
    };
  }
  const problems: string[] = [];
  // The team-only options are not read here: a personal file cannot set them.
  const flow = parseFlow(data.flow, (_rule, _at, message) => problems.push(message));
  return { flow, problems };
}

/** The reason a text is not a `library.toml` the dashboard may save, or undefined when it is. */
export function personalConfigProblem(text: string): string | undefined {
  try {
    parse(text);
    return undefined;
  } catch (err) {
    return `library.toml is not valid TOML: ${(err instanceof Error ? err.message : String(err)).split("\n")[0]}`;
  }
}
