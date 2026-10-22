// Archify blocks (contract 1.5): a fenced block ```archify <type> id=<slug> whose body is an
// archify JSON candidate. This module finds the blocks in a file, validates the candidate with
// the checks `archify finalize` makes before it draws, and builds the `Diagram` of the API.
// The daemon swaps each block for a ```wf-diagram fence in the prose it sends; `proseOf` does too.
import type { Diagram, DiagramError, DiagramType } from "@/gen/types";
import { type Fence, findFences, joinBlock, type Lines } from "./text";

export const DIAGRAM_TYPES: readonly DiagramType[] = [
  "architecture",
  "workflow",
  "sequence",
  "dataflow",
  "lifecycle",
];

export const isDiagramType = (t: string): t is DiagramType =>
  (DIAGRAM_TYPES as readonly string[]).includes(t);

// ---------------------------------------------------------------- validation

interface Candidate {
  meta?: { title?: string };
  groups?: { id?: string }[];
  nodes?: { id?: string; label?: string; kind?: string; group?: string }[];
  edges?: { from?: string; to?: string }[];
}

/** Stable 12-char hex from the source text: FNV-1a over 64 bits (stands in for blake3). */
export function hashOf(text: string): string {
  const prime = 0x100000001b3n;
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = BigInt.asUintN(64, h * prime);
  }
  return h.toString(16).padStart(16, "0").slice(0, 12);
}

/**
 * The checks archify's `finalize` makes before it draws: required fields, duplicate ids,
 * references to unknown nodes and groups, and decisions that cannot branch. Paths use the
 * JSON path style of its receipt ("edges[7].to"). Never throws.
 */
export function validateCandidate(input: unknown): DiagramError[] {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return [{ path: "$", msg: "expected a JSON object" }];
  const c = input as Candidate;
  const required: DiagramError[] = [];
  const references: DiagramError[] = [];
  const semantics: DiagramError[] = [];

  const nodes = Array.isArray(c.nodes) ? c.nodes : [];
  const edges = Array.isArray(c.edges) ? c.edges : [];
  const groups = new Set((Array.isArray(c.groups) ? c.groups : []).map((g) => g?.id));
  const seen = new Set<string>();

  nodes.forEach((n, i) => {
    if (!n.id) {
      required.push({ path: `nodes[${i}].id`, msg: "missing required property" });
    } else if (seen.has(n.id)) {
      required.push({ path: `nodes[${i}].id`, msg: `duplicate id '${n.id}'` });
    } else {
      seen.add(n.id);
    }
    if (!n.label?.trim()) {
      required.push({ path: `nodes[${i}].label`, msg: "missing required property" });
    }
    if (n.group && !groups.has(n.group)) {
      references.push({ path: `nodes[${i}].group`, msg: `unknown group '${n.group}'` });
    }
  });

  const exits = new Map<string, number>();
  edges.forEach((e, i) => {
    for (const end of ["from", "to"] as const) {
      const id = e[end];
      if (!id) required.push({ path: `edges[${i}].${end}`, msg: "missing required property" });
      else if (!seen.has(id)) {
        references.push({ path: `edges[${i}].${end}`, msg: `unknown node '${id}'` });
      }
    }
    if (e.from && e.to && seen.has(e.from) && seen.has(e.to)) {
      exits.set(e.from, (exits.get(e.from) ?? 0) + 1);
    }
  });

  nodes.forEach((n, i) => {
    const count = n.id ? (exits.get(n.id) ?? 0) : 0;
    if (n.kind === "decision" && count < 2) {
      semantics.push({
        path: `nodes[${i}]`,
        msg: `decision '${n.id}' needs at least 2 outgoing edges, found ${count}`,
      });
    }
  });

  return [...required, ...references, ...semantics];
}

// ---------------------------------------------------------------- blocks

/** What went wrong with a block, before any rendering: contract F010 and F011. */
export interface BlockProblem {
  rule: "F010" | "F011";
  /** Short text for the finding; the diagram's `errors` carry the details. */
  message: string;
  fix: string;
}

