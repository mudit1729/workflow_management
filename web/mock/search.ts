// Search for the mock server (contract 1.10 `GET /api/search`). A small BM25-style scorer
// over titles, ids, labels, tags and bodies. Hits carry a snippet around the match.
import type { SearchHit } from "@/gen/types";
import type { SearchScope } from "@/lib/api/types";
import type { Derived } from "./derive";
import type { WorldSrc } from "./source";

interface Field {
  text: string;
  /** Weight of a match in this field. */
  weight: number;
}

interface Doc {
  kind: SearchHit["kind"];
  id: string;
  title: string;
  path: string;
  issue?: string;
  fields: Field[];
  /** Where a snippet may come from, best first. */
  body: string;
}

const W = { id: 8, title: 6, label: 3, tag: 3, head: 2, body: 1 } as const;

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const STOP = new Set(
  "a an and are as at be by for from in into is it of on or that the this to was with".split(" "),
);

/** Query terms: stop words dropped unless nothing else is left. */
function queryTerms(q: string): string[] {
  const all = tokenize(q);
  const kept = all.filter((t) => !STOP.has(t));
  return kept.length > 0 ? kept : all;
}

// ---------------------------------------------------------------- corpus

function buildCorpus(world: WorldSrc, d: Derived): Doc[] {
  const docs: Doc[] = [];
  for (const [id, detail] of d.details) {
    const s = detail.summary;
    const dir = s.path;
    const bodyParts = [
      detail.goal.context_md,
      ...detail.criteria.map((c) => `${c.id} ${c.text}`),
      detail.goal.out_of_scope_md ?? "",
      detail.state?.summary ?? "",
    ];
    docs.push({
      kind: "issue",
      id,
      title: s.title,
      path: `${dir}/goal.md`,
      issue: id,
      body: bodyParts.join("\n"),
      fields: [
        { text: id, weight: W.id },
        { text: s.title, weight: W.title },
        { text: s.labels.join(" "), weight: W.label },
        { text: s.group_path.join(" "), weight: W.head },
        { text: bodyParts.join("\n"), weight: W.body },
      ],
    });
    const entries = [
      ...detail.changes.map((e) => ({ e, file: "changes.md" })),
      ...detail.decisions.map((e) => ({ e, file: "decisions.md" })),
      ...detail.learnings.map((e) => ({ e, file: "learnings.md" })),
    ];
    for (const { e, file } of entries) {
      docs.push({
        kind: "entry",
        id: e.id,
        title: e.title,
        path: `${dir}/${file}`,
        issue: id,
        body: e.body_md,
        fields: [
          { text: e.id, weight: W.id },
          { text: e.title, weight: W.title },
          { text: e.body_md, weight: W.body },
        ],
      });
    }
    for (const doc of detail.docs) {
      if (doc.kind !== "markdown") continue;
      docs.push({
        kind: "doc",
        id: doc.path,
        title: doc.title ?? doc.path,
        path: `${dir}/${doc.path}`,
        issue: id,
        body: doc.body_md ?? "",
        fields: [
          { text: doc.title ?? doc.path, weight: W.title },
          { text: doc.body_md ?? "", weight: W.body },
        ],
      });
    }
  }
  for (const l of d.snapshot.library) {
    const detail = d.library.get(l.id);
    const sections = detail?.sections.map((s) => `${s.heading}\n${s.body_md}`).join("\n") ?? "";
    docs.push({
      kind: "library",
      id: l.id,
      title: l.title,
      path: l.path,
      body: `${l.description}\n${sections}`,
      fields: [
        { text: l.id, weight: W.id },
        { text: l.title, weight: W.title },
        { text: l.tags.join(" "), weight: W.tag },
        { text: l.applies_to.join(" "), weight: W.tag },
        { text: l.description, weight: W.head },
        { text: sections, weight: W.body },
      ],
    });
  }
  for (const t of world.glossary) {
    docs.push({
      kind: "term",
      id: t.term,
      title: t.term,
      path: "glossary.md",
      body: t.means,
      fields: [
        { text: t.term, weight: W.title },
        { text: t.avoid.join(" "), weight: W.label },
        { text: t.means, weight: W.body },
      ],
    });
  }
  return docs;
}

const SCOPE_KINDS: Record<SearchScope, SearchHit["kind"][] | undefined> = {
  all: undefined,
  issues: ["issue"],
  entries: ["entry"],
  docs: ["doc"],
  library: ["library"],
  terms: ["term"],
};

// ---------------------------------------------------------------- scoring

/** A query token matches a field token exactly, or as a prefix when it is 2+ characters. */
function matches(query: string, token: string): boolean {
  return token === query || (query.length >= 2 && token.startsWith(query));
}

function snippet(body: string, terms: string[]): string {
  const flat = body.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ");
  const lower = flat.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return flat.slice(0, 140).trim();
  const start = Math.max(0, at - 50);
  const end = Math.min(flat.length, at + 110);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`;
}

export function search(
  world: WorldSrc,
  d: Derived,
  q: string,
  scope: SearchScope = "all",
  k = 12,
): SearchHit[] {
  const terms = queryTerms(q);
  if (terms.length === 0) return [];
  const kinds = SCOPE_KINDS[scope];
  const docs = buildCorpus(world, d).filter((doc) => !kinds || kinds.includes(doc.kind));

  const tokenized = docs.map((doc) => doc.fields.map((f) => tokenize(f.text)));
  const df = new Map<string, number>();
  for (const t of terms) {
    let n = 0;
    for (const fields of tokenized) if (fields.some((toks) => toks.some((x) => matches(t, x)))) n++;
    df.set(t, n);
  }

  interface Scored {
    doc: Doc;
    score: number;
    matched: number;
  }
  const scored: Scored[] = [];
  docs.forEach((doc, i) => {
    let score = 0;
    let matched = 0;
    for (const t of terms) {
      const n = df.get(t) ?? 0;
      if (n === 0) continue;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      let best = 0;
      doc.fields.forEach((field, f) => {
        const toks = tokenized[i][f];
        const tf = toks.filter((x) => matches(t, x)).length;
        if (tf === 0) return;
        // Saturating term frequency, as in BM25, scaled by the field weight.
        const exact = toks.includes(t) ? 1 : 0.7;
        best += field.weight * exact * ((tf * 2.2) / (tf + 1.2));
      });
      if (best > 0) matched++;
      score += idf * best;
    }
    if (matched === 0) return;
    // A phrase in the title is worth more than scattered words.
    if (doc.title.toLowerCase().includes(q.trim().toLowerCase())) score *= 1.5;
    scored.push({ doc, score, matched });
  });

  // Every term must appear somewhere. When nothing does, fall back to the closest partial
  // matches (at least half the terms), scaled down by the share of terms they cover.
  const full = scored.filter((s) => s.matched === terms.length);
  const picked =
    full.length > 0
      ? full
      : scored
          .filter((s) => s.matched >= Math.ceil(terms.length / 2))
          .map((s) => ({ ...s, score: s.score * (s.matched / terms.length) ** 2 }));

  return picked
    .map(({ doc, score }) => ({
      kind: doc.kind,
      id: doc.id,
      title: doc.title,
      snippet: snippet(doc.body, terms),
      score: Math.round(score * 100) / 100,
      path: doc.path,
      issue: doc.issue,
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, k);
}
