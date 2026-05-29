# Plan: Git gutters + Reveal-in-Source (from notemd)

Two features adapted from the **`jes-bz/notemd`** fork, reworked for our
`CustomTextEditorProvider` architecture (Vditor 3.11.2).

Both rely on the same hard sub-problem: **mapping a WYSIWYG/IR DOM position back
to a line/offset in the Markdown source**. The DOM is not the source (`**bold**`
renders as `<strong>bold</strong>` — no asterisks), so the mapping is:
- **exact for tables** (count `|` pipes per row),
- **approximate for prose** (locate the block's text in the source, then a
  proportional estimate within it).

Read the "Shared mapping" section once; both features depend on it.

---

## A. Git gutters — change markers vs. git HEAD

Shows added/modified bars next to blocks, like VS Code's editor gutter, but for the
WYSIWYG view. The diff itself is **exact**; only the on-screen placement is block-level.

### How notemd does it

**Extension side** (`extension.ts`):
- `getHeadContent(fsPath)` — uses the built-in **`vscode.git` extension API**
  (`getExtension('vscode.git').exports.getAPI(1)`), finds the repo whose root
  contains the file, and calls `repo.show('HEAD', relativePath)` to get the
  committed version. Returns `null` if there's no git/repo (feature self-disables).
- `computeDiffChanges(head, current)` — runs `diffLines` from the **`diff`** npm
  package, walks the parts tracking `currentLine`:
  - `added` part → `{ startLine, endLine, type: 'added' }`
  - `removed` part → emits a `'modified'` marker at the preceding line (removed
    lines don't exist in the current doc, so they're attributed to their neighbor)
  - unchanged → just advance the line counter
- `computeDiffInfo` — guards on `MAX_DIFF_CONTENT_SIZE` (1 MB), then computes.
- `createDiffScheduler(webview, fsPath)` — returns a **300 ms debounced** function
  that skips if content is unchanged, then posts `{ command: 'diff-info', changes }`.
  Called on every content change.

**Webview side** (`main.ts`, `renderDiffMarkers`):
- `findEditorElement()` — the active Vditor mode element
  (`vditor.vditor[currentMode].element`), or any `[contenteditable=true]` with children.
- For each block element, maps DOM → source lines (see "Shared mapping"): a
  `BLOCK_SAMPLE`-char text sample + `md.indexOf(sample)` → the block's start line and
  line span.
- For each block, find overlapping `changes`; if several overlap, pick by priority
  `removed(3) > modified(2) > added(1)`.
- Render: an absolutely-positioned `<div class="notemd-diff-marker notemd-diff-{type}">`
  at `block.offsetTop` with `block.offsetHeight`, appended into the editor element.
  So the "gutter" is a **DOM overlay bar per block**, not a real VS Code gutter.
- `clearDiffMarkers()` before each re-render; `pendingDiffChanges` stashes changes if
  the editor isn't ready yet; cleared on `init`.

### Port to our fork

**Extension (`src/extension.ts`):**
1. Add `diff` to runtime `dependencies`.
2. Port `getHeadContent` / `computeDiffChanges` / `computeDiffInfo` (architecture-agnostic).
3. Reuse our existing debounce infra: in the same place we drive `schedulePostUpdate`
   / on `onDidChangeTextDocument`, call a diff scheduler and `postMessage('diff-info')`.
   We already have `lastSyncedContent` to skip redundant recomputes.
4. Self-disable cleanly when `getHeadContent` returns null (non-git workspaces).

**Webview (`media-src/src/main.ts` + `main.css`):**
5. Port `renderDiffMarkers` + `findEditorElement`; rename `notemd-diff-*` → our prefix
   (e.g. `me-diff-*`). Add CSS: editor container `position: relative`, markers as a
   left-edge colored bar (`position:absolute; left:0; width:3px`) themed via
   `--vscode-editorGutter-{added,modified}Background`.
6. Handle `diff-info` in the `message` listener; re-render the markers on:
   content `update`, **mode switch** (IR/WYSIWYG/SV have different DOM — markers must
   be recomputed), and window resize. Clear on `init`.

**Risks / caveats**
- Placement is **block-level**, mapped via the approximate DOM→source heuristic — not
  per-line precise. Good enough for "this paragraph changed", not for char-level.
- Must re-render on mode switch and layout changes, or markers drift. This is the main
  maintenance cost.
- Vditor 3.11: mode element access is `vditor.vditor[mode].element` — same pattern we
  already use in `custom-renderer.ts` (`(vditor as any).vditor`), so it should hold.
