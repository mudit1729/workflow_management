// Shared vocabulary of the library views: kind and status labels, the section order per
// kind, and small formatters.
import { Fragment } from "react";
import { Chip } from "@/components/ui";
import type { LibId, LibraryKind, LibrarySection, LibraryStatus } from "@/gen/types";
import { cn } from "@/lib/cn";

export const LIBRARY_KINDS: LibraryKind[] = ["pattern", "playbook", "gotcha", "decision"];

export const KIND_PLURAL: Record<LibraryKind, string> = {
  pattern: "Patterns",
  playbook: "Playbooks",
  gotcha: "Gotchas",
  decision: "Decisions",
};

/** Reviewed first: what agents can read. Drafts wait for a reviewer. */
export const LIBRARY_STATUSES: LibraryStatus[] = ["reviewed", "draft", "retired"];

export const LIBRARY_STATUS_LABEL: Record<LibraryStatus, string> = {
  reviewed: "Reviewed",
  draft: "Draft",
  retired: "Retired",
};

/** Body sections per kind (contract 1.4). The first one is the point of the item. */
export const SECTION_ORDER: Record<LibraryKind, string[]> = {
  pattern: ["Rule", "When to use", "Example", "Evidence"],
  gotcha: ["Symptom", "Cause", "Fix", "Evidence"],
  playbook: ["Overview", "Procedure", "Done when", "Forbidden"],
  decision: ["Decision", "Because", "Rejected", "Revisit when"],
};

/** Sections in kind order; headings the kind does not know keep their file order at the end. */
export function sortSections(kind: LibraryKind, sections: LibrarySection[]): LibrarySection[] {
  const order = SECTION_ORDER[kind].map((h) => h.toLowerCase());
  const rank = (s: LibrarySection) => {
    const i = order.indexOf(s.heading.trim().toLowerCase());
    return i === -1 ? order.length : i;
  };
  return sections
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map(({ s }) => s);
}

/** The DOM id of a list row, so the list can scroll a deep-linked item into view. */
export function rowDomId(id: LibId): string {
  return `lib-row-${id}`;
}

export function libraryPath(kind: LibraryKind, slug: string): string {
  return `library/${kind}s/${slug}.md`;
}

/** draft = outline, reviewed = success, retired = faint and struck. */
export function LibraryStatusChip({
  status,
  size,
  className,
}: {
  status: LibraryStatus;
  /** `xs` for dense rows (pickers); the default is the list's size. */
  size?: "xs" | "sm";
  className?: string;
}) {
  if (status === "draft") {
    return (
      <Chip tone="outline" size={size} className={className}>
        Draft
      </Chip>
    );
  }
  if (status === "reviewed") {
    return (
      <Chip tone="success" size={size} className={className}>
        Reviewed
      </Chip>
    );
  }
  return (
    <Chip
      tone="neutral"
      size={size}
      className={cn("bg-transparent text-fg-faint line-through decoration-fg-faint/70", className)}
    >
      Retired
    </Chip>
  );
}

/** "2026-10-22" → "Oct 22, 2026". Date-only strings are local dates, not UTC. */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Lowercase kebab slug: "Rescan subtrees, don't trust notify!" → "rescan-subtrees-dont-trust-notify". */
export function kebab(text: string, max = 56): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= max) return slug;
  // Cut at a word boundary.
  const cut = slug.slice(0, max);
  const at = cut.lastIndexOf("-");
  return (at > 16 ? cut.slice(0, at) : cut).replace(/-+$/g, "");
}

/** Text with `inline code` spans. Descriptions and glossary meanings carry no other markup. */
export function InlineCode({ text, className }: { text: string; className?: string }) {
  return (
    <span data-wf="InlineCode">
      {text.split("`").map((part, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className={cn("rounded-sm bg-muted px-1 py-px font-mono text-sm text-fg", className)}
          >
            {part}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}
