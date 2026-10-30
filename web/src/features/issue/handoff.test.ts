// The numbers and words of "Copy context": what the footer of a bundle says, how a count reads,
// the prompt that asks for the same hand-off headlessly.
import { describe, expect, test } from "vitest";
import {
  approxTokens,
  contextFacts,
  HANDOFF_BUDGET,
  handoffPrompt,
  tokenCount,
  tokenLabel,
} from "./handoff";

const bundle = (footer: string) =>
  `# wf-3k9x2 · Push board updates over SSE\n\n## Goal\n\nWhy.\n\n${footer}\nTo resume: codex 'Work on wf-3k9x2'\n`;

describe("contextFacts", () => {
  test("reads the tokens, the budget and nothing left out from the footer", () => {
    const facts = contextFacts(
      bundle("<!-- wf context wf-3k9x2 · ~1,909 of 6,000 tokens · left out: none -->"),
    );
    expect(facts).toEqual({ tokens: 1909, budget: 6000, leftOut: [] });
  });

  test("names the sections the budget cut", () => {
    const facts = contextFacts(
      bundle(
        "<!-- wf context wf-3k9x2 · ~5,980 of 6,000 tokens · left out: Library, Learnings -->",
      ),
    );
    expect(facts.leftOut).toEqual(["Library", "Learnings"]);
    expect(facts.tokens).toBe(5980);
  });

  test("a bundle without a footer is estimated: four characters a token", () => {
    const text = "x".repeat(400);
    expect(contextFacts(text)).toEqual({ tokens: 100, budget: HANDOFF_BUDGET, leftOut: [] });
    expect(approxTokens(text)).toBe(100);
  });
});

describe("token words", () => {
  test("below a thousand it rounds to ten, above to a tenth of a thousand", () => {
    expect(tokenCount(640)).toBe("~640");
    expect(tokenCount(644)).toBe("~640");
    expect(tokenCount(1909)).toBe("~1.9k");
    expect(tokenCount(2000)).toBe("~2k");
    expect(tokenLabel(1500)).toBe("~1.5k tokens");
  });
});

describe("handoffPrompt", () => {
  test("asks for the handing-off skill, which is a skill of the workflow plugin", () => {
    expect(handoffPrompt("wf-3k9x2")).toBe("Hand wf-3k9x2 over: use the handing-off skill.");
  });
});
