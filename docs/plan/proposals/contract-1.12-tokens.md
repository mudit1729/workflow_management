# Proposed changes to docs/plan/contract.md section 1.12 (design tokens)

For the user to approve. Nothing in `docs/plan/contract.md` was edited. The values below are what
`web/src/styles/tokens.css` ships now; the contract table is behind it. Each change has a reason, so you
can accept or reject them one by one.

## A. Rows of the main token table to change

| token | contract now (light / dark) | proposed (light / dark) | why |
|---|---|---|---|
| `--wf-text-faint` | #8E8E99 / #6E6E78 | **#6B6B76 / #8A8A94** | The old values fail WCAG AA for text (light 3.0:1 on `bg-subtle`, dark 3.8:1 on `bg`). Faint is still text (ids, counts, hints). New: 4.9:1 on `bg-subtle` and 4.6:1 on `bg-muted` in light; 5.6:1 on `bg` and 5.0:1 on `bg-muted` in dark. |
| `--wf-accent` | #5E6AD2 / #7C85E0 | **#5560C8** / #7C85E0 (dark unchanged) | 4.7:1 as text on `accent-subtle`, 5.4:1 white on the fill. The old light value was 4.1:1. |
| `--wf-accent-fg` | #FFFFFF / #FFFFFF | #FFFFFF / **#0F0F11** | White on the dark accent (#7C85E0) is 3.3:1. The page background on it is 5.7:1. |
| `--wf-status-*` (dark column) | "same hues, +8% lightness" | #B6B6BD, #85858E, #629BF8, #EA6C70, #A26DD0, #39C481, #B6B6BD (backlog, planned, in_progress, blocked, review, done, cancelled) | Replace the rule with the shipped values so dark has no guesswork. Light column is unchanged. |
| `--wf-hue-1…8` | "8 mid-chroma hues, chosen with the validator in section 6" | light: #2A78D6, #EB6834, #1BAF7A, #EDA100, #E87BA4, **#A8662F**, #6250D6, **#028A9B**; dark: #3987E5, #D95926, #199E70, #C98500, #D55181, **#A8662F**, #9085E9, **#0096AF** | Slot 6 is a sienna brown and slot 8 a teal, so neither can be mistaken for the status greens and reds or for `--wf-signal-danger`. Three slots sit below 3:1 on white, so a hue never appears without its @handle or group name next to it. |

## B. Rows to add to the main token table

| token | light | dark | use |
|---|---|---|---|
| `--wf-stale-text` | `color-mix(in srgb, var(--wf-signal-stale) 60%, var(--wf-text))` | same formula at 78% | Amber as readable text: stale ages, expired leases, lint warning counts. Tailwind class `text-stale-text`. The raw `--wf-signal-stale` stays for fills, dots and borders. |
| `--wf-success-text` | `color-mix(in srgb, var(--wf-status-done) 70%, var(--wf-text))` | same formula at 85% | Green as readable text (reviewed, verified). Class `text-success-text`. |
| `--wf-on-hue` | #FFFFFF | #FFFFFF | Text on a hue tile (author initials, bot glyph). Class `text-on-hue`. |
| `--wf-scrim` | rgb(0 0 0 / 0.20) | rgb(0 0 0 / 0.50) | The dim layer behind dialogs, the command palette and the phone nav. Class `bg-scrim`. |

## C. New "Other tokens" bullet: stacking

> - Stacking (named layers, never raw numbers in components): `--wf-z-raised` 10 (sticky heads and
>   overlays inside a panel), `--wf-z-overlay` 40 (sheets, the icon rail opened over the page, the phone
>   nav scrim), `--wf-z-dialog` 50 (dialogs, the command palette and their scrim), `--wf-z-popover` 60
>   (menus, popovers, hover cards: they open from dialogs, so they sit above), `--wf-z-tooltip` 70.
>   Tailwind classes `z-raised z-overlay z-dialog z-popover z-tooltip`.

## D. Edits to existing "Other tokens" bullets

- **Type:** add "Inter's contextual alternates are off (`font-feature-settings: "calt" 0`): with them on, an
  "x" between digits rendered as a multiplication sign, so the id `wf-3k9x2` read `wf-3k9×2`, and `->`
  and `:` between digits were rewritten. Stylistic sets `cv11`, `ss01`, `ss03` stay on."
- **Type:** add that inline code uses `--wf-code-size`, defaulting to `--wf-text-sm` (12 px); a container such
  as compact prose may set it to 11 px.
- **Motion:** change "`--wf-dur-1|2|3` = 100/150/200 ms" to also say: the live-update flash (`wf-flash`, a
  changed card fading from `--wf-accent-subtle` to transparent) uses `--wf-dur-2`, 150 ms. Reduced motion
  sets the three durations to 0 and also stops numeric `duration-*` utilities and enter/exit animations.
- **Layout:** add that `data-density="compact"` also rescales the space tokens to 2/3/6/10/12/16/20/28 px,
  `--wf-col-w` to 248 and `--wf-card-gap` to 4. The icon rail (52 px) is the rail between 768 and 1099 px
  of window width whatever the saved choice is (see UI_BUILD.md, nav).

## E. Not a token, worth one sentence in section 6 (UI)

The Library item and the Files editor: Library detail has three layout modes (docked, beside the list with
filter chips, own screen under 860 px) and edits a file inline; the Files view is a single screen under
720 px of page width. These are UI behaviors and live in `web/UI_BUILD.md`; the contract needs no change
unless you want them pinned there.
