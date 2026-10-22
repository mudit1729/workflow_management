export const meta = {
  name: 'wf-ui-review-polish',
  description: 'Design review of the wf UI prototype through 3 lenses, then parallel fixes per area, then a verify pass',
  phases: [
    { title: 'Review', detail: 'contract conformance, visual design, interaction + a11y' },
    { title: 'Fix', detail: 'one fixer per owning area, disjoint files' },
    { title: 'Verify', detail: 'typecheck, lint, build, screenshot sweep, regressions' },
  ],
}

// args: { smoke_punch_list: [...], user_feedback: [string], notes: string }
const ROOT = '/Users/muditj/Desktop/Projects/workflow'
const WEB = ROOT + '/web'
const A = args || {}

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          element: { type: 'string', description: 'data-wf component name' },
          area: { type: 'string', enum: ['shell', 'board', 'issue-frame', 'issue-now-goal', 'issue-plan', 'issue-log', 'diagram', 'library-inbox', 'ui-common', 'data', 'kit'] },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          issue: { type: 'string' },
          fix: { type: 'string', description: 'concrete change to make' },
          screenshot: { type: 'string' },
        },
        required: ['element', 'area', 'severity', 'issue', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const AREAS = {
  'shell': 'web/src/main.tsx, web/src/app/**',
  'board': 'web/src/features/board/**',
  'issue-frame': 'web/src/features/issue/{index.ts,IssueDrawer,IssuePage,IssueView,IssueHeader,IssueSkeleton,tabs/FilesTab,DocsList,DocView,LintPanel}*',
  'issue-now-goal': 'web/src/features/issue/{tabs/NowTab,tabs/GoalTab,StateSnapshot,NeedsYouList,CriteriaChecklist,CoverageStrip}*',
  'issue-plan': 'web/src/features/issue/{tabs/PlanTab,PlanLanes,PlanList,TaskPill,TaskDetail}*',
  'issue-log': 'web/src/features/issue/{tabs/LogTab,ChangesTimeline,DecisionCards,LearningCards}*',
  'diagram': 'web/src/features/diagram/**, web/mock/diagrams.ts, web/public/diagrams/**',
  'library-inbox': 'web/src/features/library/**, web/src/features/inbox/**',
  'ui-common': 'web/src/components/**',
  'data': 'web/mock/** (except diagrams.ts), web/src/lib/api/**, web/src/lib/live/**',
  'kit': 'web/src/features/kit/**',
}

const SHOTS = `Take screenshots with \`node ${WEB}/scripts/shot.mjs <route> <out.png> [--w W] [--h H] [--theme dark] [--density compact] [--click "<selector>"]… [--hover "<selector>"] [--full]\` against the running dev server (http://localhost:5177; never start or stop it). Save PNGs in your scratchpad and Read each one. Routes: /w, /w?swim=none, /w?group=g-web01, /w/i/wf-3k9x2?tab=now|goal|plan|log|files (and &log=decisions|learnings), /i/wf-3k9x2, /w/i/wf-7yq2m?tab=goal, /inbox, /lib, /lib/lib-4tz7c, /lib?tab=glossary, /kit. Widths: 1440 (drawer overlays), 1680 (drawer docks), 1200, 390×844 (mobile). Light and dark.`

const CONTEXT = `You review the \`wf\` dashboard UI prototype in ${WEB} (React on mock data). Read ${WEB}/UI_BUILD.md (the build contract, with the module/area map) and the product contract ${ROOT}/docs/plan/contract.md §1.6, §1.10–1.12 and Part 3 "§6 Frontend and UI". The user is a product owner who chose a "calm & precise, Linear-like, minimal but thoughtful" style and will critique element by element. Elements are named by their data-wf attribute.

Known issues from the smoke pass (do not re-report unless still present): ${JSON.stringify(A.smoke_punch_list || [])}
User feedback so far (highest priority — make sure each item becomes a finding with a concrete fix): ${JSON.stringify(A.user_feedback || [])}
${A.notes || ''}

${SHOTS}

Report only real, specific problems with concrete fixes (what to change, in which element, to what). Assign each to the area that owns the file (area map in UI_BUILD.md: shell, board, issue-frame, issue-now-goal, issue-plan, issue-log, diagram, library-inbox, ui-common, data, kit). Severity high = broken or clearly wrong; medium = noticeably off; low = polish. Do not edit files.`

const LENSES = [
  { key: 'conformance', prompt: `Lens: CONTRACT CONFORMANCE. Walk Part 3 §6 and §1.11 line by line and check each requirement in the running UI: viewport lock (no page scroll), drawer docks at ≥1600 and overlays below, mobile full page, 6 columns with Backlog/Done folding to 36 px rails, cancelled behind show, virtualization, swimlanes per child group with cross-lane drops disabled, card anatomy (title clamp, group path, 14 px ring, chips only when present, hover footer "3/8 · 2 ready" + last activity), done gate dialog, 409 rollback toast, StateSnapshot sections and order, CriteriaChecklist (solid verified / hatched claimed, EARS keywords small caps, verify/evidence chips, CoverageStrip), PlanLanes (lanes × dependency levels, edges only on hover/selection, Ready highlight, PlanList toggle), ChangesTimeline (day groups, sticky headers, author hue dots, agent/human glyphs, kind glyphs, failure red, filters), DecisionCards (decision first, rejected collapsed, superseded folded), LearningCards (promote / in library), ArchifyCard (clamp height, lazy, dialog, invalid + unavailable states), DocsList/DocView, LintPanel, live updates (fade, notable-only toasts, tab title count), keyboard map, theme pre-paint. Use the DevPanel (window.__wf controls) to trigger live events and a conflict.` },
  { key: 'visual', prompt: `Lens: VISUAL DESIGN QUALITY. Judge like a senior product designer at Linear: spacing rhythm on the 4 px grid, alignment of baselines and edges across sibling rows/cards, typographic hierarchy (13 px base, weights 400/500/600 only), color discipline (neutral grays + one accent; color only for status/author/group; no stray colors), contrast in dark mode, density (comfy and compact), consistency of the same element across screens (chips, pills, avatars, headers, section labels), icon sizes and stroke, hover/selected states, empty states, truncation, and anything that looks unfinished, cramped, noisy or generic. Compare the drawer with the static mockup at http://localhost:5177/mockups/early-look.html (the user has seen it) and flag regressions in calm/precision.` },
  { key: 'interaction', prompt: `Lens: INTERACTION + ACCESSIBILITY + STATES. Exercise the UI with Playwright clicks/keys (write a small script in your scratchpad using @playwright/test from ${WEB}/node_modules if shot.mjs is not enough): open/close drawer, tab switching (1–5), j/k/h/l/Enter/o/s on the board, ⌘K palette and its actions, ? shortcuts, n new issue (create one), status changes (legal, illegal → Move anyway, done gate), criterion toggle, step toggle, answer a needs-you request (approval and free text), promote a learning, approve a library draft, inbox tabs, group tree keyboard, theme + density toggles, DevPanel controls (play event, conflict → toast + rollback, archify unavailable, reconnecting badge). Check focus-visible rings, aria labels on icon buttons, roles (tree, tabs, list), keyboard reachability, loading/empty/error states, and mobile 390 px usability. Report broken behaviors with exact repro steps.` },
]

phase('Review')
const reviews = await parallel(LENSES.map(l => () =>
  agent(CONTEXT + '\n\n' + l.prompt, { label: 'review:' + l.key, phase: 'Review', schema: FINDINGS })))

// Barrier is needed: dedupe across lenses, then group by owning area.
const all = reviews.filter(Boolean).flatMap(r => r.findings)
const seen = new Set()
const deduped = all.filter(f => {
  const k = (f.element + '|' + f.issue).toLowerCase().replace(/\s+/g, ' ').slice(0, 140)
  if (seen.has(k)) return false
  seen.add(k)
  return true
})
const byArea = {}
for (const f of deduped) (byArea[f.area] = byArea[f.area] || []).push(f)
log(`Review: ${all.length} findings, ${deduped.length} after dedupe, across ${Object.keys(byArea).length} areas`)

phase('Fix')
const FIXED = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'array', items: { type: 'string' }, description: 'findings not fixed, with reason' },
    needs_other_area: { type: 'array', items: { type: 'string' } },
  },
  required: ['fixed', 'skipped', 'needs_other_area'],
}
const fixes = await parallel(Object.entries(byArea).map(([area, items]) => () =>
  agent(`You are the **${area}** fixer for the wf dashboard UI prototype in ${WEB}. Read ${WEB}/UI_BUILD.md first. You own ONLY: ${AREAS[area] || area}. Other fixers edit the other areas at the same time — never touch their files; if a finding needs a change outside your area, list it in needs_other_area.

Fix these review findings (highest severity first; user feedback items are top priority). Keep the established style and APIs; do not change exported props unless a finding requires it (then keep backward compatibility).
${JSON.stringify(items, null, 1)}

After fixing: screenshot the affected routes with \`node ${WEB}/scripts/shot.mjs <route> <png> [--w 1680] [--theme dark] …\` (dev server already at :5177; outputs to your scratchpad) and Read them to confirm each fix. Then \`cd ${WEB} && pnpm -s typecheck 2>&1 | grep -E "<your paths>"\` prints nothing and \`pnpm -s exec biome check --write <your paths> && pnpm -s exec biome check <your paths>\` is clean.`,
    { label: 'fix:' + area, phase: 'Fix', schema: FIXED }).then(r => r ? { area, ...r } : { area, failed: true })))

