# Task: Shared DOM→source mapping module (prerequisite)

> **Source:** `jes-bz/notemd` — shared trick behind both reveal-in-source and gutters
> **Derived from (removed plan):** `notemd-reveal-and-git-gutters-plan.md` (Shared mapping)
> **Value / Risk:** prerequisite / medium (heuristic, approximate for prose)

## Why
Both Reveal-in-Source (`16`) and Git gutters (`17`) need to map a WYSIWYG/IR DOM
position back to a line/offset in the Markdown source. The DOM is not the source
(`**bold**` → `<strong>bold</strong>`, no asterisks), so mapping is:
- **exact for tables** (count `|` pipes per row),
- **approximate for prose** (locate the block's text in the source, then a
  proportional estimate within it).

## Deliverable
Extract into a shared webview module, e.g. `media-src/src/source-map.ts`:

1. **`mapBlockToSource(block, md)`** — block DOM element → source start line + span:
   - take the first `BLOCK_SAMPLE` chars of `block.textContent`,
   - `md.indexOf(sample)` → where the block starts in raw Markdown,
   - count `\n` up to that index → start line; count to block end → line span.
2. **`getCursorTextOffset()`** + helpers `getTableOffset`, `isBlockEl`,
   `BLOCK_SAMPLE` (used by reveal-in-source).
3. Always resolve against the active mode element:
   `vditor.vditor[vditor.vditor.currentMode].element` (not hard-coded `.vditor-ir`).

## See also
- `16-reveal-in-source.md`, `17-git-gutters.md` consume this module.

## Verify
Unit-coverable for the table path (exact); prose path validated indirectly via the
two consumer features.