export interface DiagramBlock {
  /** 0-based line of the opening fence, and of the closing fence. */
  open: number;
  close: number;
  /** Anchor id: `id=<slug>`, or the hash of type and body. */
  id: string;
  diagram: Diagram;
  problem?: BlockProblem;
}

const ARCHIFY_INFO = /^archify(?:\s+(.*))?$/;

function parseInfo(info: string): { type: string; id?: string } {
  const m = ARCHIFY_INFO.exec(info);
  const parts = (m?.[1] ?? "").split(/\s+/).filter(Boolean);
  let id: string | undefined;
  let type = "";
  for (const p of parts) {
    if (p.startsWith("id=")) id = p.slice(3);
    else if (!type) type = p;
  }
  return { type, id };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function buildBlock(f: Fence, file: string, taken: Set<string>): DiagramBlock {
  const { type, id: written } = parseInfo(f.info);
  const body = f.body.join("\n");
  let id = written || hashOf(`${type}\0${body}`);
  // The same id twice (in one file or across issues) would collide in the API: keep the first.
  for (let n = 2; taken.has(id); n++) id = `${written || hashOf(`${type}\0${body}`)}-${n}`;
  taken.add(id);

  const validType = isDiagramType(type);
  const base = {
    id,
    hash: hashOf(body),
    type: (validType ? type : "workflow") as DiagramType,
    file,
    line: f.open + 1,
    source: body,
    url: "",
  };

  if (!validType) {
    const msg = type ? `unknown archify type '${type}'` : "the info string names no archify type";
    return {
      open: f.open,
      close: f.close,
      id,
      diagram: { ...base, title: id, nodes: 0, status: "invalid", errors: [{ path: "$", msg }] },
      problem: {
        rule: "F010",
        message: `Archify block has ${type ? `an unknown type \`${type}\`` : "no type"}.`,
        fix: `Use one of ${DIAGRAM_TYPES.join(", ")}, as in \`archify workflow id=${id}\`.`,
      },
    };
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid JSON";
    return {
      open: f.open,
      close: f.close,
      id,
      diagram: {
        ...base,
        title: id,
        nodes: 0,
        status: "invalid",
        errors: [{ path: "$", msg: `invalid JSON: ${msg}` }],
      },
      problem: {
        rule: "F010",
        message: `Archify block holds invalid JSON. ${msg}.`,
        fix: "Fix the JSON, then run `wf lint --render`.",
      },
    };
  }

  const errors = validateCandidate(candidate);
  const c = (typeof candidate === "object" && candidate !== null ? candidate : {}) as Candidate;
  const diagram: Diagram = {
    ...base,
    title: c.meta?.title ?? id,
    nodes: Array.isArray(c.nodes) ? c.nodes.length : 0,
    // Without archify nothing renders. The store flips valid blocks to "ready" when it can.
    status: errors.length ? "invalid" : "unavailable",
    errors,
  };
  if (!errors.length) return { open: f.open, close: f.close, id, diagram };
  const first = errors[0];
  return {
    open: f.open,
    close: f.close,
    id,
    diagram,
    problem: {
      rule: "F011",
      message: `Archify render failed with ${plural(errors.length, "error")}${first ? `. ${first.path}: ${first.msg}` : "."}`,
      fix: "Fix the JSON paths in the block, then run `wf lint --render`.",
    },
  };
}

/** Find the archify blocks of a file. `taken` collects ids across files so ids stay unique. */
export function findDiagramBlocks(l: Lines, file: string, taken: Set<string>): DiagramBlock[] {
  return findFences(l.lines)
    .filter((f) => ARCHIFY_INFO.test(f.info))
    .map((f) => buildBlock(f, file, taken));
}

/**
 * Prose of lines [from, to) the way the daemon sends it: each archify block becomes a
 * ```wf-diagram fence that names the diagram. Blank lines at both ends are trimmed.
 */
export function proseOf(l: Lines, from: number, to: number, blocks: DiagramBlock[]): string {
  const out: string[] = [];
  let i = from;
  while (i < to) {
    const b = blocks.find((x) => x.open === i);
    if (b && b.close < to) {
      out.push("```wf-diagram", b.id, "```");
      i = b.close + 1;
      continue;
    }
    out.push(l.lines[i]);
    i++;
  }
  return joinBlock(out);
}