phase('Verify')
const VERIFY = {
  type: 'object',
  properties: {
    typecheck_clean: { type: 'boolean' }, biome_clean: { type: 'boolean' }, build_ok: { type: 'boolean' },
    fixed: { type: 'array', items: { type: 'string' } },
    remaining: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' } },
  },
  required: ['typecheck_clean', 'biome_clean', 'build_ok', 'fixed', 'remaining', 'screenshots'],
}
const verify = await agent(`You are the final verifier for the wf dashboard UI prototype in ${WEB}. Parallel fixers just changed many files. Their reports: ${JSON.stringify(fixes)}.
1. \`cd ${WEB} && pnpm -s typecheck\`, \`pnpm -s exec biome check --write src mock && pnpm -s exec biome check src mock\`, \`pnpm -s build\` — make all three clean (you may edit any file).
2. Apply the needs_other_area items from the fixer reports.
3. ${SHOTS} Do a final sweep of every route in light and dark at 1440 and 1680, plus 390 mobile for /w and /i/wf-3k9x2. Fix regressions and runtime errors.
4. Save the best final screenshots for the user to ${ROOT}/docs/plan/mockups/shots/<name>.png (board-light, board-dark, drawer-now, drawer-goal, drawer-plan, drawer-log, page-3col, inbox, library, kit) and list their paths.`, { label: 'verify', phase: 'Verify', schema: VERIFY })

return { reviews: deduped, fixes, verify }
