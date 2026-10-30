// Add team library: the three screens. Paste a GitHub link (the one thing typed), pick the folder
// when the repo has several, then look at what will be added.
import { ArrowRight, BookOpen, Globe, LoaderCircle } from "lucide-react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { MarkdownProse, RelativeTime } from "@/components/common";
import { Button, Chip, Input, Skeleton } from "@/components/ui";
import { ChoiceList, KeyHint } from "@/features/add-work/parts";
import { cn } from "@/lib/cn";
import { ALIAS_MAX, EXAMPLE, excerptOf, explain, pagesLabel, rootOptions } from "./flow";
import { StepFrame } from "./parts";
import type { AddLibraryFlow } from "./useAddLibraryFlow";

/** The first screen: one field, then repos to start from. */
export function LinkScreen({ flow }: { flow: AddLibraryFlow }) {
  const { state, controller, suggestions } = flow;
  const looking = state.busy === "looking";
  const explained = state.failure ? explain(state.failure) : undefined;

  // Pasting into an empty field (or over all of it) takes the link and goes on at once.
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const field = e.currentTarget;
    const whole =
      field.value === "" ||
      (field.selectionStart === 0 && field.selectionEnd === field.value.length);
    const text = e.clipboardData.getData("text");
    if (!whole || !text.trim()) return;
    e.preventDefault();
    controller.paste(text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    controller.advance();
  };

  return (
    <StepFrame
      screen="link"
      index={flow.index}
      total={flow.screens.length}
      title="Paste a GitHub link"
      hint="A repo, a folder in it, or one page. A public repo is read straight from GitHub."
    >
      <Input
        data-autofocus=""
        autoFocus
        aria-label="GitHub link"
        aria-invalid={!!explained}
        aria-describedby="add-library-link-help"
        value={state.raw}
        readOnly={looking}
        onChange={(e) => controller.setRaw(e.target.value)}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        placeholder="github.com/acme/handbook"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="h-10 px-3 text-md"
      />
      <div id="add-library-link-help" className="flex min-w-0 flex-col gap-2 text-sm">
        {looking ? (
          <p role="status" className="m-0 flex items-center gap-2 text-fg-muted">
            <LoaderCircle
              aria-hidden
              size={14}
              strokeWidth={1.75}
              className="motion-safe:animate-spin"
            />
            Reading GitHub…
          </p>
        ) : explained ? (
          <>
            <p role="alert" className="m-0 text-danger">
              {explained.message}
            </p>
            {explained.hint && <p className="m-0 text-fg-muted">{explained.hint}</p>}
            {explained.actions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {explained.actions.includes("connect") && (
                  <Button size="sm" variant="secondary" onClick={() => controller.connectAgent()}>
                    Connect an agent to read private repos
                  </Button>
                )}
                {explained.actions.includes("retry") && (
                  <Button size="sm" variant="secondary" onClick={() => controller.advance()}>
                    Try again
                  </Button>
                )}
                {explained.actions.includes("example") && (
                  <Button size="sm" variant="secondary" onClick={() => controller.use(EXAMPLE.url)}>
                    Use the example library
                  </Button>
                )}
              </div>
            )}
            {state.note && (
              <p role="status" className="m-0 text-fg-muted">
                {state.note}
              </p>
            )}
          </>
        ) : (
          <p className="m-0 text-fg-faint">Press Enter to continue.</p>
        )}
      </div>

      {suggestions.length > 0 && (
        <section aria-label="Repos to start from" className="mt-1 flex flex-col gap-2">
          <h3 className="m-0 font-medium text-fg-faint text-xs">Or start from</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {suggestions.map((s) => (
              <li key={s.url}>
                <button
                  type="button"
                  data-wf="SuggestedRepo"
                  disabled={state.busy !== "idle"}
                  onClick={() => controller.use(s.url)}
                  className={cn(
                    "flex min-h-12 w-full min-w-0 cursor-default select-none items-center gap-3 rounded-md border border-border bg-bg px-3 py-2 text-left",
                    "transition-[background-color,border-color] duration-100 ease-wf hover:border-border-strong hover:bg-subtle",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  <BookOpen
                    aria-hidden
                    size={16}
                    strokeWidth={1.75}
                    className="shrink-0 text-fg-muted"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-fg text-md">{s.name}</span>
                    <span className="truncate text-fg-muted text-sm">
                      {s.hint} · <span className="font-mono text-xs">{s.repo}</span>
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    size={14}
                    strokeWidth={1.75}
                    className="shrink-0 text-fg-faint"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </StepFrame>
  );
}

/** The second screen, only when the repo has several folders that could be the library. */
export function RootScreen({ flow }: { flow: AddLibraryFlow }) {
  const { state, controller } = flow;
  const found = state.found;
  if (!found) return null;
  const title = "Which folder is the library?";
  const options = rootOptions(found.choices);
  return (
    <StepFrame
      screen="root"
      index={flow.index}
      total={flow.screens.length}
      title={title}
      hint={`${found.repo.owner}/${found.repo.repo} has more than one folder of pages. Pick the one to read.`}
    >
      <ChoiceList<string>
        label={title}
        value={state.picked}
        onPick={(root) => controller.pick(root)}
        onGo={(root) => {
          controller.pick(root);
          const choice = found.choices.find((c) => c.root === root);
          if (choice) void controller.choose(choice);
        }}
        options={options}
      />
      <KeyHint>Press 1 to {options.length} to pick, Enter to continue.</KeyHint>
    </StepFrame>
  );
}

/** The last screen: what the library is, the commit it is read at, its alias, and its first page. */
export function PreviewScreen({ flow }: { flow: AddLibraryFlow }) {
  const { state, controller } = flow;
  const { found, preview, choice } = state;
  if (!found || !choice) return null;
  const { repo } = found;
  const adding = state.busy === "adding";
  const excerpt = preview?.pageText ? excerptOf(preview.pageText) : "";
  const where = [
    `${repo.owner}/${repo.repo}`,
    repo.ref,
    choice.root ? `${choice.root}/` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const facts = preview
    ? [
        pagesLabel(preview.pages),
        preview.media > 0 ? `${preview.media} media ${preview.media === 1 ? "file" : "files"}` : "",
        preview.others > 0
          ? `${preview.others} other ${preview.others === 1 ? "file" : "files"}`
          : "",
      ].filter(Boolean)
    : [];
  const failed = state.failure ? explain(state.failure) : undefined;

  return (
    <StepFrame
      screen="preview"
      index={flow.index}
      total={flow.screens.length}
      title="Add this library?"
      hint="You read it here as a wiki. It stays read-only, and Open on GitHub is one click away."
    >
      <div
        data-wf="LibraryPreview"
        className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4"
      >
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {preview ? (
              <h3 className="m-0 truncate font-semibold text-fg text-lg">{preview.name}</h3>
            ) : (
              <Skeleton className="h-5 w-48" />
            )}
            {preview?.description && (
              <p className="m-0 text-fg-muted text-md leading-snug">{preview.description}</p>
            )}
          </div>
          <Chip tone="outline" icon={<Globe aria-hidden />} title="Anyone can read this repo">
            Public
          </Chip>
        </div>
        {preview ? (
          <p className="tabular m-0 text-fg-muted text-sm">{facts.join(" · ")}</p>
        ) : (
          <Skeleton className="h-3.5 w-56" />
        )}
        <p className="m-0 truncate font-mono text-fg-faint text-xs">{where}</p>

        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 border-border border-t pt-3 text-sm">
          <dt className="text-fg-faint">Last commit</dt>
          <dd className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-2 text-fg-muted">
            <code className="font-mono text-fg text-xs">{repo.commit.slice(0, 7)}</code>
            {repo.message && <span className="min-w-0 truncate text-fg">{repo.message}</span>}
            {repo.author && <span>by {repo.author}</span>}
            {repo.committedAt && <RelativeTime ts={repo.committedAt} long />}
          </dd>
          <dt className="text-fg-faint">Alias</dt>
          <dd className="m-0 flex min-w-0 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-2">
              {state.editingAlias ? (
                <Input
                  data-autofocus=""
                  autoFocus
                  aria-label="Alias"
                  aria-invalid={!!state.aliasError}
                  aria-describedby="add-library-alias-help"
                  value={state.alias}
                  maxLength={ALIAS_MAX + 8}
                  disabled={adding}
                  onChange={(e) => controller.setAlias(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    if (state.aliasError) return;
                    controller.editAlias(false);
                  }}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="h-7 w-56 font-mono text-sm"
                />
              ) : (
                <code className="min-w-0 truncate font-mono text-fg text-sm">{state.alias}</code>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={adding || (state.editingAlias && !!state.aliasError)}
                onClick={() => controller.editAlias(!state.editingAlias)}
              >
                {state.editingAlias ? "Done" : "Edit"}
              </Button>
            </span>
            <span
              id="add-library-alias-help"
              className={state.aliasError ? "text-danger" : "text-fg-faint"}
            >
              {state.aliasError ??
                `Used in links, like [[${state.alias || "alias"}:runbooks/rotate]].`}
            </span>
          </dd>
        </dl>
      </div>

      {flow.already && (
        <p role="note" className="m-0 text-fg-muted text-sm">
          This repo is already in your libraries as{" "}
          <code className="font-mono text-fg text-xs">{flow.already}</code>. Adding it again makes a
          second copy.
        </p>
      )}

      {failed && (
        <p role="alert" className="m-0 text-danger text-sm">
          {failed.message}
        </p>
      )}

      <section aria-label="First page" className="flex min-w-0 flex-col gap-2">
        <h3 className="m-0 font-medium text-fg-faint text-xs">
          First page{preview?.page ? ` · ${preview.page}` : ""}
        </h3>
        {!preview ? (
          <div role="status" aria-label="Reading the first page" className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ) : excerpt ? (
          <div
            data-wf="PreviewExcerpt"
            className="relative max-h-52 overflow-hidden rounded-md border border-border bg-subtle px-4 py-3 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
          >
            <MarkdownProse md={excerpt} compact />
          </div>
        ) : (
          <p className="m-0 text-fg-faint text-sm">This library has no pages to preview.</p>
        )}
      </section>
      <KeyHint>Press Enter to add it, Backspace to go back.</KeyHint>
    </StepFrame>
  );
}

/** The screen on show. */
export function LibraryScreen({ flow }: { flow: AddLibraryFlow }) {
  switch (flow.state.screen) {
    case "link":
      return <LinkScreen flow={flow} />;
    case "root":
      return <RootScreen flow={flow} />;
    case "preview":
      return <PreviewScreen flow={flow} />;
  }
}