- Adds a runtime dependency (`diff`). Small, well-maintained.

---

## B. Reveal-in-Source (jump to the cursor's line in the text editor)

Command that opens the underlying `.md` in a normal text editor **beside** the WYSIWYG
view and selects the line the cursor is currently on. A round-trip extension ↔ webview.

### How notemd does it

**Extension side** (`extension.ts`, `revealInSource`):
1. Finds the active webview + its `document`.
2. Posts `{ command: 'get-cursor-offset' }` and awaits a `cursor-offset` reply, wrapped
   in a `Promise` with a **1 s timeout** (no reply → `offset = -1` → abort). The
   listener self-disposes.
3. Maps offset → line: `text.substring(0, offset).split('\n').length - 1`.
4. Opens the doc with `showTextDocument({ preview:false, viewColumn: Beside })`, sets
   the selection to the whole line and `revealRange(..., InCenter)`.

**Webview side** (`main.ts`, `getCursorTextOffset`):
1. Reads `window.getSelection().anchorNode` + `anchorOffset` (the DOM caret).
2. Walks up the DOM. **If inside a table cell** (`TD`/`TH` in a `TABLE`) →
   **exact** mapping (`getTableOffset`): counts `|` pipes to find the column, sums line
   lengths above to find the row.
3. **Otherwise** → nearest block element, then **proportional estimate**:
   - sample of `block.textContent`, `md.indexOf(sample)` → `matchIdx` (block start in source),
   - DOM `Range` from block start to caret → `domOffsetInBlock`,
   - `ratio = domOffsetInBlock / domBlockLen`,
   - `return matchIdx + round(ratio * min(blockText.length, md.length - matchIdx))`.

### Port to our fork

**Extension (`src/extension.ts`):**
1. Register `markdown-editor.revealInSource`. Because we use `CustomTextEditorProvider`
   (no `EditorPanel.currentPanel` singleton), track the active panel: store a reference
   on `webviewPanel.onDidChangeViewState` (active) inside `resolveCustomTextEditor`, or
   resolve the target from the command's webview.
2. Send `get-cursor-offset`, await `cursor-offset` (1 s timeout), map offset → line,
   `showTextDocument` Beside + select + reveal. (We already use `vscode.openWith` /
   `showTextDocument` elsewhere.)
3. Add command + a keybinding (scoped `when: activeCustomEditorId == markdown-editor.editor`)
   and optionally an `editor/title` menu entry.

**Webview (`media-src/src/main.ts`):**
4. Port `getCursorTextOffset()` (+ `getTableOffset`, `isBlockEl`, `BLOCK_SAMPLE`).
   Vditor 3.11: `vditor.vditor.ir?.element` — but handle the active mode, not only IR
   (we support IR/WYSIWYG/SV). Use `vditor.vditor[vditor.vditor.currentMode].element`.
5. Handle `get-cursor-offset` → reply `{ command: 'cursor-offset', offset }`.

**Risks / caveats**
- **Approximate for prose** (proportional), exact only for tables — because Markdown
  syntax chars aren't in the rendered DOM. It lands on the right line, not the exact
  column. Fine for "show me this in source"; a char-exact mapping would need positions
  from Lute (the parser), not the DOM.
- The active-webview tracking is the only real architectural difference from notemd
  (they use a singleton; we don't).

---

## Shared mapping (DOM block → source line)

Both features reuse the same trick, worth extracting into one webview helper:
1. Take the first `BLOCK_SAMPLE` chars of a block's `textContent`.
2. `md.indexOf(sample)` to locate where that block starts in the raw Markdown.
3. Count `\n` up to that index → start line; count to the block's end → line span.

Extract `mapBlockToSource(block, md)` and `getCursorTextOffset` into a shared module
(e.g. `media-src/src/source-map.ts`) so gutters and reveal-in-source don't duplicate it.

---

## Implementation order
1. **Reveal-in-Source first** — smaller, self-contained, immediately useful; forces us
   to build the `getCursorTextOffset` mapping that gutters also need.
2. **Git gutters next** — reuses the shared mapping; the work is the diff scheduler
   (extension) + marker rendering/re-render triggers (webview).
3. Manual test in the Extension Development Host (no automated coverage for the
   DOM↔source heuristic — it's webview + git-state dependent). For gutters: edit a
   committed file, confirm bars appear on changed blocks and clear on revert. For
   reveal: place the caret in prose and in a table cell, confirm the source lands on
   the right line.
