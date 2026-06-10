// Callouts / GitHub Alerts (task 106). Lute renders `> [!NOTE]` as a plain blockquote with a
// literal `[!NOTE]` first line (verified) — no marker/class. So we post-process: detect the
// `[!TYPE]` first line on a rendered blockquote and turn it into a styled callout (CSS does the
// box/icon). Display-only: we ONLY touch non-editable rendered panes (skip `contenteditable`),
// so the markdown source round-trips unchanged.
//
// `matchCallout` is pure (unit-tested); `applyCallouts` needs the DOM (e2e-tested).

export interface Callout {
  type: string
  /** `> [!note]-` (collapsed) / `> [!note]+` (expanded) — Obsidian foldable. */
  foldable: boolean
  open: boolean
  /** Optional title after the marker (`[!NOTE] My title`). */
  title: string
}

// GitHub's 5 alerts + common Obsidian types. Unknown `[!x]` still renders (neutral style).
export const CALLOUT_TYPES = [
  'note',
  'tip',
  'important',
  'warning',
  'caution',
  'info',
  'abstract',
  'todo',
  'success',
  'question',
  'failure',
  'danger',
  'bug',
  'example',
  'quote',
] as const

const MARKER = /^\s*\[!([A-Za-z][\w-]*)\]([-+]?)[ \t]*(.*)$/

/** Parse a blockquote's first line. Returns the callout, or null if it isn't one. */
export function matchCallout(firstLine: string): Callout | null {
  const m = MARKER.exec(firstLine)
  if (!m) return null
  const type = m[1].toLowerCase()
  const fold = m[2]
  return {
    type,
    foldable: fold === '-' || fold === '+',
    open: fold !== '-', // '-' starts collapsed; '+' or none → open
    title: m[3].trim(),
  }
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Turn `[!TYPE]` blockquotes inside `root` into callouts. Idempotent (`data-callout` guard).
 * Skips anything inside a `contenteditable="true"` host so live-edited content (and thus the
 * serialized markdown) is never mutated — we only restyle the rendered/preview DOM.
 */
export function applyCallouts(root: ParentNode | null | undefined): void {
  if (!root || typeof (root as ParentNode).querySelectorAll !== 'function')
    return
  const blockquotes = (root as ParentNode).querySelectorAll(
    'blockquote:not([data-callout])',
  )
  for (const bq of Array.from(blockquotes)) {
    if (bq.closest('[contenteditable="true"]')) continue // never touch editable content
    const p = bq.querySelector(':scope > p') as HTMLElement | null
    if (!p) continue
    // The marker line is the text BEFORE the first <br> (Lute renders `> [!NOTE]\n> body`
    // as `<p>[!NOTE]<br>body</p>`). `textContent` drops the <br>, so walk the nodes.
    const br = p.querySelector(':scope > br')
    let markerLine = ''
    if (br) {
      let n: ChildNode | null = p.firstChild
      while (n && n !== br) {
        markerLine += n.textContent || ''
        n = n.nextSibling
      }
    } else {
      markerLine = p.textContent || ''
    }
    const c = matchCallout(markerLine)
    if (!c) continue

    bq.setAttribute('data-callout', c.type)
    bq.classList.add('vmarkd-callout', `vmarkd-callout--${c.type}`)
    if (c.foldable) {
      bq.setAttribute('data-callout-foldable', c.open ? 'open' : 'closed')
    }

    // Strip the `[!TYPE]…` marker from the first paragraph (up to and including the first <br>),
    // then prepend a title element. Safe: this DOM is non-editable / regenerated from source.
    if (br) {
      let n = p.firstChild
      while (n && n !== br) {
        const next = n.nextSibling
        n.remove()
        n = next
      }
      br.remove()
    } else {
      p.remove() // marker-only line, no body in this <p>
    }

    const title = document.createElement('div')
    title.className = 'vmarkd-callout__title'
    title.textContent = c.title || titleCase(c.type)
    bq.insertBefore(title, bq.firstChild)
  }
}
