// The Add work flow opens from the shell store, and the old entry points still reach it.
import { beforeEach, describe, expect, test } from "vitest";
import { openAddWork, openNewGroup, openNewIssue, useShell } from "./shell-store";

beforeEach(() => {
  useShell.setState({
    addWorkOpen: false,
    addWorkStart: undefined,
    newIssueOpen: false,
    newGroupOpen: false,
  });
});

const state = () => useShell.getState();

describe("openAddWork", () => {
  test("opens the flow with nothing preselected", () => {
    openAddWork();
    expect(state().addWorkOpen).toBe(true);
    expect(state().addWorkStart).toBeUndefined();
  });

  test("opens it on a path with a group", () => {
    openAddWork({ kind: "group", group: "g-web01" });
    expect(state().addWorkOpen).toBe(true);
    expect(state().addWorkStart).toEqual({ kind: "group", group: "g-web01" });
  });

  test("a group alone is enough", () => {
    openAddWork({ group: "g-core1" });
    expect(state().addWorkStart).toEqual({ group: "g-core1" });
  });

  test("a new open replaces the old start", () => {
    openAddWork({ kind: "issue", group: "g-web01" });
    openAddWork();
    expect(state().addWorkStart).toBeUndefined();
  });

  test("closing keeps the flow's start for the exit animation, and reopening resets it", () => {
    openAddWork({ kind: "issue", group: "g-web01" });
    state().setAddWorkOpen(false);
    expect(state().addWorkOpen).toBe(false);
    expect(state().addWorkStart).toEqual({ kind: "issue", group: "g-web01" });
    state().setAddWorkOpen(true, { kind: "group" });
    expect(state().addWorkStart).toEqual({ kind: "group" });
  });
});

describe("the old entry points open the old dialogs until Add work replaces them", () => {
  test("openNewIssue(group) opens New issue in that group", () => {
    openNewIssue("g-web01");
    expect(state().newIssueOpen).toBe(true);
    expect(state().newIssueGroup).toBe("g-web01");
    expect(state().addWorkOpen).toBe(false);
  });

  test("openNewGroup(parent) opens New group under that parent", () => {
    openNewGroup("g-wf001");
    expect(state().newGroupOpen).toBe(true);
    expect(state().newGroupParent).toBe("g-wf001");
    expect(state().addWorkOpen).toBe(false);
  });

  test("the legacy dialog state still works for callers that set it directly", () => {
    state().setNewIssueOpen(true, "g-web01");
    expect(state().newIssueOpen).toBe(true);
    expect(state().newIssueGroup).toBe("g-web01");
    state().setNewGroupOpen(true, "g-wf001");
    expect(state().newGroupParent).toBe("g-wf001");
  });
});
