// Group names for an outcome sentence: nouns, never a verb or a broken clause, three of them.
import { describe, expect, test } from "vitest";
import { MAX_NAME, suggestGroupNames, topicOf } from "./names";

const OUTCOMES: [string, string[]][] = [
  [
    "Make the board feel instant when a lot of agents write at once",
    ["Board speed", "Board", "Board speed improvements"],
  ],
  [
    "Agents can resume any issue from the handoff bundle without reading the whole folder",
    ["Handoff bundle", "Issue", "Agents"],
  ],
  ["Teams install the workflow skills with one command", ["Workflow skills", "Command", "Teams"]],
  [
    "Let people sign in with single sign-on",
    ["Single sign-on", "Single sign-on improvements", "Single sign-on rollout"],
  ],
  [
    "Make onboarding smoother",
    ["Onboarding smoothness", "Onboarding", "Onboarding smoothness rollout"],
  ],
  [
    "Push board updates over SSE so agents see changes at once",
    ["Board updates", "SSE", "Board updates improvements"],
  ],
];

describe("suggestGroupNames", () => {
  test.each(OUTCOMES)("%s", (outcome, names) => {
    expect(suggestGroupNames(outcome)).toEqual(names);
  });

  test("always three names, each a noun phrase that fits", () => {
    for (const [outcome] of OUTCOMES) {
      const names = suggestGroupNames(outcome);
      expect(names, outcome).toHaveLength(3);
      for (const name of names) {
        expect(name.length, name).toBeLessThanOrEqual(MAX_NAME);
        expect(name, name).toMatch(/^[A-Z]/);
        // No name starts with a verb or a determiner, and none ends on a small word.
        expect(name.split(" ")[0], name).not.toMatch(
          /^(Make|Let|Push|Install|Resume|The|A|An|Agents can)$/,
        );
        expect(name, name).not.toMatch(/ (a|an|and|at|by|for|from|in|into|of|on|or|the|to|with)$/i);
      }
      expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3);
    }
  });

  test("a name a sibling group already uses is skipped", () => {
    const names = suggestGroupNames("Let people sign in with single sign-on", ["Single sign-on"]);
    expect(names).not.toContain("Single sign-on");
    expect(names[0]).toBe("Single sign-on improvements");
  });

  test("a sentence without a noun gives no names", () => {
    expect(suggestGroupNames("")).toEqual([]);
    expect(suggestGroupNames("Make it")).toEqual([]);
  });

  test("the topic keeps the words of the sentence", () => {
    expect(topicOf("Agents can resume any issue from the handoff bundle").topic).toEqual([
      "handoff",
      "bundle",
    ]);
    expect(topicOf("Teams install the workflow skills with one command").subject).toEqual([
      "Teams",
    ]);
  });
});
