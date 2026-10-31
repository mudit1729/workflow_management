// The first visit to Personal (spec 3): the library lives in a private repo of the person's own.
// Two buttons, in the user's order: create `github.com/<you>/wf-library` (private), or use a repo
// that already exists, which is the one place that asks for a pasted link. In the product the
// connected agent's bridge does it (`gh repo create --private`, or a clone); the prototype shows
// the screen, simulates the answer and says so.
import { Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Chip, Input } from "@/components/ui";
import { useMe } from "@/lib/api";
import { parseRepo, usePersonalSetup } from "./setup";
import { usePersonalAgent } from "./summarize";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function PersonalSetup() {
  const me = useMe() || "you";
  const agent = usePersonalAgent();
  const setUp = usePersonalSetup((s) => s.setUp);
  const [existing, setExisting] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<"create" | "use">();
  const repo = parseRepo(link);
  const target = `github.com/${me}/wf-library`;

  async function run(kind: "create" | "use", name: string) {
    setBusy(kind);
    await sleep(900);
    setBusy(undefined);
    setUp(name);
    toast.success(kind === "create" ? "Your library is ready" : "Your library is connected", {
      description: agent
        ? name
        : "Prototype: no repository was created or read. The library you see is the fixture.",
    });
  }

  return (
    <section
      data-wf="PersonalSetup"
      aria-labelledby="personal-setup"
      className="mx-auto flex w-full max-w-[460px] flex-col gap-5 py-6"
    >
      <header className="flex flex-col gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-muted text-fg-muted">
          <Lock aria-hidden size={16} strokeWidth={1.75} />
        </span>
        <h1
          id="personal-setup"
          className="m-0 font-semibold text-[26px] text-fg leading-tight tracking-[-0.02em]"
        >
          Set up your personal library
        </h1>
        <p className="m-0 text-fg-muted text-md leading-relaxed">
          Your research topics, the codebases you work in and a summary of your work live in a
          private GitHub repo of yours. Only you see it. It is markdown, so any agent can read and
          keep it.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          disabled={busy !== undefined}
          onClick={() => void run("create", `${me}/wf-library`)}
        >
          {busy === "create" ? "Creating…" : `Create ${target} (private)`}
        </Button>
        {!existing ? (
          <Button
            variant="secondary"
            disabled={busy !== undefined}
            onClick={() => setExisting(true)}
          >
            Use a repo I already have
          </Button>
        ) : (
          <form
            data-wf="UseRepoForm"
            className="flex flex-col gap-2 rounded-md border border-border bg-subtle p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (repo) void run("use", repo);
            }}
          >
            <label htmlFor="personal-repo" className="font-medium text-fg-muted text-sm">
              Paste its GitHub link
            </label>
            <Input
              id="personal-repo"
              autoFocus
              placeholder="github.com/you/notes"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              aria-invalid={link.trim() !== "" && !repo}
            />
            {link.trim() !== "" && !repo && (
              <p role="alert" className="m-0 text-danger text-sm">
                That is not a GitHub repo link. Use https://github.com/owner/repo or owner/repo.
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!repo || busy !== undefined}
              >
                {busy === "use" ? "Connecting…" : "Use this repo"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setExisting(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>

      <p className="m-0 flex flex-wrap items-center gap-2 text-fg-faint text-sm leading-snug">
        {agent ? (
          "Your connected agent does this with your own git credentials."
        ) : (
          <>
            <Chip tone="outline">Prototype</Chip>
            No agent is connected, so this only simulates the setup. With one connected, its bridge
            creates the repo or clones yours.
          </>
        )}
      </p>
    </section>
  );
}
