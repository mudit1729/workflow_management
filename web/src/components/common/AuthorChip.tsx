// Author identity: hue tile (agents = rounded square with a bot glyph, humans = circle with
// an initial) plus "@handle". Hover shows the authors.md card. Unknown handles go gray (Q012).
import { Bot, User } from "lucide-react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger, Tooltip } from "@/components/ui";
import type { Author, Runtime } from "@/gen/types";
import { useAuthors } from "@/lib/api";
import { cn } from "@/lib/cn";

const RUNTIME_LABEL: Record<Runtime, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  other: "Other",
};

export function authorHue(author?: Author): string {
  return author ? `var(--wf-hue-${author.color})` : "var(--wf-text-faint)";
}

function initials(author: Author | undefined, handle: string, max: number): string {
  const words = (author?.name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length ? words.map((w) => w[0]) : [handle[0] ?? "?"];
  return letters.slice(0, max).join("").toUpperCase();
}

export interface AuthorAvatarProps {
  handle: string;
  author?: Author;
  /** Pixel size of the tile. */
  px: number;
  className?: string;
  style?: CSSProperties;
}

/** The bare tile. Prefer `AuthorChip variant="avatar"`, which adds the hover card. */
export function AuthorAvatar({ handle, author, px, className, style }: AuthorAvatarProps) {
  const agent = author?.kind === "agent";
  const two = px >= 20;
  return (
    <span
      data-wf="AuthorAvatar"
      role="img"
      aria-label={`@${handle}`}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-semibold text-white leading-none",
        agent ? "rounded-[3px]" : "rounded-full",
        px >= 24 && agent && "rounded-[5px]",
        className,
      )}
      style={{
        width: px,
        height: px,
        background: authorHue(author),
        fontSize: two ? px * 0.4 : px * 0.55,
        ...style,
      }}
    >
      {agent ? (
        <Bot aria-hidden size={Math.round(px * 0.7)} strokeWidth={2.25} />
      ) : (
        initials(author, handle, two ? 2 : 1)
      )}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-faint">{label}</dt>
      <dd className="min-w-0 truncate text-fg">{children}</dd>
    </>
  );
}

function AuthorCard({ author }: { author: Author }) {
  const agent = author.kind === "agent";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <AuthorAvatar handle={author.handle} author={author} px={28} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-base text-fg">
            {author.name ?? `@${author.handle}`}
          </span>
          <span className="flex items-center gap-1 text-fg-muted text-sm">
            {author.name && <span className="truncate">@{author.handle}</span>}
            {author.name && <span aria-hidden>·</span>}
            {agent ? (
              <Bot aria-hidden size={12} strokeWidth={1.75} />
            ) : (
              <User aria-hidden size={12} strokeWidth={1.75} />
            )}
            {agent ? "Agent" : "Human"}
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm">
        {author.runtime && <Row label="Runtime">{RUNTIME_LABEL[author.runtime]}</Row>}
        {author.model && (
          <Row label="Model">
            <span className="font-mono text-[11.5px]">{author.model}</span>
          </Row>
        )}
        <Row label="Lanes">
          {author.lanes.length ? (
            <span className="flex flex-wrap gap-1">
              {author.lanes.map((l) => (
                <span
                  key={l}
                  className="inline-flex h-4 items-center rounded-sm bg-muted px-1 text-[10.5px] text-fg-muted"
                >
                  {l}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-fg-muted">Any lane</span>
          )}
        </Row>
        <Row label="Max leases">
          <span className="tabular">{author.max_leases}</span>
        </Row>
      </dl>
    </div>
  );
}

export interface AuthorChipProps {
  handle: string;
  size?: "xs" | "sm";
  variant?: "chip" | "avatar" | "text";
  className?: string;
}

export function AuthorChip({
  handle: raw,
  size = "sm",
  variant = "chip",
  className,
}: AuthorChipProps) {
  const handle = raw.replace(/^@/, "");
  const authors = useAuthors();
  const author = authors.get(handle);
  const loading = authors.size === 0;
  const unknown = !author && !loading;
  const px = size === "xs" ? 14 : 16;

  let body: ReactElement;
  if (variant === "avatar") {
    body = (
      <span data-wf="AuthorChip" className={cn("inline-flex shrink-0", className)}>
        <AuthorAvatar handle={handle} author={author} px={px} />
      </span>
    );
  } else if (variant === "text") {
    body = (
      <span
        data-wf="AuthorChip"
        className={cn(
          "font-medium text-fg underline-offset-[3px] hover:underline",
          unknown && "text-fg-muted decoration-dashed",
          className,
        )}
        style={{ textDecorationColor: authorHue(author) }}
      >
        @{handle}
      </span>
    );
  } else {
    body = (
      <span
        data-wf="AuthorChip"
        className={cn(
          "inline-flex min-w-0 max-w-full items-center gap-1.5 text-fg-muted hover:text-fg",
          size === "xs" ? "gap-1 text-xs" : "text-sm",
          className,
        )}
      >
        <AuthorAvatar handle={handle} author={author} px={px} />
        <span className="min-w-0 truncate">@{handle}</span>
      </span>
    );
  }

  if (unknown) return <Tooltip content={`@${handle} is not in authors.md (Q012)`}>{body}</Tooltip>;
  if (!author) return body;
  return (
    <HoverCard>
      <HoverCardTrigger asChild>{body}</HoverCardTrigger>
      <HoverCardContent className="w-64">
        <AuthorCard author={author} />
      </HoverCardContent>
    </HoverCard>
  );
}
