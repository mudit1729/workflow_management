# wf Rust stack research report (2026-10-22)

I checked the toolchain locally: rustc 1.94.0 and cargo 1.94.0. That is a few releases behind current stable, but it is at or above every MSRV below (the highest is 1.89, for comrak and serde-saphyr). Versions come from the crates.io API today. The key claims were verified with a probe crate on this Mac: `/private/tmp/claude-501/-Users-muditj-Desktop-Projects-workflow/0570f2f9-8353-4a5e-90a4-5684744c13fd/scratchpad/probe`.

## Version table

| Area | Pick | Version | Note |
|---|---|---|---|
| Watch | notify + notify-debouncer-full | 8.2.0 + 0.7.0 | 9.0.0-rc.6 + 0.8.0-rc.2 work better on macOS (§1) |
| Markdown | comrak (`default-features=false`) | 0.57.0 | Released 10-21; pin `0.57` |
| Markdown (alternative) | pulldown-cmark | 0.13.5 | |
| YAML | serde-saphyr | 2.0.0 | 1.3.0 if you're wary of the new major |
| HTTP | axum / tokio / tower-http | 0.8.9 / 1.54.1 / 0.7.1 | |
| Embed SPA | rust-embed | 8.13.0 | include_dir 0.7.4 hasn't changed since 2024-06 |
| Open browser | open | 5.4.x | 5.4.5 came out today; 5.4.4 is fine |
| Search | own BM25 (or bm25 2.3.2) + nucleo-matcher | — / 0.3.1 | tantivy 0.27.0 deferred |
| CLI | clap (derive) + clap_complete | 4.6.7 / 4.6.11 | |
| Templates | minijinja | 3.0.2 | 3.0.0 is from 10-08; 2.24.0 is the fallback |
| Time | jiff | 0.2.38 | |
| IDs | ulid / slug | 3.0.0 / 0.1.6 | |
| Hash | blake3 | 1.8.7 | |
| Atomic write | tempfile | 3.27.0 | |
| Locks | `std::fs::File::lock` | std ≥1.89 | fs4 1.1.0 and fd-lock 4.0.4 not needed |
| Walk | ignore | 0.4.33 | |
| Snapshot | arc-swap | 1.9.3 | |
| TS types | ts-rs | 12.0.1 | specta is still 2.0.0-rc.27 |
| Infra | serde 1.0.229, serde_json 1.0.154, thiserror 2.0.21, anyhow 1.0.104, tracing 0.1.44, tracing-subscriber 0.3.23, insta 1.49.0, similar 3.2.0 | | |
| Dev tools | Vite 8.3.5, bacon 3.26.0, watchexec-cli 2.8.0 | | |

## 1. File watching

Probe on FSEvents with a 300 ms debounce:

| Scenario | notify 8.2 / deb 0.7 | notify 9-rc.6 / deb 0.8-rc.2 |
|---|---|---|
| Editor atomic save (temp file, then rename) | Create + `Name(Any)` on both files + Data; rename not paired | `Name(Any)` on both |
| 50 appends | Merged into 1 event, but reported as `Create(File)` | 1 `Data(Content)` |
| `mv sub sub2` | Only `Create(Folder) sub2`; **no event for the old path** | `Name(Both) [sub, sub2]` |
| `rm -rf g1` | Only `Metadata g1`; **no Remove events** | `Remove(Folder) g1` |
| Startup | Replays a stale Remove/Create of the root | Same |

**Design: treat events as "this path is dirty" hints, never as facts.**
- For each debounced batch, map every path to its nearest existing ancestor folder.
- Rescan that subtree with `ignore`, then diff against the index by path and blake3 hash. This covers missing removes and unpaired renames.
- Do a full rescan on `need_rescan()`, on watcher errors, and at startup. Register the watch first, then do the initial scan.
- With this design the notify version doesn't matter. Ship on 8.2/0.7 and move to 9.0 once it's stable (rc.6 is 5 days old).
- Call `canonicalize()` on the root, because FSEvents reports `/private/...` paths.
- Ignore `.git/`, `.wf/`, `node_modules/`, `.DS_Store`, `*.swp`, `*~`, `.#*`, vim's `4913` probe file, and `.wf-tmp-*`.
- Debounce at about 250 ms.
- Give issues a stable `id:` (a ULID in goal.md frontmatter), so a renamed folder keeps its identity and its URL.

## 2. Markdown: use comrak

Verified in comrak 0.57:
- **Frontmatter** comes out as a `FrontMatter` node with sourcepos `1:1-5:3`, delimiters included.
- **Task items** expose `symbol_sourcepos`, the exact position of the checkbox character. Line and column are byte-based by default, so turning that into a byte offset is a line-start table lookup. It mapped correctly to `" "` and `"x"`, even after multibyte text.
- **Full info string** for fenced code: `"archify workflow"`.
- **GFM**: tables, strikethrough, and bare-URL autolinks all produce nodes.
- **Rendering**: HTML output can carry `data-sourcepos`. Raw HTML and dangerous links are scrubbed unless you turn on `unsafe_`, which matters because agents write content.
- **Costs**: the API is arena/RefCell based, and minor versions ship often (MSRV 1.89). Turn off default features, which pull in syntect and the CLI.

