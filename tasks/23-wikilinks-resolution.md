# Task: Wikilinks resolution (`[[page-name]]`)

> **Source:** internal plan
> **Derived from (removed plan):** `wikilinks-resolution-plan.md`
> **Value / Risk:** 🟢 feature / medium (rendering pipeline + index freshness)

Single cohesive feature delivered in steps (each step builds the next — not
independently shippable, so kept as one task with an internal checklist).

## Goal
`[[page-name]]` resolves to `page-name.md` in the workspace and becomes a clickable
preview link. Missing/ambiguous targets are surfaced, not failed silently.

## Assumptions
- Wiki pages use lowercase, hyphenated filenames.
- The extension owns link rendering in preview (not the native Markdown renderer alone).
- The primary content set is a folder of `.md` files indexable in the workspace.

## Steps (delivery order)
1. **Syntax + index** — support `[[page-name]]`; normalize identifiers (decide
   case-sensitivity, keep consistent). Scan `.md` folders, map each file to a
   canonical wiki key; keep the index fresh on add/rename/delete; detect duplicate
   keys as conflicts.
2. **Resolver** — `[[name]]` → indexed path; return missing-link / ambiguous-link
   states. Keep isolated so preview, hover, and future rename tools reuse it.
3. **Preview render** — extend the Markdown pipeline (plugin/transform) to rewrite
   wikilinks into clickable links via the resolver; render missing links with a
   visible warning style; leave ordinary Markdown links unchanged.
4. **Navigation + diagnostics** — clicking a resolved link opens the target;
   missing/ambiguous surfaces a useful message; flag unresolved links; show resolved
   path in hover; optional: quick-create a missing page. Optional later:
   Ctrl/Cmd-click jump.
5. **Tests** — normal resolution, missing-link, duplicate conflict, ordinary links
   unchanged, preview with multiple internal links.

## Acceptance criteria
- Preview shows `[[page-name]]` as clickable links.
- Clicking a resolved link opens the correct `.md`.
- Missing links are visible and actionable; duplicates handled deterministically.
- Existing Markdown behavior is not broken.

## Open questions (resolve before implementing)
- Resolve only inside a dedicated wiki folder, or across the whole workspace?
- Support aliases `[[Page Title|page-name]]` now or later?
- Auto-create missing targets, or only surface as diagnostics?

> Note: the repo already has wiki handling (`custom-renderer.ts`, the `wiki` context
> in `extension.ts`). Reconcile this plan with existing behavior before starting.
