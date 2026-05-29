# Plan: outline navigation + heading highlight (all modes)

Adapted from the **`systemator-de/vscode-markdown-editor`** fork. Clicking a heading in
the outline scrolls the editor to that heading and briefly flashes it, so you see where
you landed. Reworked to run in **WYSIWYG, IR, and SV** — systemator-de's version is
**WYSIWYG-only** (they hard-force `mode: 'wysiwyg'`), matches headings by ordinal index,
and miscounts `#` inside fenced code blocks.

---

## What systemator-de does (and its limits)
- Extension sends `{ command: 'revealHeading', headingId: 'heading-{line}-{slug}' }`.
- Webview counts `/^#{1,6}\s+/` lines up to `line`, picks the **Nth `<h1..h6>`** inside
  `.vditor-wysiwyg`, `scrollIntoView({behavior:'smooth',block:'center'})`, adds
  `.outline-highlight` for 1500 ms (CSS keyframe: yellow → transparent).

Limits we fix:
1. **WYSIWYG-only** — hard-codes `.vditor-wysiwyg`; breaks in IR/SV.
2. **Fragile counting** — `#` inside ```` ``` ```` fenced code blocks is counted as a heading.
3. **Hard-coded yellow** — ignores the VS Code theme.

---

## Goal
Outline click → reveal + flash the target heading in **whatever mode is active**
(IR / WYSIWYG / SV), with robust line→heading resolution and a theme-aware flash.

---

## Part A — Outline source (the trigger)

Two options; pick one.

### Option 1 — reuse Vditor's built-in outline  ✅ recommended for "all modes"
We already enable Vditor's `outline` (toolbar entry, `toolbar.ts:171`). **Vditor's own
outline already navigates correctly in every mode** — it knows the heading elements per
mode. So the only thing to add is the **flash**: hook the outline panel's item clicks,
let Vditor scroll, then flash the heading it scrolled to.

- Listen on the outline container (`vditor.vditor.outline.element`) for clicks on items.
- After Vditor scrolls, resolve the landed heading element (the outline item carries the
  target id / element reference) and apply the flash (Part C).
- Zero source-line mapping needed — Vditor handles navigation; we only decorate.

This gets all-mode support essentially for free and is the least fragile path.

### Option 2 — VS Code-side outline (TreeView / DocumentSymbolProvider)
Only if you want headings in VS Code's **native Outline view / breadcrumbs**. A custom
editor is a webview, so VS Code's symbol navigation can't drive it — we must round-trip:
1. Extension parses the document into headings (line numbers) and exposes them via a
   `TreeView` (or `DocumentSymbolProvider` for the Outline view).
2. On click, post `{ command: 'revealHeading', line: N }` (use the **source line** as the
   canonical anchor, not a slug/index).
3. Webview does the mode-aware reveal in **Part B**.

This is the full reimplementation that makes the all-modes work explicit.

---

## Part B — Mode-aware reveal (needed only for Option 2)

```ts
const mode = vditor.vditor.currentMode            // 'wysiwyg' | 'ir' | 'sv'
const el = vditor.vditor[mode]?.element
```

### Resolve the target heading from a source line (code-fence aware)
Count headings up to line `N`, **skipping fenced code blocks**:
```ts
function headingOrdinalForLine(md: string, line: number): number {
  const lines = md.split('\n')
  let inFence = false, ordinal = -1
  for (let i = 0; i <= line && i < lines.length; i++) {
    const t = lines[i]
    if (/^\s*(```|~~~)/.test(t)) { inFence = !inFence; continue }
    if (!inFence && /^#{1,6}\s+/.test(t)) ordinal++
  }
  return ordinal            // 0-based index among real headings
}
```

### WYSIWYG / IR — discrete heading elements
Both render `<h1..h6>` block elements inside their mode element:
```ts
const headings = el.querySelectorAll('h1,h2,h3,h4,h5,h6')
const target = headings[ordinal]
target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
flash(target)                                     // Part C
```

### SV (split) — no discrete heading elements
The SV edit pane holds raw Markdown text; headings aren't separate `<h>` nodes. Strategy:
- Locate the DOM text/line node for source line `N` (Vditor SV wraps lines), place a
  `Range` at its start and `scrollIntoView`.
- Flash is best-effort: if a line-wrapper element exists, flash it; otherwise just scroll
  (no flash). Document this as a known SV limitation rather than forcing wysiwyg.

> Do **not** copy systemator-de's `delete defaultOptions.mode` / `mode:'wysiwyg'` force —
> we keep the user's mode and adapt per `currentMode`.

---

## Part C — The flash (theme-aware, all modes)
Replace the hard-coded yellow with a VS Code theme color so it fits light/dark:
```css
.heading-flash { animation: heading-flash 1.4s ease-out; }
@keyframes heading-flash {
  0%   { background-color: var(--vscode-editor-findMatchHighlightBackground,
                                rgba(255, 213, 0, 0.4)); }
  100% { background-color: transparent; }
}
```
```ts
function flash(elOrNull) {
  if (!elOrNull) return
  elOrNull.classList.add('heading-flash')
  setTimeout(() => elOrNull.classList.remove('heading-flash'), 1400)
}
```

---

## Merge with the outline settings already planned
`outlinePosition` (better-markdown-editor plan §2) and `outlineWidth` /
`showOutlineByDefault` (aqz236 plan §3) configure the **same** outline panel. Implement
the panel config once; this plan adds only the **navigation flash** on top. Reference,
don't duplicate.

Optional new setting: `markdown-editor.outlineHighlight` (boolean, default true) to let
users disable the flash.

---

## Risks / test
- **Option 1** is low risk (Vditor owns navigation; we only decorate) — verify the flash
  triggers in IR, WYSIWYG, and SV.
- **Option 2** is medium (we own navigation): test the code-fence-aware counting (a `#`
  inside a fenced block must NOT shift the target), and the SV scroll path.
- No automated coverage (DOM + mode-dependent); manual test in the Extension Development
  Host across all three modes, including a document with a fenced code block containing `#`.

## Order
1. **Option 1 first** — cheapest path to all-mode support; may be all you need.
2. Only build **Option 2 + Part B** if you want VS Code-native Outline/breadcrumbs.
3. Pull the flash CSS/helper (Part C) from whichever option you pick — it's shared.