pulldown-cmark 0.13.5 is the fallback. It is fast and `into_offset_iter` gives the exact `[ ]` range (verified). Its weaknesses: you get an event stream instead of a tree, so building sections takes more work, and bare URLs stay plain text (verified).

markdown-rs 1.0.0 gives a nice mdast with serde JSON. But it has had no release since 2025-04, and it exposes the position of the whole list item only, not the checkbox. Not recommended.

**What the server sends the client:** a typed JSON view model, with prose pre-rendered to safe HTML fragments by comrak. The frontend never sees comrak's AST.
- Issue fields: `{id, path, group_path, frontmatter, status, progress, drift[], lint[{line,col,severity,msg}]}`.
- Typed sections:
  - criteria: `[{html, checked, ref}]`
  - plan: phases → steps
  - changes: timeline entries `{ts, author, title_html, body_html}`
  - decisions: ADR fields
  - learnings: `{…, promoted}`
  - diagrams: `{type, hash, url, errors}`
- Every editable element carries an edit reference: `ref = {file, rev: blake3(file), span:[start,end], expect:"[ ]"}`.
- Raw markdown is served separately at `GET /api/files/{*path}` for the "source" view.

Generate the TS types with ts-rs into `web/src/gen`.

## 3. YAML: use serde-saphyr

- **serde_yaml**: officially `+deprecated`.
- **serde_yml**: now a deprecated shim, after the soundness concerns. Avoid.
- **serde_norway** 0.9.42: a serde_yaml fork on unsafe-libyaml; no release since 2024-12.
- **yaml-rust2 0.13 and saphyr 0.2.2**: DOM-level only, no serde.
- **serde-saphyr 2.0.0**: panic-free, `unsafe` forbidden, has budgets against huge input, and reports errors with line/column (verified: `line 1 column 9: expected string scalar`), which feeds the lint panel directly.

**Its `Spanned<T>` gives the byte offset and length of a value.** The probe parsed `status: in_progress # keep me`, found bytes 51..62, spliced in `done`, and the comment, quoting, key order and other keys stayed byte-for-byte the same.

Approach for editing a frontmatter key:
- Deserialize the editable keys as `Spanned<…>`. Spanned does not work inside `#[serde(flatten)]`, so keep extra keys in a separate flattened map.
- Add comrak's frontmatter offset (the `---\n` prefix) to get the absolute position in the file.
- Splice only the value's bytes. Quote the value if needed; status values come from an enum, so they're safe.
- If the key is missing, insert `key: value` on its own line before the closing `---`.
- For block values like lists, replace the key's whole line range.
- Never re-serialize the frontmatter.

## 4. Web

- **axum 0.8**: path syntax is `/{id}` and `/{*rest}`.
- **SSE**: `Sse<Stream>` fed from a `tokio::sync::broadcast` through `BroadcastStream`, plus `KeepAlive` (verified by streaming with curl).
  - On connect, send `event: snapshot`. After that, send `event: delta {rev, upserts, removes}`.
  - When a slow client lags the broadcast channel, it gets `Lagged`; answer with `event: resync`.
- **tower-http 0.7**:
  - `CorsLayer` only if the dev frontend calls the API directly.
  - `TraceLayer` for logging.
  - `CompressionLayer` is safe here: its default predicate skips `text/event-stream` (checked in the source).
- **Embedding the SPA**: rust-embed with `interpolate-folder-path`, `mime-guess` and `include-exclude`, plus a small fallback handler that serves the asset or else `index.html`. Verified: `/issues/abc` returned the SPA, so deep links work.
  - Debug builds read `web/dist` from disk, so frontend rebuilds don't need a recompile.
  - Send `immutable` cache headers for hashed assets and `no-cache` for index.html.
- **Security and launch**:
  - Bind to 127.0.0.1 only.
  - Check `Host` and `Origin` on every POST, so other websites can't write to the board through DNS rebinding or CSRF.
  - `wf serve --open` uses `open::that`.
  - Write `.wf/daemon.json` with the port and pid.
- **archify**:
  - Run it through `tokio::process` with a concurrency limit of 2 (semaphore): `archify validate <type> in.json --json`, then `render`.
  - Cache rendered HTML at `.wf/cache/archify/<blake3(type+json+archify-version)>.html`.
  - Show diagrams in a sandboxed iframe. Validation errors go into the issue's diagnostics.

## 5. Library search

