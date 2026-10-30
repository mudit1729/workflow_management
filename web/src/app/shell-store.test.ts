// The Add work flow opens from the shell store.
import { beforeEach, describe, expect, test } from "vitest";
import { openAddWork, useShell } from "./shell-store";

beforeEach(() => {
  useShell.setState({
    addWorkOpen: false,
    addWorkStart: undefined,
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
