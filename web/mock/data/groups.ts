// Groups of the dogfood workspace: `_group.md` files plus implicit folders.
//
//   issues/                 root (implicit, "Issues")
//     wf/                   g-wf001  wf
//       core/               g-core1  core
//       web/                g-web01  web
//       skills/             g-skl01  skills
//       build-v1/           issue wf-b1d7v (directly in wf)
//     platform/             g-plat1  platform
//       auth/               g-auth1  auth
//     docs/                 implicit (no _group.md)
import type { GroupSrc } from "../source";
import { hashId } from "../util";

export const ROOT_GROUP = `g-${hashId("issues")}`;
export const DOCS_GROUP = `g-${hashId("issues/docs")}`;

export function seedGroups(): GroupSrc[] {
  return [
    { id: ROOT_GROUP, title: "Issues", slug: "issues", order: 0, implicit: true },
    {
      id: "g-wf001",
      title: "wf",
      slug: "wf",
      parent: ROOT_GROUP,
      goal: "Build wf v1 and track the build in wf itself.",
      owner: "shruti",
      color: 7,
      order: 1,
      implicit: false,
      definition_of_done: [
        "Every criterion has evidence from `wf verify` or a named human check.",
        "The change has a `current_state.md` handoff with Next steps.",
      ],
    },
    {
      id: "g-core1",
      title: "core",
      slug: "core",
      parent: "g-wf001",
      goal: "Parse, index, lint and write the files safely.",
      owner: "mudit",
      color: 2,
      order: 1,
      implicit: false,
      definition_of_done: ["`cargo test --workspace` passes.", "The golden fixtures are updated."],
    },
    {
      id: "g-web01",
      title: "web",
      slug: "web",
      parent: "g-wf001",
      goal: "Give humans a calm, live view of every issue and every open request.",
      owner: "shruti",
      color: 1,
      order: 2,
      implicit: false,
      definition_of_done: [
        "The change works in the light theme and in the dark theme.",
        "A Playwright test covers the new behavior.",
      ],
    },
    {
      id: "g-skl01",
      title: "skills",
      slug: "skills",
      parent: "g-wf001",
      goal: "Teach agents the file format through skills, hooks and the flowchart.",
      owner: "shruti",
      color: 3,
      order: 3,
      implicit: false,
      definition_of_done: ["`wf skills lint` reports zero findings at warn or above."],
    },
    {
      id: "g-plat1",
      title: "platform",
      slug: "platform",
      parent: ROOT_GROUP,
      goal: "Keep the daemon local, safe and boring to run.",
      owner: "mudit",
      color: 4,
      order: 2,
      implicit: false,
    },
    {
      id: "g-auth1",
      title: "auth",
      slug: "auth",
      parent: "g-plat1",
      goal: "Decide who may write through the daemon.",
      owner: "mudit",
      color: 8,
      order: 1,
      implicit: false,
    },
    { id: DOCS_GROUP, title: "docs", slug: "docs", parent: ROOT_GROUP, order: 3, implicit: true },
  ];
}