For a few thousand documents, keep everything in memory and rebuild per document when it changes.
- **Ranked search:** BM25 with field boosts (title ×3, tags ×2, body). Writing it yourself is about 150 lines; the `bm25` crate also works.
- **Quick-open / cmd-K:** nucleo-matcher (Helix's fuzzy matcher) over titles and paths.
- **CLI:** `wf search --json` builds the same index on its own, without needing the daemon. Parsing a few thousand files takes well under a second.
- **Later:** put search behind a `SearchIndex` trait so tantivy 0.27 can replace it. Switch only above roughly 50k documents, or if you need phrase queries, snippets or a persistent index. It costs a heavy compile and an index directory to manage.

## 6. CLI, templates, time, IDs

- **CLI**: clap derive with subcommands `serve | new issue|group | append changes|decisions|learnings --author @x | check | lint | search | promote | skills install | status`, plus clap_complete for shell completion.
- **Templates**: minijinja, with templates embedded via `include_str!` and overridable from `<root>/.wf/templates/`. `wf new` creates files with `create_new`, so it never overwrites.
- **Time**: jiff. RFC 3339 timestamps with offset in entry headings, `Zoned::now()`, serde support. Avoid chrono unless a dependency forces it.
- **IDs**: folder name is the slug of the title. Frontmatter `id:` is a ULID and is used in URLs `/i/{id}`. Entries need no id; they are addressed by (file, span, rev).

## 7. Safe writes

1. **Locks**: lock a sidecar file at `.wf/locks/<blake3(relpath)>.lock` with `std::fs::File::lock` (verified on 1.94: a second handle's `try_lock` fails while the first holds it). Don't lock the target itself, because the atomic rename swaps the inode. Both the daemon and the CLI take the same lock.
2. **Write-back protocol**: `POST /api/ops {file, base_rev, op}` with these steps:
   1. Take the lock and read the file.
   2. If the hash differs from `base_rev`, re-parse and find the target again by anchor (task text plus position, or the key name).
   3. Check the `expect` bytes at the span.
   4. Splice, then write atomically.
   5. If the target is ambiguous, return 409 with a fresh view.
3. **Atomic write**: `NamedTempFile::with_prefix_in(".wf-tmp-", dir)`, write, `sync_all`, copy the original file's permissions (tempfile defaults to 0600), `persist`, then fsync the folder.
4. **Appends**: `wf append` goes lock → read → append → atomic write. Advisory locks only coordinate wf processes. Editors and agents' own Edit tools ignore them, so the hash check and git history are the backstop. The skills should tell agents to use `wf append` for entries.
5. **Echo suppression by content hash**: after a write, update the index right away from the bytes just written and push the SSE update. When the watcher event arrives, its hash already matches the index, so nothing happens. No timing windows; this also absorbs FSEvents replays.
6. **Tests**: insta snapshots of parse output, plus a property test that a splice leaves every byte outside the span unchanged.

## 8. Workspace layout and dev loop

```
Cargo.toml          # [workspace] resolver="3", edition 2024, rust-version 1.89, [workspace.dependencies]
rust-toolchain.toml
crates/wf-core      # model, parse, edit (sync, no tokio): comrak, serde-saphyr, jiff, blake3, ts-rs
crates/wf-engine    # scan, watch, index (ArcSwap<Snapshot>), group rollups, drift, search, archify cache
crates/wf-server    # axum routes, SSE, ops endpoint, rust-embed SPA
crates/wf           # bin: clap CLI, minijinja templates, open
web/                # Vite + TS SPA, built to web/dist (gen/ = ts-rs output)
templates/  plugins/{workflow,library,agent-execution}/  .claude-plugin/marketplace.json  justfile
```

**Dev:**
- `just dev` runs `bacon run -- serve --dev --port 7777` (or `watchexec -r -e rs`) next to `pnpm -C web dev`.
- Vite's `server.proxy: {'/api': 'http://127.0.0.1:7777'}` makes requests same-origin and passes SSE through, so CORS isn't needed.
- `--dev` turns off SPA serving and loosens the Origin check to allow :5173.

**Release:** `pnpm -C web build && cargo build --release`.
- Keep pnpm out of build.rs. `build.rs` only creates a placeholder `web/dist/index.html` so rust-embed compiles on a fresh checkout.
- cargo-dist 0.32.0 is optional, for distributing the binary.

## Assumptions to confirm

- Ship on stable notify 8.2, not the 9.0 release candidate.
- Use serde-saphyr 2.0.0 and minijinja 3.0.x, both new majors released this month.
- Default port 7777.
- The daemon calls archify through node at `~/.claude/skills/archify`, overridable with `WF_ARCHIFY`.
- Raw HTML is never shown in the UI; it is scrubbed.
- Agents write entries through `wf append`; editing files directly works, but is only protected by the hash check.
- The CLI runs on its own and does not need the daemon.