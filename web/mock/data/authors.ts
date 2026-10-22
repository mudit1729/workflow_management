// authors.md of the dogfood workspace.
import type { Author } from "@/gen/types";

export function seedAuthors(): Author[] {
  return [
    {
      handle: "shruti",
      kind: "human",
      name: "Shruti Joshi",
      color: 1,
      lanes: ["web", "skills"],
      max_leases: 3,
    },
    {
      handle: "claude-opus",
      kind: "agent",
      name: "Claude Opus (coordinator)",
      runtime: "claude-code",
      model: "claude-opus-5-5",
      color: 7,
      lanes: [],
      max_leases: 6,
    },
    {
      handle: "codex",
      kind: "agent",
      name: "Codex",
      runtime: "codex",
      model: "gpt-5-codex",
      color: 2,
      lanes: ["server", "core"],
      max_leases: 3,
    },
    {
      handle: "claude-sonnet",
      kind: "agent",
      name: "Claude Sonnet",
      runtime: "claude-code",
      model: "claude-sonnet-5-5",
      color: 3,
      lanes: ["web"],
      max_leases: 3,
    },
    {
      handle: "cursor-bot",
      kind: "agent",
      name: "Cursor agent",
      runtime: "cursor",
      color: 4,
      lanes: ["web"],
      max_leases: 2,
    },
    {
      handle: "mudit",
      kind: "human",
      name: "Mudit",
      color: 5,
      lanes: ["core"],
      max_leases: 3,
    },
  ];
}
