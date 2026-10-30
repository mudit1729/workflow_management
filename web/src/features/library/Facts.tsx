// The facts about a page, for the right rail: what its frontmatter says (kind, status, authors,
// dates, tags and any other key) and, for an item of the workspace library, what the library
// knows about it (review dates, who reviewed it, where it came from).
import type { ReactNode } from "react";
import { AuthorChip, AuthorStack, KIND_LABEL, KindIcon, RefLink } from "@/components/common";
import { Chip } from "@/components/ui";
import type { LibraryItemDetail } from "@/gen/types";
import { useLibraryItem } from "@/lib/api";
import type { LibraryPage } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatDate, LibraryStatusChip } from "./meta";

/** Keys the header and the rail already say. */
const SHOWN = new Set(["title", "kind", "status", "tags", "id", "order"]);

export function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-wf="Fact" className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-fg-faint text-xs">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-base text-fg-muted">{children}</dd>
    </div>
  );
}

const scalar = (v: unknown): string | undefined =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : undefined;

/** `reviewed_by` → `Reviewed by`: a key as a label. */
export function labelOf(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words[0]?.toUpperCase() + words.slice(1) : key;
}

/** Keys whose values are handles. */
const PEOPLE = new Set(["author", "authors", "owner", "reviewed_by", "summarized_by"]);

function People({ value }: { value: unknown }) {
  const handles = (Array.isArray(value) ? value : [value]).map((h) => String(h).replace(/^@/, ""));
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {handles.map((h) => (
        <AuthorChip key={h} handle={h} variant="text" />
      ))}
    </span>
  );
}

/** A frontmatter value as one line of text. */
export function valueText(v: unknown): string {
  if (Array.isArray(v)) return v.map(valueText).join(", ");
  if (v && typeof v === "object") return JSON.stringify(v);
  return scalar(v) ?? "";
}

/** Facts from the frontmatter of any page. */
export function FrontmatterFacts({ page }: { page: LibraryPage }) {
  const fm = page.frontmatter;
  const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : [];
  const status = scalar(fm.status);
  const rest = Object.entries(fm).filter(([k, v]) => !SHOWN.has(k) && valueText(v) !== "");
  return (
    <dl data-wf="FrontmatterFacts" className="m-0 flex flex-col gap-2.5">
      {page.kind !== "page" && page.kind !== "section" && (
        <Fact label="Kind">
          <span className="capitalize">{page.kind.replace(/-/g, " ")}</span>
        </Fact>
      )}
      {status && (
        <Fact label="Status">
          <Chip tone="neutral">{status.replace(/_/g, " ")}</Chip>
        </Fact>
      )}
      {tags.length > 0 && (
        <Fact label="Tags">
          <span className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </span>
        </Fact>
      )}
      {rest.map(([k, v]) => (
        <Fact key={k} label={labelOf(k)}>
          {PEOPLE.has(k) ? (
            <People value={v} />
          ) : (
            <span className="whitespace-pre-line">{valueText(v)}</span>
          )}
        </Fact>
      ))}
    </dl>
  );
}

/** Facts of a workspace library item: kind, status, authors and the review dates. */
export function ItemFacts({ detail }: { detail: LibraryItemDetail }) {
  const s = detail.summary;
  const overdue = s.review_overdue && s.status !== "retired";
  return (
    <dl data-wf="ItemFacts" className="m-0 flex flex-col gap-2.5">
      <Fact label="Kind">
        <span className="inline-flex items-center gap-1.5">
          <KindIcon kind={s.kind} size={14} />
          {KIND_LABEL[s.kind]}
        </span>
      </Fact>
      <Fact label="Status">
        <LibraryStatusChip status={s.status} />
      </Fact>
      <Fact label="Authors">
        {s.authors.length > 0 ? (
          <span className="flex min-w-0 items-center gap-2">
            <AuthorStack handles={s.authors} max={4} />
            <span className="min-w-0 truncate">{s.authors.map((h) => `@${h}`).join(", ")}</span>
          </span>
        ) : (
          "None recorded"
        )}
      </Fact>
      <Fact label="Reviewed by">
        {detail.reviewed_by ? (
          <AuthorChip handle={detail.reviewed_by} size="sm" />
        ) : (
          <span className="text-fg-faint">Not reviewed yet</span>
        )}
      </Fact>
      <Fact label="Created">
        <span className="tabular">{formatDate(s.created)}</span>
      </Fact>
      <Fact label="Last reviewed">
        {s.last_reviewed ? (
          <span className="tabular">{formatDate(s.last_reviewed)}</span>
        ) : (
          <span className="text-fg-faint">Never</span>
        )}
      </Fact>
      <Fact label="Review after">
        {s.review_after ? (
          <span className={cn("tabular", overdue && "text-stale-text")}>
            {formatDate(s.review_after)}
            {overdue && " · overdue"}
          </span>
        ) : (
          <span className="text-fg-faint">No date set</span>
        )}
      </Fact>
      {s.tags.length > 0 && (
        <Fact label="Tags">
          <span className="flex flex-wrap gap-1">
            {s.tags.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </span>
        </Fact>
      )}
      {s.applies_to.length > 0 && (
        <Fact label="Applies to">
          <span className="flex flex-wrap gap-1">
            {s.applies_to.map((a) => (
              <Chip key={a} tone="outline" className="font-mono">
                {a}
              </Chip>
            ))}
          </span>
        </Fact>
      )}
      {detail.source.length > 0 && (
        <Fact label="Promoted from">
          <span className="flex flex-col gap-0.5">
            {detail.source.map((ref) => (
              <RefLink key={ref.target} target={ref.target} />
            ))}
          </span>
        </Fact>
      )}
      <Fact label="Id">
        <code className="code-inline">{s.id}</code>
      </Fact>
    </dl>
  );
}

/** The item behind a workspace page, when it is one. */
export function useItemOf(page: LibraryPage | undefined) {
  return useLibraryItem(page?.item).data;
}
