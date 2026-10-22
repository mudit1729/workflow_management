// Mock diagrams for the prototype (contract 1.5 "Archify block", 1.10 `Diagram`).
//
// archify is not installed here, so the three valid diagrams ship as "unavailable" with
// their JSON sources. Each has a stand-in preview page (public/diagrams/<id>.html, made
// by scripts/render-diagram-previews.mjs); the DevPanel's "Archify available" switch turns
// them into "ready" and the card shows that page. `broken-release-flow` has real defects
// in its JSON, so the same validator that runs here marks it "invalid" with archify-style
// errors that point at them.
import type { Diagram, DiagramError, DiagramType } from "@/gen/types";
import broken from "./diagrams/broken-release-flow.json?raw";
import architecture from "./diagrams/live-board-architecture.json?raw";
import manifestJson from "./diagrams/manifest.json";
import skills from "./diagrams/skills-flow.json?raw";
import sse from "./diagrams/sse-delivery-flow.json?raw";

interface ManifestEntry {
  type: DiagramType;
  /** The workspace file that holds the block. The data layer replaces it with the real one. */
  file: string;
  /** A plausible line; the data layer finds the real one. */
  line: number;
}

const MANIFEST = manifestJson as Record<string, ManifestEntry>;

const SOURCES: Record<string, string> = {
  "live-board-architecture": architecture,
  "sse-delivery-flow": sse,
  "skills-flow": skills,
  "broken-release-flow": broken,
};

// ---------------------------------------------------------------- candidate JSON

interface Candidate {
  meta?: { title?: string };
  groups?: { id?: string; label?: string }[];
  nodes?: { id?: string; label?: string; kind?: string; group?: string; note?: string }[];
  edges?: { from?: string; to?: string; label?: string }[];
}

/** Stable 12-char hex from the source text: FNV-1a over 64 bits (stands in for blake3). */
function hashOf(text: string): string {
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
 * JSON path style of its receipt ("edges[7].to").
 */
function validate(c: Candidate): DiagramError[] {
  const required: DiagramError[] = [];
  const references: DiagramError[] = [];
  const semantics: DiagramError[] = [];

  const nodes = c.nodes ?? [];
  const edges = c.edges ?? [];
  const groups = new Set((c.groups ?? []).map((g) => g.id));
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

// ---------------------------------------------------------------- the diagrams

function build(id: string): Diagram {
  const entry = MANIFEST[id];
  const candidate = JSON.parse(SOURCES[id]) as Candidate;
  const source = JSON.stringify(candidate, null, 2);
  const errors = validate(candidate);
  return {
    id,
    hash: hashOf(source),
    type: entry.type,
    title: candidate.meta?.title ?? id,
    file: entry.file,
    line: entry.line,
    nodes: candidate.nodes?.length ?? 0,
    // Without archify nothing renders. Defects in the JSON are still found.
    status: errors.length ? "invalid" : "unavailable",
    errors,
    source,
    // The stand-in preview. An invalid diagram has nothing to show.
    url: errors.length ? "" : `${import.meta.env.BASE_URL}diagrams/${id}.html`,
  };
}

export const DIAGRAMS: Record<string, Diagram> = Object.fromEntries(
  Object.keys(MANIFEST).map((id) => [id, build(id)]),
);
