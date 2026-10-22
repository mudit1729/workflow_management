// Types of the markdown layer: what a parse of one file reports, and what the loader returns.
import type { Diagnostic, Diagram, IssueId, LibId, Severity } from "@/gen/types";
import type { WorldSrc } from "../source";
import { bytes, type Lines } from "./text";

export type IssueFileName =
  | "goal.md"
  | "plan.md"
  | "current_state.md"
  | "changes.md"
  | "decisions.md"
  | "learnings.md";

export const ISSUE_FILES: readonly IssueFileName[] = [
  "goal.md",
  "plan.md",
  "current_state.md",
  "changes.md",
  "decisions.md",
  "learnings.md",
];

/** A lint finding before it gets its file path: one rule hit at one place. */
export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  /** 1-based line and column; `span` is the byte span in the file. */
  line: number;
  col: number;
  span: [number, number];
  fix?: string;
}

/** Where an addressable element sits in its file (for EditRefs and the files view). */
export interface Anchor {
  /** 1-based first and last line. */
  line: number;
  end: number;
  /** Byte span of the whole element, first character to last. */
  span: [number, number];
}

/** What reading one file produces besides its data. */
export class FileCtx {
  readonly findings: Finding[] = [];
  readonly anchors: Record<string, Anchor> = {};
  constructor(
    readonly path: string,
    readonly L: Lines,
  ) {}

  /** Report a finding on line `i` (0-based), optionally limited to columns [from, to). */
  report(
    rule: string,
    severity: Severity,
    i: number,
    message: string,
    fix?: string,
    from = 0,
    to?: number,
  ): void {
    const line = Math.min(Math.max(i, 0), this.L.lines.length - 1);
    const text = this.L.lines[line] ?? "";
    const end = to ?? text.length;
    const a = this.L.byte[line] + bytes(text.slice(0, from));
    const b = this.L.byte[line] + bytes(text.slice(0, end));
    this.findings.push({
      rule,
      severity,
      message,
      line: line + 1,
      col: from + 1,
      span: [a, b],
      fix,
    });
  }

  /** Register an anchor over lines [first, last] (0-based, inclusive). */
  anchor(id: string, first: number, last = first): void {
    const a = this.L.byte[first] ?? 0;
    const lastLine = this.L.lines[last] ?? "";
    const b = (this.L.byte[last] ?? 0) + bytes(lastLine);
    this.anchors[id] = { line: first + 1, end: last + 1, span: [a, b] };
  }
}

/** Default severity of each F rule (contract Part 3 §4). */
export const F_SEVERITY: Record<string, Severity> = {
  F001: "error",
  F002: "error",
  F003: "error",
  F004: "error",
  F005: "warn",
  F006: "info",
  F007: "warn",
  F008: "error",
  F009: "warn",
  F010: "error",
  F011: "error",
  F012: "error",
  F013: "error",
  F014: "warn",
  F016: "error",
  F017: "warn",
};

/** The text of the files of one issue folder, as read. */
export type IssueTexts = Partial<Record<IssueFileName, string>>;

/** A file the loader did not take into the world but keeps (README, unknown files). */
export interface LoadedWorkspace {
  /** The sources `derive()` turns into the API shapes. */
  world: WorldSrc;
  /** Raw text of the six files of each issue. */
  texts: Record<IssueId, IssueTexts>;
  /** Raw text of each library item, keyed by id. */
  libraryTexts: Record<LibId, string>;
  /** Workspace-relative folder of each issue and each group. */
  issueDirs: Record<IssueId, string>;
  groupDirs: Record<string, string>;
  /** Workspace-relative path of each library item. */
  libraryPaths: Record<LibId, string>;
  /**
   * F and S findings per file, keyed by workspace-relative path (issue files, library items,
   * `_group.md`, `authors.md`, `glossary.md`, `workflow.toml`). Q rules are not here.
   */
  diagnostics: Record<string, Diagnostic[]>;
  /** Position of every addressable element per file: SC-n, T-n, T-n.k, Q-…, C-/D-/L-…, keys. */
  anchors: Record<string, Record<string, Anchor>>;
  /** Diagrams built from the archify blocks, by id. `url` is left empty. */
  diagrams: Record<string, Diagram>;
  /** goal.md frontmatter state per issue: `ok` is false after F001. */
  frontmatter: Record<IssueId, { ok: boolean; line?: number }>;
  /** Binary files (images…) the loader was told about, by workspace-relative path. */
  assets: Record<string, { url: string; bytes: number }>;
  /** Parsed `[lint]` table of workflow.toml. */
  lint: { disable: string[]; severity: Record<string, Severity> };
  /** Every input path the loader recognised, and those it ignored. */
  recognised: string[];
  ignored: string[];
}

export interface LoadOptions {
  /** Binary files by workspace-relative path: the URL to serve them from and their size. */
  binary?: Record<string, { url: string; bytes: number }>;
  /** The instant used for defaults that need one (a missing `created`). Default `Date.now()`. */
  now?: number;
}
