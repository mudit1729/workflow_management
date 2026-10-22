// Where archify's errors sit in the source, and the order they are read in.
import { describe, expect, it } from "vitest";
import type { DiagramError } from "@/gen/types";
import { agentReport } from "./meta";
import { errorLines, orderedErrors } from "./sourceLines";

const source = JSON.stringify(
  {
    meta: { title: "Release flow" },
    nodes: [
      { id: "a", label: "Build" },
      { id: "b", label: "Ship" },
    ],
    edges: [{ from: "a", to: "zzz" }],
  },
  null,
  2,
);

// The validator reports in its own order, not the file's.
const errors: DiagramError[] = [
  { path: "edges[0].to", msg: "unknown node 'zzz'" },
  { path: "meta.theme", msg: "missing" },
  { path: "nodes[1].kind", msg: "missing" },
  { path: "$", msg: "unknown" },
];

describe("diagram errors", () => {
  it("finds the line of a path, or of the object that lacks it", () => {
    const lines = errorLines(source, errors);
    expect(lines[0]).toBe(source.split("\n").findIndex((l) => l.includes('"to"')) + 1);
    // A missing key points at the object that should hold it.
    expect(lines[1]).toBe(source.split("\n").findIndex((l) => l.includes('"meta"')) + 1);
    expect(lines[2]).toBe(source.split("\n").findIndex((l) => l.includes('"id": "b"')) - 1 + 1);
  });

  it("lists the errors top to bottom, with their lines", () => {
    const ordered = orderedErrors(source, errors);
    expect(ordered.errors.map((e) => e.path)).toEqual([
      "$",
      "meta.theme",
      "nodes[1].kind",
      "edges[0].to",
    ]);
    const known = ordered.lines.filter((n): n is number => n !== undefined);
    expect(known).toEqual([...known].sort((a, b) => a - b));
  });

  it("keeps the order of errors that share a line", () => {
    const same: DiagramError[] = [
      { path: "meta.a", msg: "first" },
      { path: "meta.b", msg: "second" },
    ];
    expect(orderedErrors(source, same).errors.map((e) => e.msg)).toEqual(["first", "second"]);
  });

  it("writes Copy for agent in the same order", () => {
    const report = agentReport({
      id: "x",
      hash: "h",
      type: "workflow",
      title: "Release flow",
      file: "plan.md",
      line: 40,
      nodes: 2,
      status: "invalid",
      errors,
      source,
      url: "",
    });
    const body = report.split("\n").slice(1, 5);
    expect(body).toEqual([
      "$: unknown",
      "meta.theme: missing",
      "nodes[1].kind: missing",
      "edges[0].to: unknown node 'zzz'",
    ]);
  });
});
